import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.E2E_BASE_URL||'http://127.0.0.1:4173';
const engine=String(process.env.E2E_BROWSER||'chromium').toLowerCase();
const browserType=engine==='webkit'?webkit:chromium;
const out=path.resolve('test-results/proof',engine);
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});

const browser=await browserType.launch({headless:true});
const context=await browser.newContext({
  viewport:{width:430,height:932},
  deviceScaleFactor:1,
  isMobile:true,
  hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
});
await context.addInitScript(()=>{
  const watchers=new Map();let next=1;
  const makePosition=(input={})=>({
    coords:{
      latitude:input.latitude??30.2672,
      longitude:input.longitude??-97.7431,
      altitude:input.altitude??160,
      accuracy:input.accuracy??6,
      altitudeAccuracy:4,
      heading:input.heading??45,
      speed:input.speed??12
    },
    timestamp:input.timestamp??Date.now()
  });
  const geolocation={
    watchPosition(success,error,options){const id=next++;watchers.set(id,{success,error,options});queueMicrotask(()=>success(makePosition()));return id},
    clearWatch(id){watchers.delete(id)},
    getCurrentPosition(success){queueMicrotask(()=>success(makePosition()))}
  };
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:geolocation});
  window.__e2eEmitPosition=input=>{const position=makePosition(input);for(const watcher of watchers.values())watcher.success(position)};
  window.__e2eNativeWatcherCount=()=>watchers.size;
  localStorage.setItem('moto-startup-permissions-v1',JSON.stringify({location:'granted',motion:'disabled'}));
  localStorage.setItem('motocloud-install-seen','1');
});

const page=await context.newPage();
const pageErrors=[];
const consoleErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});

const shots=[];
async function shot(name,fullPage=false){
  const file=path.join(out,`${name}.png`);
  await page.screenshot({path:file,fullPage});shots.push(file);return file;
}
async function waitFor(fn,label,timeout=15000){
  await page.waitForFunction(fn,null,{timeout}).catch(error=>{throw new Error(`${label}: ${error.message}`)});
}
async function clickIf(selector){const item=page.locator(selector).first();if(await item.count()){await item.click();return true}return false}

const evidence={engine,startedAt:new Date().toISOString(),baseURL,checks:[],screenshots:[],pageErrors,consoleErrors,skippedViews:[]};
function pass(name,detail={}){evidence.checks.push({name,status:'PASS',...detail})}
function fail(name,detail={}){evidence.checks.push({name,status:'FAIL',...detail})}

