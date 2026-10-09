import { pathToFileURL } from 'node:url';
import { mkdtemp,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:800}}),page=await context.newPage();
const out=await mkdtemp(join(tmpdir(),'moto-gpx-browser-')),errors=[];page.on('pageerror',error=>errors.push(error.message));
const ownerA='00000000-0000-4000-8000-000000000001',ownerB='00000000-0000-4000-8000-000000000002',rideId='00000000-0000-4000-8000-000000000003';let owner=ownerA,cloudWrites=0;
const gpx='<?xml version="1.0" encoding="UTF-8"?>\r\n<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="fixture"><metadata><name>River &amp; Ridge</name></metadata><wpt lat="0" lon="0"><name>Start</name></wpt><trk><trkseg><trkpt lat="0" lon="0"><ele>0</ele><time>2026-10-08T12:00:00Z</time></trkpt><trkpt lat="0" lon="0.001"><time>2026-10-08T12:00:01Z</time></trkpt></trkseg><trkseg><trkpt lat="30" lon="30"><ele>100</ele></trkpt><trkpt lat="30" lon="30.001"><ele>110</ele></trkpt></trkseg></trk></gpx>';
const samples=Array.from({length:2501},(_,i)=>({id:i,user_id:ownerA,session_id:rideId,latitude:0,longitude:i/100000,altitude_m:i===0?0:null,recorded_at:new Date(Date.UTC(2026,9,8)+i*1000).toISOString()}));
try{
  await context.addInitScript(()=>localStorage.setItem('moto-startup-permissions-v1',JSON.stringify({location:'granted',motion:'granted'})));
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.hostname==='127.0.0.1'&&url.port==='5173')return route.continue();
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
  const parserChecks=await page.evaluate(async source=>{
    const {parseGPX}=await import('/src/gpx.js');
    const invalid=[source.replace('lat="0"','lat="91"'),source.replace('lat="0"','lat=""'),source.replace('lat="0"',''),'<not-gpx/>','<!DOCTYPE gpx [<!ENTITY x "bad">]><gpx/>'];
    const rejected=invalid.map(s=>{try{parseGPX(s);return false}catch{return true}});
    const prefixed=source.replace(/xmlns="/,'xmlns:p="').replace(/<(\/?)(gpx|metadata|name|wpt|trk|trkseg|trkpt|ele|time)(?=[\s>])/g,'<$1p:$2');
    const parsed=parseGPX(prefixed);return{rejected,count:parsed.pointCount,segments:parsed.segments.length,distance:parsed.distanceMiles,zeroElevation:parsed.segments[0][0].ele};
  },gpx);
  assert.deepEqual(parserChecks.rejected,[true,true,true,true,true]);assert.equal(parserChecks.count,4);assert.equal(parserChecks.segments,2);assert.ok(parserChecks.distance<1,'Do not connect separate GPX segments');assert.equal(parserChecks.zeroElevation,0);
  await page.locator('#missionGpxInput').setInputFiles({name:'original.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(gpx)});
  await page.locator('#missionSaveGpx').waitFor();assert.equal(await page.locator('#missionGpxPreview polyline').count(),2);
  await page.screenshot({path:join(out,'import-desktop.png'),fullPage:true});
  await page.locator('#missionSaveGpx').click();await page.locator('.missionSavedRoute').waitFor();
  await page.reload();await page.locator('.missionSavedRoute').waitFor();
  const originalDownload=page.waitForEvent('download');await page.locator('[data-route-original]').click();const original=await originalDownload;assert.equal(await readFile(await original.path(),'utf8'),gpx);
  await page.locator('#missionRouteSearch').fill('Start');assert.equal(await page.locator('.missionSavedRoute').count(),1);
  await page.setViewportSize({width:390,height:844});await page.locator('[data-route-preview]').click();await page.locator('#missionGpxPreview svg').waitFor();assert.equal(await page.locator('#missionGpxPreview polyline').count(),2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:join(out,'library-mobile.png'),fullPage:true});
  // A test renderer records calls; no real tile/provider or map capability is implied.
  await page.evaluate(()=>{
    window.testTrackLines=[];const layer=()=>({addTo(){return this},clearLayers(){},getBounds(){return{}},bindPopup(){return this}});
    const map={setView(){return this},on(){return this},eachLayer(){},invalidateSize(){},removeLayer(){},hasLayer(){return false},fitBounds(){},remove(){},panTo(){}};
    window.L={map:()=>map,tileLayer:()=>layer(),layerGroup:()=>layer(),marker:()=>layer(),divIcon:()=>({}),polyline:points=>{window.testTrackLines.push(points);return layer()}};
  });
  await page.locator('[data-route-map]').click();await page.waitForFunction(()=>window.testTrackLines.length>0);assert.equal(await page.evaluate(()=>window.testTrackLines.at(-1).length),2);
  await page.locator('#closeAdventure').click();
  assert.equal(cloudWrites,0,'GPX imports must not write cloud routes');
  await login(ownerB);assert.equal(await page.locator('.missionSavedRoute').count(),0,'A different account cannot see originals');
  await login(ownerA);await page.locator('.missionSavedRoute').waitFor();
  await page.setViewportSize({width:1280,height:800});await page.locator('#nav [data-v="rides"]').click();await page.locator('.unifiedRideLog [data-ride-session]').click();await page.locator('#downloadRideGpx').waitFor();
  const rideDownload=page.waitForEvent('download');await page.locator('#downloadRideGpx').click();const downloadedRide=await rideDownload;const exported=await readFile(await downloadedRide.path(),'utf8');
  assert.equal((exported.match(/<trkpt /g)||[]).length,2501);assert.match(exported,/<ele>0<\/ele>/);
  const roundtrip=await page.evaluate(async source=>{const {parseGPX}=await import('/src/gpx.js');const p=parseGPX(source);return{count:p.pointCount,first:p.segments[0][0].time,last:p.segments[0].at(-1).time}},exported);
  assert.equal(roundtrip.count,2501);assert.equal(roundtrip.first,samples[0].recorded_at);assert.equal(roundtrip.last,samples.at(-1).recorded_at);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:['strict GPX validation','namespaced GPX','segment preservation','original download exact bytes','IndexedDB reload','account isolation','mobile preview','local map geometry adapter','full paginated recorded export'],screenshots:out,cloudWrites,errors}));
}catch(error){console.log(await page.evaluate(()=>({status:document.querySelector('#rideGpxStatus')?.textContent,main:document.querySelector('#main')?.textContent})));console.log({errors});throw error}finally{await context.close();await browser.close()}
