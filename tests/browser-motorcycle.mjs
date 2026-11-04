import {pathToFileURL} from 'node:url';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined});
const context = await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
const page = await context.newPage(), errors = [], out = await mkdtemp(join(tmpdir(),'moto-motorcycle-'));
page.on('pageerror',error => errors.push(error.message));
const ownerA='00000000-0000-4000-8000-000000000001', ownerB='00000000-0000-4000-8000-000000000002';
const bikes=[{id:'00000000-0000-4000-8000-000000000003',user_id:ownerA,name:'Honda CRF450RL',odometer:20},{id:'00000000-0000-4000-8000-000000000004',user_id:ownerA,name:'BMW F800GS — a long motorcycle name for backcountry travel',odometer:30}];
let owner=ownerA, removed=false, writes=0;
try {
  await context.addInitScript(() => {
    localStorage.setItem('moto-startup-permissions-v1',JSON.stringify({location:'granted',motion:'granted'}));
    Object.defineProperties(navigator.geolocation,{
      getCurrentPosition:{configurable:true,value(){}},
      watchPosition:{configurable:true,value(){return 1;}},
      clearWatch:{configurable:true,value(){}}
    });
  });
  await context.route('**/*',async route => {
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1' && url.port==='5173') return route.continue();
    if(url.hostname!=='127.0.0.1' || url.port!=='54321') return route.abort();
    if(route.request().method()!=='GET'){writes++;return route.fulfill({status:503,contentType:'application/json',body:'{"message":"Offline test backend"}'});}
    const table=url.pathname.split('/').at(-1);
    let body=table==='bikes'?(owner===ownerA?(removed?bikes.slice(0,1):bikes):[]):table==='user_profiles'?[{user_id:owner,role:'rider',display_name:'Test rider'}]:table==='feature_flags'?['dashboard','motorcycles','ride_log','maintenance','garage_mode','notebook','project_files'].map(feature_key=>({id:feature_key,feature_key,enabled:true,minimum_role:'rider',release_stage:'production'})):[];
    if(route.request().headers().accept?.includes('vnd.pgrst.object'))body=body[0]||null;
    if(url.pathname==='/auth/v1/user')body={id:owner,email:'local@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false,factors:[]};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const login=async id => {
    owner=id;await page.goto('http://127.0.0.1:5173');
    await page.evaluate(id=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:id,role:'authenticated',aal:'aal1',exp:Math.floor(Date.now()/1000)+3600}))+'.test',refresh_token:'local-test',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id,email:'local@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false}})),id);
    await page.reload();await page.locator('#missionMotorcycle').waitFor();
    await page.waitForFunction(expected=>window.MotoRide?.getBikes().length===expected,id===ownerA?(removed?1:2):0);
  };
  await login(ownerA);
  await page.waitForFunction(()=>window.MotoRide?.getActiveBike()?.id.endsWith('003'));
  await page.locator('#missionMotorcycle').click();
  await page.locator('[data-search]').fill('BMW');
  assert.equal(await page.locator('[data-select-bike]:visible').count(),1);
  await page.locator(`[data-select-bike="${bikes[1].id}"]`).click();
  await page.waitForFunction(()=>!document.querySelector('#motorcycleSelector'));
  for(const view of ['routes','rides','garage','settings','dashboard']){
    await page.locator(`#nav [data-v="${view}"]`).click();
    assert.equal(await page.locator('#missionMotorcycle').textContent(),bikes[1].name);
  }
  await page.reload();await page.waitForFunction(()=>window.MotoRide?.getActiveBike()?.id.endsWith('004'));
  await page.evaluate(async()=>{const {missionStore}=await import('/src/rider-preferences.js');window.restoreMotorcycleStorage=missionStore.put;missionStore.put=async()=>{throw new Error('Local storage test failure');};});
  await page.locator('#missionMotorcycle').click();await page.locator(`[data-select-bike="${bikes[0].id}"]`).click();
  assert.equal(await page.locator('[data-status]').textContent(),'Local storage test failure');
  assert.equal(await page.evaluate(()=>window.MotoRide.getActiveBike().id),bikes[1].id,'A failed save must not advertise a new motorcycle');
  await page.evaluate(async()=>{const {missionStore}=await import('/src/rider-preferences.js');missionStore.put=window.restoreMotorcycleStorage;});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#motorcycleSelector'));
  await page.locator('#nav [data-v="routes"]').click();await page.locator('#missionGpxInput').waitFor();
  const fileInput=await page.locator('#missionGpxInput').elementHandle();
  await page.locator('#missionMotorcycle').click();await page.keyboard.press('Escape');
  assert.equal(await fileInput.evaluate(node=>node===document.querySelector('#missionGpxInput')),true,'Opening and closing selection preserves the route workspace');
  for(const width of [1280,390,320]){
    await page.setViewportSize({width,height:844});
    await page.waitForTimeout(300); // Existing shell deliberately suppresses repeated taps within 280 ms.
    await page.waitForFunction(()=>{const node=document.querySelector('#missionMotorcycle');return node && node.getBoundingClientRect().height>=44;});
    const box=await page.locator('#missionMotorcycle').boundingBox();assert.ok(box.width>=44 && box.height>=44,JSON.stringify({width,box,styles:await page.locator('#missionMotorcycle').evaluate(node=>({font:getComputedStyle(node).font,minHeight:getComputedStyle(node).minHeight,transform:getComputedStyle(node).transform}))}));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.locator('#missionMotorcycle').click();await page.locator('#motorcycleSelector[open]').waitFor();await page.screenshot({path:join(out,`selector-${width}.png`),fullPage:true});await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:390,height:844});
  for(const theme of ['dark','light']){
    if(await page.locator('html').getAttribute('data-theme')!==theme){await page.locator('[data-theme-toggle]').first().click();await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);}
    await page.waitForTimeout(300);
    await page.locator('#missionMotorcycle').click();await page.locator('#motorcycleSelector[open]').waitFor();
    assert.ok(await page.locator('[data-select-bike]').first().evaluate(node=>{
      const luminance=color=>(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((total,n,i)=>total+n*[.2126,.7152,.0722][i],0);
      const style=getComputedStyle(node),a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;
    }),'Motorcycle choices remain readable in each appearance');
    await page.screenshot({path:join(out,`selector-${theme}.png`),fullPage:true});await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:1280,height:900});await page.locator('#missionRideMode').click();
  assert.equal(await page.locator('#dashMotorcycle').textContent(),bikes[1].name);
  await page.locator('#dashRideToggle').click();
  assert.equal(await page.locator('#dashRidePicker [data-bike-id]').first().getAttribute('data-bike-id'),bikes[1].id);
  await page.locator('#dashRidePickerClose').click();
  await page.evaluate(id=>window.MotoRide.start(id),bikes[1].id);
  const sessionId=await page.evaluate(()=>window.MotoRide.getState().sessionId);
  for(const state of ['recording','paused']){
    if(state==='paused')await page.evaluate(()=>window.MotoRide.pause());
    await page.waitForTimeout(300);
    await page.locator('#dashMotorcycle').click();
    assert.equal(await page.locator('#motorcycleSelector').count(),1,JSON.stringify(await page.evaluate(()=>({bikes:window.MotoRide.getBikes(),ride:window.MotoRide.getState(),chip:document.querySelector('#dashMotorcycle')?.outerHTML,dialogs:[...document.querySelectorAll('dialog')].map(d=>d.outerHTML)}))));
    await page.locator(`[data-select-bike="${bikes[0].id}"]`).click();
    assert.match(await page.locator('[data-status]').textContent(),/Finish or recover/);
    assert.equal(await page.evaluate(()=>window.MotoRide.getState().sessionId),sessionId);
    assert.equal(await page.evaluate(()=>window.MotoRide.getState().bikeId),bikes[1].id);
    if(state==='recording')await page.screenshot({path:join(out,'recording-motorcycle.png'),fullPage:true});
    await page.keyboard.press('Escape');
  }
  await page.reload();await page.waitForFunction(()=>window.MotoRide?.getState().status==='paused');
  assert.equal(await page.evaluate(()=>window.MotoRide.selectBike('missing').then(()=>'',e=>e.message)),'Choose a motorcycle from your garage.');
  assert.match(await page.evaluate(id=>window.MotoRide.selectBike(id).then(()=>'',e=>e.message),bikes[0].id),/Finish or recover/);
  await page.locator('#missionMotorcycle').click();await page.locator('#motorcycleSelector[open]').waitFor();
  owner=ownerB;
  await page.evaluate(async id=>{
    const {supabase}=await import('/src/supabase.js');
    const token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:id,role:'authenticated',aal:'aal1',exp:Math.floor(Date.now()/1000)+3600}))+'.test';
    const {error}=await supabase.auth.setSession({access_token:token,refresh_token:'local-test'});
    if(error)throw error;
  },ownerB);
  await page.waitForFunction(()=>!document.querySelector('#motorcycleSelector'));
  await page.waitForFunction(()=>window.MotoRide.getBikes().length===0 && window.MotoRide.getState().sessionId===null);
  assert.equal(await page.evaluate(()=>window.MotoRide.getActiveBike()),null);
  await page.locator('#missionMotorcycle').click();assert.equal(await page.locator('[data-select-bike]').count(),0);await page.keyboard.press('Escape');
  await login(ownerA);await page.waitForFunction(()=>window.MotoRide?.getState().status==='paused');
  assert.equal(await page.evaluate(()=>window.MotoRide.getActiveBike().id),bikes[1].id);
  await page.evaluate(async()=>{await window.MotoRide.discard();});
  removed=true;await page.evaluate(()=>window.MotoRide.refresh());
  assert.equal(await page.evaluate(()=>window.MotoRide.getActiveBike().id),bikes[0].id);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:['selector search and primary screens','reload persistence','storage failure preserves selection','route form preservation','desktop/390/320px layout','cockpit and start picker','recording/paused/recovered bike guard','live account transition closes picker','account isolation','removed bike fallback'],screenshots:out,errors,blockedMockWrites:writes}));
}finally{await context.close();await browser.close();}