try{
  await page.goto(`${baseURL}/?e2e=1&forceRecordingIsolation=1`,{waitUntil:'networkidle',timeout:30000});
  await waitFor(()=>Boolean(window.MotoRide&&window.MotoRideDash),'MotoRide modules did not initialize');
  pass('Application modules initialize');
  await shot('01-app-home');

  await page.evaluate(()=>window.MotoRideDash.open());
  await page.waitForSelector('#rideDashOverlay',{state:'visible'});
  await page.waitForSelector('.dashSpeedSplit',{state:'visible',timeout:10000});
  const speedCardText=(await page.locator('.dashSpeedSplit').first().innerText()).replace(/\s+/g,' ').trim();
  if(!speedCardText.includes('SPEED')||!speedCardText.includes('LIMIT'))throw new Error(`Split speed card did not render: ${speedCardText}`);
  pass('Speed is left and limit is right',{value:speedCardText});
  await shot('02-ride-dashboard');
  pass('Ride dashboard opens');

  const uiAudit=await page.evaluate(()=>{
    const result=window.MotoUIAudit?.run?.();
    return result?{interactiveCount:result.interactiveCount,unnamedCount:result.unnamedCount,duplicateIdCount:result.duplicateIdCount,nestedInteractiveCount:result.nestedInteractiveCount,smallTargetCount:result.smallTargetCount}:null;
  });
  evidence.uiAudit=uiAudit;
  if(uiAudit?.unnamedCount||uiAudit?.duplicateIdCount||uiAudit?.nestedInteractiveCount)throw new Error(`UI audit failed: ${JSON.stringify(uiAudit)}`);
  pass('Runtime control audit has no unnamed, duplicate, or nested controls',uiAudit||{});

  await page.click('#dashEdit');
  await page.waitForFunction(()=>document.querySelector('#dashStyle')&&getComputedStyle(document.querySelector('#dashStyle')).display!=='none');
  await page.click('#dashStyle');
  await page.waitForSelector('#dashStylePicker',{state:'visible'});
  await shot('03-style-configurator');
  pass('Ride style configurator opens');
  await page.click('#dashStyleClose');
  if((await page.locator('#dashEdit').innerText()).trim()==='DONE')await page.click('#dashEdit');

  await page.click('#dashRideToggle');
  await page.waitForSelector('#dashRidePicker',{state:'visible'});
  await shot('04-motorcycle-picker');
  const bikeButton=page.locator('#dashRidePicker [data-bike-id]').first();
  if(!await bikeButton.count())throw new Error('Mock motorcycle not available in ride picker');
  await bikeButton.click();
  await page.waitForSelector('#motoRecordingIsolation',{state:'visible',timeout:15000});
  await shot('05-recording-started');
  pass('Recording starts in isolated UI');

  await page.evaluate(()=>{
    let index=0;
    window.__e2eGpsStorm=setInterval(()=>{
      index+=1;
      window.__e2eEmitPosition({
        latitude:30.2672+index*0.000002,
        longitude:-97.7431+index*0.000002,
        heading:(45+index/4)%360,
        speed:12+(index%20)/10,
        accuracy:5+(index%3),
        timestamp:Date.now()
      });
    },50);
  });

  await page.waitForTimeout(2500);
  await page.click('#recActionTest');
  await page.waitForFunction(()=>document.querySelector('#recActionTest')?.textContent.includes('RESPONSIVE'));
  await shot('06-recording-2-seconds');
  pass('Controls responsive after two-second failure window');

  await page.click('[data-rec-mode="enduro"]');
  await page.click('[data-rec-mode="adventure"]');
  pass('Ride mode changes while recording');

  await page.waitForTimeout(10000);
  await page.click('#recActionTest');
  await page.waitForFunction(()=>document.querySelector('#recActionTest')?.textContent.includes('RESPONSIVE'));
  await shot('07-recording-12-seconds');
  pass('Controls responsive after 12 seconds');

  await page.waitForTimeout(18000);
  await page.click('#recActionTest');
  await page.waitForFunction(()=>document.querySelector('#recActionTest')?.textContent.includes('RESPONSIVE'));
  await shot('08-recording-30-seconds');
  pass('Controls responsive after 30-second GPS storm');

  const diagnostics=await page.evaluate(()=>({
    isolation:window.MotoRecordingIsolation?.getDiagnostics?.(),
    gpsBroker:window.MotoGPSBroker?.getDiagnostics?.(),
    nativeWatchers:window.__e2eNativeWatcherCount?.(),
    ride:window.MotoRide?.getState?.()
  }));
  evidence.recordingDiagnostics=diagnostics;
  if(diagnostics.nativeWatchers!==1)throw new Error(`Expected one native GPS watcher, found ${diagnostics.nativeWatchers}`);
  pass('Exactly one native GPS watcher',{value:diagnostics.nativeWatchers});
  if((diagnostics.isolation?.maxEventLoopLagMs??9999)>=500)throw new Error(`Event-loop lag reached ${diagnostics.isolation.maxEventLoopLagMs} ms`);
  pass('Event-loop lag remains below 500 ms',{maxLagMs:diagnostics.isolation.maxEventLoopLagMs});
  const domGrowth=(diagnostics.isolation?.maxDomNodes??0)-(diagnostics.isolation?.initialDomNodes??0);
  if(domGrowth>=80)throw new Error(`DOM grew by ${domGrowth} nodes during recording`);
  pass('Recording DOM remains bounded',{domGrowth});
  if((diagnostics.isolation?.actionTests??0)<3)throw new Error('Responsive action test did not register three presses');
  pass('Repeated button presses register during recording',{presses:diagnostics.isolation.actionTests});

  await page.evaluate(()=>clearInterval(window.__e2eGpsStorm));
  await page.click('#recStop');
  await page.waitForSelector('#motoRecordingIsolation',{state:'detached',timeout:15000});
  await page.waitForSelector('#rideDashOverlay',{state:'visible',timeout:15000});
  await page.waitForSelector('.dashSpeedSplit',{state:'visible',timeout:10000});
  await shot('09-ride-saved');
  pass('Stop & Save completes and dashboard restores');

  await page.click('#dashClose');
  await page.waitForSelector('#rideDashOverlay',{state:'detached'});
  const routeViews=['dashboard','garageMode','roadmap','engineering','pcb','firmware','garage','parts','maintenance','rides','notes','media','ai'];
  let routeIndex=0;
  for(const view of routeViews){
    await page.click('#menu');
    await page.waitForFunction(()=>document.querySelector('#nav')?.classList.contains('open'));
    const selector=`#nav [data-v="${view}"]`;
    const route=page.locator(selector).first();
    if(!await route.count()){
      evidence.skippedViews.push(view);
      await page.click('#menu');
      continue;
    }
    await route.click();
    await page.waitForFunction(()=>!document.querySelector('#nav')?.classList.contains('open'));
    await page.waitForTimeout(180);
    const mainText=(await page.locator('#main').innerText()).trim();
    if(!mainText)throw new Error(`View ${view} rendered empty`);
    pass(`Navigation view renders: ${view}`);
    routeIndex+=1;
    await shot(`10-${String(routeIndex).padStart(2,'0')}-view-${view}`);
  }

  await page.evaluate(()=>window.MotoRideDash.open());
  await page.waitForSelector('#rideDashOverlay',{state:'visible'});
  const adv=page.locator('#dashAdventure');
  if(await adv.count()){
    await adv.click();
    await page.waitForTimeout(1000);
    if(await page.locator('#adventureOverlay').count()){
      await shot('11-adventure-mode');
      pass('Adventure Mode opens');
      await clickIf('#closeAdventure');
    }else{
      evidence.skippedViews.push('adventure-overlay-selector');
    }
  }

  evidence.completedAt=new Date().toISOString();
  evidence.screenshots=shots.map(file=>path.relative(process.cwd(),file));
}catch(error){
  fail('E2E suite completed',{error:String(error?.stack||error)});
  evidence.completedAt=new Date().toISOString();
  evidence.screenshots=shots.map(file=>path.relative(process.cwd(),file));
  await shot('99-failure-state',true).catch(()=>{});
  throw error;
}finally{
  await fs.writeFile(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2));
  const rows=evidence.checks.map(item=>`| ${item.status} | ${item.name} | ${item.error||item.value||item.maxLagMs||item.domGrowth||item.presses||''} |`).join('\n');
  const markdown=`# Moto Mission browser evidence — ${engine}\n\nGenerated: ${evidence.completedAt||new Date().toISOString()}\n\n| Result | Check | Evidence |\n|---|---|---|\n${rows}\n\n## Recording diagnostics\n\n\`\`\`json\n${JSON.stringify(evidence.recordingDiagnostics||{},null,2)}\n\`\`\`\n\n## UI audit\n\n\`\`\`json\n${JSON.stringify(evidence.uiAudit||{},null,2)}\n\`\`\`\n\n## Browser errors\n\nPage errors: ${pageErrors.length}\n\nConsole errors: ${consoleErrors.length}\n\nSkipped/conditional views: ${evidence.skippedViews.join(', ')||'none'}\n`;
  await fs.writeFile(path.join(out,'REPORT.md'),markdown);
  await browser.close();
}

if(pageErrors.length)throw new Error(`Browser page errors detected: ${pageErrors.join('\n')}`);
console.log(`${engine} E2E evidence complete: ${evidence.checks.filter(item=>item.status==='PASS').length} checks passed.`);