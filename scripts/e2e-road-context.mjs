import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.E2E_BASE_URL||'http://127.0.0.1:4173';
const engine=String(process.env.E2E_BROWSER||'chromium').toLowerCase();
const browserType=engine==='webkit'?webkit:chromium;
const out=path.resolve('test-results/proof',engine);
await fs.mkdir(out,{recursive:true});
const browser=await browserType.launch({headless:true});
const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'});
await context.addInitScript(()=>{
  const position={coords:{latitude:30.2672,longitude:-97.7431,altitude:160,accuracy:6,heading:45,speed:22},timestamp:Date.now()};
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(success){queueMicrotask(()=>success(position));return 1},clearWatch(){},getCurrentPosition(success){queueMicrotask(()=>success(position))}}});
  localStorage.setItem('moto-startup-permissions-v1',JSON.stringify({location:'granted',motion:'disabled'}));
  localStorage.setItem('motocloud-install-seen','1');
});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
let requests=0;
await page.route('**/api/road-info**',async route=>{
  requests+=1;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({road:'Congress Avenue',limit:{mph:35},source:'OpenStreetMap',roadClass:'primary',surface:'asphalt',lanes:4,confidence:.94})});
});
let evidence={engine,requests,errors};
try{
  await page.goto(`${baseURL}/?e2e=1&forceRecordingIsolation=1`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>Boolean(window.MotoRecordingIsolation&&window.MotoRecorderRoadContext),null,{timeout:15000});

  const parserProof=await page.evaluate(()=>{
    const service=window.MotoRecorderRoadContext;
    return {
      kmh:service.parseLimit('50 km/h'),
      object:service.parseLimit({value:55,unit:'mph'}),
      estimated:service.parseLimit('≈ 45 mph'),
      missing:service.normalize({}),
      zero:service.parseLimit(0),
      absurd:service.parseLimit(180)
    };
  });
  if(parserProof.kmh?.mph!==31)throw new Error(`50 km/h conversion failed: ${JSON.stringify(parserProof.kmh)}`);
  if(parserProof.object?.mph!==55)throw new Error(`Object limit parsing failed: ${JSON.stringify(parserProof.object)}`);
  if(parserProof.estimated?.mph!==45||!parserProof.estimated?.estimated)throw new Error(`Estimated limit parsing failed: ${JSON.stringify(parserProof.estimated)}`);
  if(parserProof.missing.limit_mph!==undefined)throw new Error(`Missing limit was not undefined: ${JSON.stringify(parserProof.missing)}`);
  if(parserProof.zero!==null||parserProof.absurd!==null)throw new Error('Invalid speed limits were accepted');

  await page.evaluate(()=>window.MotoRecordingIsolation.forceStart({speedMph:48,bikeName:'Road Context Test'}));
  await page.waitForSelector('#motoRecordingIsolation',{state:'visible',timeout:10000});
  const initialTopLimit=await page.locator('#recLimit').innerText();
  if(initialTopLimit==='0')throw new Error('Missing limit rendered as 0 MPH before lookup');

  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('moto-gps-fix',{detail:{latitude:30.2672,longitude:-97.7431,altitude:160,accuracy:6,heading:45,speed:48,timestamp:Date.now()}})));
  await page.waitForSelector('#recRoadContext',{state:'visible',timeout:10000});
  await page.waitForFunction(()=>document.querySelector('#recRoadName')?.textContent.includes('CONGRESS'),null,{timeout:10000});
  const road=await page.locator('#recRoadName').innerText();
  const limit=await page.locator('#recRoadLimitValue').innerText();
  const meta=await page.locator('#recRoadMeta').innerText();
  const limitMeta=await page.locator('#recRoadLimitMeta').innerText();
  const cacheRows=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('moto-road-context-cache-v45')||'{}')).length);
  const topLimit=await page.locator('#recLimit').innerText();
  const topState=await page.locator('#recLimitState').innerText();
  evidence={engine,road,limit,meta,limitMeta,topLimit,topState,initialTopLimit,parserProof,requests,cacheRows,errors,roadState:await page.evaluate(()=>window.MotoRecorderRoadContext?.getState?.())};
  if(road!=='CONGRESS AVENUE')throw new Error(`Unexpected road: ${road}`);
  if(limit!=='35'||topLimit!=='35')throw new Error(`Speed-limit displays disagree: road=${limit}, primary=${topLimit}`);
  if(!/OPENSTREETMAP/i.test(meta))throw new Error(`Missing provider source: ${meta}`);
  if(!limitMeta.includes('OVER')||!topState.includes('OVER'))throw new Error(`Overspeed state missing: road=${limitMeta}, primary=${topState}`);
  if(requests!==1)throw new Error(`Expected one bounded road request, got ${requests}`);
  if(cacheRows<1)throw new Error('Road context was not cached');
  if(errors.length)throw new Error(`Browser errors: ${errors.join(' | ')}`);
  await page.screenshot({path:path.join(out,'road-context-v46.png'),fullPage:true});
  await fs.writeFile(path.join(out,'road-context-v46.json'),JSON.stringify({...evidence,status:'PASS'},null,2));
  console.log(`${engine}: speed-limit parsing, zero regression, synchronized displays, overspeed and cache checks passed.`);
}catch(error){
  evidence={...evidence,status:'FAIL',error:String(error?.stack||error),requests,errors,html:await page.locator('body').innerText().catch(()=>''),roadState:await page.evaluate(()=>window.MotoRecorderRoadContext?.getState?.()).catch(()=>null)};
  await page.screenshot({path:path.join(out,'road-context-v46-failure.png'),fullPage:true}).catch(()=>{});
  await fs.writeFile(path.join(out,'road-context-v46.json'),JSON.stringify(evidence,null,2));
  throw error;
}finally{
  await browser.close();
}