import {pathToFileURL} from 'node:url';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const assets=process.env.MOTO_MAP_TEST_ASSETS;
const renderer=assets?await readFile(join(assets,'leaflet.js'),'utf8'):null;
const rendererCSS=assets?await readFile(join(assets,'leaflet.css'),'utf8'):null;
const out=await mkdtemp(join(tmpdir(),'moto-ui-007-'));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:393,height:852},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1'});
const page=await context.newPage(),errors=[],transitions=[];page.on('pageerror',error=>errors.push(error.message));
const owner='00000000-0000-4000-8000-000000000001',bike={id:'00000000-0000-4000-8000-000000000003',user_id:owner,name:'Honda CRF450RL',year:2022,make:'Honda',model:'CRF450RL',odometer:100};
let weatherCalls=0,weatherFailure=false,radarCalls=0;
const tile='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e1e7d8"/><g fill="none" stroke="#b8c7ac"><path d="M-20 40Q100 10 280 100M-20 60Q100 30 280 120M-20 80Q100 50 280 140M-20 100Q100 70 280 160M-20 120Q100 90 280 180M-20 140Q100 110 280 200M-20 160Q100 130 280 220"/></g><path d="M0 250Q60 200 100 160T256 0" fill="none" stroke="#fff" stroke-width="9"/><text x="10" y="240" font-size="10" fill="#53684f">SYNTHETIC MAP FIXTURE</text></svg>';
try{
  await context.addInitScript(()=>{
    localStorage.setItem('moto-startup-permissions-v1',JSON.stringify({location:'granted',motion:'granted'}));
    localStorage.setItem('motocloud-install-seen','1');
    let callback;
    const point=()=>({timestamp:Date.now(),coords:{latitude:30,longitude:-97,accuracy:5,speed:10,heading:90,altitude:100}});
    Object.defineProperties(navigator.geolocation,{getCurrentPosition:{configurable:true,value(success){success(point());}},watchPosition:{configurable:true,value(success){callback=success;return 1;}},clearWatch:{configurable:true,value(){callback=null;}}});
    window.testGPS=()=>callback?.(point());
  });
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'&&url.port==='5173')return route.continue();
    if(url.hostname==='unpkg.com'&&renderer){if(url.pathname.endsWith('.js'))return route.fulfill({contentType:'application/javascript',body:renderer+'\nwindow.testMapCount=0;const realMap=L.map;L.map=(...args)=>{window.testMapCount++;window.testMap=realMap(...args);return window.testMap;};'});if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:rendererCSS});}
    if(/tile\.|opentopomap/.test(url.hostname)||url.hostname==='tilecache.rainviewer.com')return route.fulfill({contentType:'image/svg+xml',body:tile});
    if(url.hostname==='api.rainviewer.com'){radarCalls++;return route.fulfill({contentType:'application/json',body:JSON.stringify({radar:{past:[{time:Math.floor(Date.now()/1000)-600,path:'/v2/radar/fixture'}]}})});}
    if(url.hostname==='api.open-meteo.com'){
      weatherCalls++;if(weatherFailure)return route.abort();
      const start=Math.floor((Date.now()-4*86400000)/3600000)*3600,time=Array.from({length:300},(_,i)=>start+i*3600),count=url.searchParams.get('latitude').split(',').length;
      return route.fulfill({contentType:'application/json',body:JSON.stringify(Array.from({length:count},()=>({timezone:'America/Chicago',hourly:{time,precipitation:time.map(()=>1),precipitation_probability:time.map(()=>70),temperature_2m:time.map(()=>20),wind_speed_10m:time.map(()=>16),wind_gusts_10m:time.map(()=>24),wind_direction_10m:time.map(()=>180)},daily:{time:time.filter((_,i)=>i%24===0),precipitation_sum:time.filter((_,i)=>i%24===0).map(()=>24)}})))});
    }
    if(url.hostname!=='127.0.0.1'||url.port!=='54321')return route.abort();
    const table=url.pathname.split('/').at(-1);if(route.request().method()!=='GET')return route.fulfill({status:503,contentType:'application/json',body:'{"message":"Test backend writes unavailable"}'});
    let body=table==='bikes'?[bike]:table==='user_profiles'?[{user_id:owner,role:'rider',display_name:'Test rider'}]:table==='feature_flags'?['dashboard','motorcycles','ride_log','maintenance','garage_mode','notebook','project_files'].map(feature_key=>({id:feature_key,feature_key,enabled:true,minimum_role:'rider',release_stage:'production'})):[];
    if(route.request().headers().accept?.includes('vnd.pgrst.object'))body=body[0]||null;
    if(url.pathname==='/auth/v1/user')body={id:owner,email:'local@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false,factors:[]};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Sign in securely'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Create account',exact:true}).count(),0);
  await page.evaluate(id=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:id,role:'authenticated',aal:'aal1',exp:Math.floor(Date.now()/1000)+3600}))+'.test',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id,email:'local@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false}})),owner);
  await page.reload();await page.locator('.mmWorkspace[data-page="Map"]').waitFor();await page.waitForFunction(()=>window.MotoRide?.getBikes().length===1);
  await page.locator('#motoBottomNav').waitFor();assert.deepEqual(await page.locator('#motoBottomNav button span').allTextContents(),['Map','Ride Center','Weather','Garage','Settings']);
  if(renderer)await page.waitForFunction(()=>window.testMapCount===1);
  else await page.locator('.missionMapFailure').waitFor();
  const capture=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name}: document overflow`);await page.screenshot({path:join(out,name+'.png'),fullPage:true});};
  const area=async name=>{const started=Date.now();await page.locator(`#motoBottomNav [data-go="${name}"]`).click();await page.waitForFunction(name=>window.MotoWorkspace.getView()===({home:'dashboard'}[name]||name),name);transitions.push({tab:name,ms:Date.now()-started});};
  await capture('map-explore-iphone16');
  await page.locator('.top [data-theme-toggle]').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await capture('map-explore-dark-iphone16');
  const mapBox=await page.locator('#missionMapViewport').boundingBox();assert.ok(mapBox.height>500,`Map height ${mapBox.height}`);
  if(renderer)await page.evaluate(()=>window.testMap.setView([30,-97],11));
  const camera=await page.evaluate(()=>window.MotoMapWorkspace.getCamera());
  await page.locator('#main [data-mode="routes"]').click();await page.locator('#missionGpxInput').waitFor();
  assert.equal(await page.locator('#missionMapDrawer').getAttribute('data-panel-state'),'half');
  await page.locator('#missionMapDrawer [data-panel-handle]').click();assert.equal(await page.locator('#missionMapDrawer').getAttribute('data-panel-state'),'minimized');
  await page.locator('#missionMapDrawer [data-panel-handle]').press('ArrowUp');await page.locator('#missionMapDrawer [data-panel-handle]').press('ArrowUp');assert.equal(await page.locator('#missionMapDrawer').getAttribute('data-panel-state'),'expanded');
  const handle=await page.locator('#missionMapDrawer [data-panel-handle]').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2+60,{steps:6});await page.mouse.up();
  assert.equal(await page.locator('#missionMapDrawer').getAttribute('data-panel-state'),'half','Handle swipe minimizes without stealing content scrolling');
  await page.locator('#missionMapDrawer [data-panel-handle]').press('ArrowUp');
  await capture('map-routes-expanded');
  const gpx='<?xml version="1.0"?><gpx version="1.1"><trk><name>Fixture trail</name><trkseg><trkpt lat="30" lon="-97"/><trkpt lat="30.01" lon="-97.01"/></trkseg></trk></gpx>';
  await page.locator('#missionGpxInput').setInputFiles({name:'fixture.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(gpx)});await page.locator('#missionSaveGpx').click();await page.locator('.missionSavedRoute').waitFor();
  await area('rideCenter');await page.locator('#missionLiveSpeed').waitFor();await capture('ride-live');
  await page.locator('#main [data-mode="sensors"]').click();await page.locator('#main [data-sensor="esp32"]').waitFor();assert.match(await page.locator('#main [data-sensor="esp32"]').textContent(),/Disconnected|Unavailable/);await capture('ride-sensors');
  await page.locator('#main [data-mode="review"]').click();await page.locator('.unifiedRideLog').waitFor();await capture('ride-review');
  await area('weather');await page.locator('#main [data-mode="area"]').waitFor();assert.equal(weatherCalls,0,'Opening Weather must not request provider data');
  await page.locator('#main [data-mode="area"]').click();await page.locator('[data-weather-area] [name="lat"]').fill('30');await page.locator('[data-weather-area] [name="lon"]').fill('-97');await page.locator('[data-weather-area] [type="submit"]').click();await page.getByText('Forecast saved. Ground conditions remain estimates.').waitFor();
  assert.match(await page.locator('[data-area-weather]').textContent(),/72 hours/);assert.equal(weatherCalls,1);await capture('weather-area');
  weatherFailure=true;await page.waitForTimeout(300);await page.locator('[data-weather-area] [type="submit"]').click();await page.getByText('Last saved estimate retained.',{exact:false}).waitFor();assert.ok((await page.locator('[data-area-weather]').textContent()).includes('Previous rainfall'));
  await page.locator('details').filter({has:page.locator('[data-weather-radar]')}).locator('summary').click();await page.locator('[data-weather-radar]').click();assert.equal(radarCalls,0);
  await page.locator('[data-radar-refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-radar-status]').textContent.includes('not a forecast'));assert.equal(radarCalls,1);
  await page.locator('[data-radar-fullscreen]').click();assert.equal(await page.locator('.mmRadarFullscreen').count(),1);assert.ok((await page.locator('#missionRadarFullscreen').boundingBox()).height>=840,'Fullscreen radar occupies the viewport');await capture('weather-radar-fullscreen');await page.locator('#missionRadarFullscreen [data-close]').click();
  await area('garage');await page.locator('#main .bikeHero').waitFor();await capture('garage');
  await area('settings');await page.locator('#missionInterfacePreferences').waitFor();await capture('settings');
  await page.locator('#missionInterfacePreferences [name="density"]').selectOption('comfortable');await page.locator('#missionInterfacePreferences [type="submit"]').click();await page.getByText('Interface settings saved on this device.').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-density'),'comfortable');
  await area('home');assert.equal(await page.locator('.missionSavedRoute').count(),1);if(renderer){assert.equal(await page.evaluate(()=>window.testMapCount),1);assert.equal(await page.evaluate(()=>window.MotoMapWorkspace.getCamera().zoom),camera.zoom);assert.ok(await page.evaluate(camera=>window.testMap.project(window.testMap.getCenter()).distanceTo(window.testMap.project(camera.center))<=1,camera),'Map center stays within Leaflet pixel rounding across tabs');}
  await area('rideCenter');await page.locator('#main [data-mode="live"]').click();await page.locator('[data-record-action="start"]').click();await page.waitForFunction(()=>window.MotoRide.getState().active);await page.evaluate(()=>window.testGPS());await page.waitForFunction(()=>window.MotoRide.getState().bufferedSamples>0);
  const rideId=await page.evaluate(()=>window.MotoRide.getState().sessionId);
  assert.equal(await page.evaluate(()=>window.MotoRecordingIsolation.isActive()),true,'iPhone event isolation remains active');
  for(const tab of ['home','weather','garage','settings','rideCenter']){await area(tab);assert.equal(await page.evaluate(()=>window.MotoRide.getState().sessionId),rideId);assert.equal(await page.evaluate(()=>window.MotoRide.getState().active),true);}
  await page.locator('[data-record-action="pause"]').click();await page.waitForFunction(()=>window.MotoRide.getState().status==='paused');await page.locator('[data-record-action="resume"]').click();await page.waitForFunction(()=>window.MotoRide.getState().active);await page.locator('[data-record-action="stop"]').click();await page.waitForFunction(()=>window.MotoRide.getState().status==='pending');
  for(const [width,height] of [[852,393],[320,740],[430,932]]){await page.setViewportSize({width,height});await area('home');await capture(`map-${width}x${height}`);}
  await page.setViewportSize({width:393,height:852});await area('settings');await page.evaluate(()=>document.documentElement.style.fontSize='200%');await capture('settings-large-type');await page.evaluate(()=>document.documentElement.style.fontSize='');
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.density==='comfortable');
  await page.locator('#missionInterfacePreferences [name="startup"]').selectOption('weather');await page.locator('#missionInterfacePreferences [type="submit"]').click();await page.getByText('Interface settings saved on this device.').waitFor();
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.MotoWorkspace?.getView()==='weather');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:['five tabs and submodes','persistent map/route state','reusable sheet keyboard/tap/swipe states','GPX originals','live/sensors/review','explicit weather fetch and outage retention','same-map radar/fullscreen with past-frame labels','saved interface density','iPhone recording isolation with cross-tab continuity','portrait/landscape/large type'],renderer:!!renderer,screenshots:out,transitions,errors}));
}catch(error){console.log({message:error.message,errors,screenshots:out,main:await page.locator('#main').textContent().catch(()=>null)});throw error;}finally{await context.close();await browser.close();}
