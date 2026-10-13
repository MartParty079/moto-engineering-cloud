import { pathToFileURL } from 'node:url';
import { mkdtemp,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:800}}),page=await context.newPage();
const out=await mkdtemp(join(tmpdir(),'moto-prd-browser-')),errors=[];page.on('pageerror',error=>errors.push(error.message));
const ownerA='00000000-0000-4000-8000-000000000001',ownerB='00000000-0000-4000-8000-000000000002',rideId='00000000-0000-4000-8000-000000000003';let owner=ownerA,cloudWrites=0,weatherUnavailable=false;
const gpx='<?xml version="1.0" encoding="UTF-8"?>\r\n<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="fixture"><metadata><name>River &amp; Ridge</name></metadata><wpt lat="0" lon="0"><name>Start</name></wpt><trk><trkseg><trkpt lat="0" lon="0"><ele>0</ele><time>2026-10-08T12:00:00Z</time></trkpt><trkpt lat="0" lon="0.001"><time>2026-10-08T12:00:01Z</time></trkpt></trkseg><trkseg><trkpt lat="30" lon="30"><ele>100</ele></trkpt><trkpt lat="30" lon="30.001"><ele>110</ele></trkpt></trkseg></trk></gpx>';
const samples=Array.from({length:2501},(_,i)=>({id:i,user_id:ownerA,session_id:rideId,latitude:0,longitude:i/100000,altitude_m:i/10,accuracy_m:5,speed_mps:10,recorded_at:new Date(Date.UTC(2026,9,8)+i*1000).toISOString()}));
try{
  await context.addInitScript(()=>localStorage.setItem('moto-startup-permissions-v1',JSON.stringify({location:'granted',motion:'granted'})));
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.hostname==='127.0.0.1'&&url.port==='5173')return route.continue();
    if(url.hostname==='overpass-api.de')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({elements:[{type:'node',id:1,lat:30,lon:-97},{type:'node',id:2,lat:30,lon:-96.999},{type:'node',id:3,lat:30.001,lon:-96.999},{type:'way',id:10,nodes:[1,2,3],tags:{highway:'residential',surface:'asphalt',name:'Test road'}}]})});
    if(url.hostname==='api.open-meteo.com'){
      if(weatherUnavailable)return route.abort();
      const now=Date.now(),start=Math.floor((now-4*86400000)/3600000)*3600,time=Array.from({length:300},(_,i)=>start+i*3600),count=url.searchParams.get('latitude').split(',').length;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Array.from({length:count},()=>({timezone:'America/Chicago',hourly:{time,precipitation:time.map(()=>1),precipitation_probability:time.map(()=>80),temperature_2m:time.map(()=>22),wind_speed_10m:time.map(()=>10)},daily:{time:time.filter((_,i)=>i%24===0),precipitation_sum:time.filter((_,i)=>i%24===0).map(()=>24)}})))});
    }
    if(url.hostname!=='127.0.0.1'||url.port!=='54321')return route.abort();
    const table=url.pathname.split('/').at(-1);if(table==='adventure_routes'&&route.request().method()!=='GET')cloudWrites++;
    const user={id:owner,email:'local@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false,factors:[]};
    let body=table==='user_profiles'?[{user_id:owner,role:'owner',display_name:'Local'}]:table==='feature_flags'?['dashboard','motorcycles','ride_log','maintenance','garage_mode','notebook','project_files'].map(feature_key=>({id:feature_key,feature_key,enabled:true,minimum_role:'rider',release_stage:'production'})):[];
    const headers={'access-control-expose-headers':'content-range'};
    if(table==='ride_sessions')body=owner===ownerA?[{id:rideId,user_id:ownerA,bike_name:'Test ride',status:'complete',started_at:'2026-10-08T00:00:00Z'}]:[];
    if(table==='ride_samples'){
      const start=Number(url.searchParams.get('offset')||0),limit=Math.min(700,Number(url.searchParams.get('limit')||700));body=owner===ownerA?samples.slice(start,start+limit):[];headers['content-range']=`${start}-${start+body.length-1}/${owner===ownerA?samples.length:0}`;
    }
    if(route.request().headers().accept?.includes('vnd.pgrst.object'))body=body[0]||null;
    if(url.pathname==='/auth/v1/user')body=user;
    await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(body)});
  });
  const login=async id=>{
    await page.setViewportSize({width:1280,height:800});owner=id;await page.goto('http://127.0.0.1:5173');
    await page.evaluate(id=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:id,role:'authenticated',aal:'aal1',exp:Math.floor(Date.now()/1000)+3600}))+'.test',refresh_token:'local-test',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id,email:'local@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false}})),id);
    await page.reload();await page.locator('#nav [data-v="routes"]').waitFor();await page.locator('#nav [data-v="routes"]').click();await page.locator('#missionGpxInput').waitFor();
  };
  await login(ownerA);
  await page.locator('#missionGpxInput').setInputFiles({name:'original.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(gpx)});
  await page.locator('#missionSaveGpx').click();await page.locator('.missionSavedRoute').waitFor();
  await page.locator('[data-route-edit]').click();await page.locator('.missionRouteEditor').waitFor();
  await page.locator('.missionRouteEditor [name="reverse"]').check();await page.locator('[data-preview-edit]').click();
  await page.locator('.missionRouteEditor [type="submit"]').click();await page.waitForFunction(()=>document.querySelectorAll('.missionSavedRoute').length===2);
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-route-original]').last().click();assert.equal(await readFile(await (await downloadPromise).path(),'utf8'),gpx);
  await page.locator('[data-route-weather]').last().click();await page.locator('[data-weather-form]').waitFor();await page.locator('[data-weather-form] [type="submit"]').click();await page.getByText('Forecast saved on this device.',{exact:false}).waitFor();
  assert.ok((await page.locator('[data-weather-result]').textContent()).includes('Rolling 72h'));
  weatherUnavailable=true;await page.waitForTimeout(350);await page.locator('[data-weather-form] [type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-weather-status]').textContent.includes('live update unavailable'));
  await page.locator('.missionDisclosure').filter({has:page.locator('#missionOfflineNavigation')}).locator('summary').click();const region=page.locator('[data-region-form]');await region.locator('[name="lat"]').fill('30');await region.locator('[name="lon"]').fill('-97');await region.locator('[name="name"]').fill('Test region');await region.locator('[type="submit"]').click();await page.locator('[data-route-form]').waitFor();
  const routing=page.locator('[data-route-form]');await routing.locator('[name="startLat"]').fill('30');await routing.locator('[name="startLon"]').fill('-97');await routing.locator('[name="endLat"]').fill('30.001');await routing.locator('[name="endLon"]').fill('-96.999');
  await context.setOffline(true);await routing.locator('[type="submit"]').click();await page.getByText('Calculated entirely on this device.',{exact:false}).waitFor();assert.equal(await page.locator('.missionOfflineMap').count(),1);assert.ok((await page.locator('[data-directions]').textContent()).includes('Test road'));await context.setOffline(false);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(out,'preparation-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1280,height:800});await page.locator('#nav [data-v="settings"]').click();await page.locator('#missionDataPreferences form').waitFor();await page.locator('[name="automaticUpload"]').uncheck();await page.locator('[name="detailRides"]').fill('10');await page.locator('#missionDataPreferences [type="submit"]').click();await page.getByText('Preferences saved on this device.',{exact:true}).waitFor();
  await page.reload();await page.locator('[name="automaticUpload"]').waitFor();assert.equal(await page.locator('[name="automaticUpload"]').isChecked(),false);
  await page.locator('#nav [data-v="rides"]').click();await page.locator('.unifiedRideLog [data-ride-session]').click();await page.locator('#missionReviewRide').click();await page.locator('[data-playback]').waitFor();assert.equal(await page.locator('[data-playback]').getAttribute('max'),'2500');await page.locator('[data-playback]').fill('1500');assert.ok((await page.locator('[data-playback-info]').textContent()).includes('22.4 mph'));await page.locator('[data-pin]').check();await page.locator('#missionRideReview [data-close]').click();await page.locator('#closeRideDetail').click();
  await page.locator('#missionRideMode').click();await page.locator('#dashMedia').click();await page.locator('#missionMediaOverlay').waitFor();assert.ok((await page.locator('#missionMediaOverlay').textContent()).includes('Other apps and subscription services are not controlled'));await page.locator('#missionMediaOverlay [data-close]').click();await page.locator('#dashClose').click();
  await login(ownerB);assert.equal(await page.locator('.missionSavedRoute').count(),0);assert.equal(await page.locator('[data-packages] option').count(),1);await page.locator('#nav [data-v="settings"]').click();await page.locator('[name="automaticUpload"]').waitFor();assert.equal(await page.locator('[name="automaticUpload"]').isChecked(),true);
  assert.equal(cloudWrites,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:['immutable edited copies','route weather and outage cache','offline OSM network routing','mobile preparation layout','optional cloud upload preferences','full ride playback','media capability fallback','account isolation'],screenshots:out,errors}));
}catch(error){console.log(await page.locator('#main').textContent());console.log({errors});throw error}finally{await context.close();await browser.close()}
