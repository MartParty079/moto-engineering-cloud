import './workspace-ui.css';
import {escapeUI as esc,mountSegments,mountSheet,setSheetState,metricCard,statusChip} from './ui-components.js';
import {mountRouteLibrary} from './route-library.js';
import {mountOfflineNavigation} from './offline-navigation-ui.js';
import {mountMissionPreferences,missionStore,toggleAppearance,refreshThemeControls} from './rider-preferences.js';
import {mountMotorcycleSelector} from './motorcycle-selector.js';
import {supabase} from './supabase.js';

const $=(s,root=document)=>root.querySelector(s);
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const showNumber=(value,digits=0)=>number(value)===null?'—':value.toFixed(digits);
const text=(node,value)=>{if(node&&node.textContent!==String(value))node.textContent=String(value);};
let uiPreferences={autoCollapse:true,density:'compact',startup:'dashboard',mode:'street',units:'imperial'};
let recordingWasActive=false,lastNavigationName='';
let liveSeries=[],seriesSession=null;
const initialHash=location.hash;let startupTarget=null;
function applyStartup(){if(startupTarget&&allowed(startupTarget)&&!initialHash){window.MotoWorkspace?.navigate(startupTarget);startupTarget=null;}}

function page(main,title,modes){
  main.innerHTML=`<section class="mmWorkspace" data-page="${esc(title)}"><header class="mmPageHeader"><h2>${esc(title)}</h2><span class="mmRecordingStatus" role="status">Not recording</span></header>${modes?'<nav data-workspace-modes aria-label="Section modes"></nav>':''}<div class="mmWorkspaceBody"></div></section>`;
  return $('.mmWorkspaceBody',main);
}
function report(host,error){if(host?.isConnected)host.textContent=error.message||String(error);}
function metricDetail(id){
  document.querySelector('#missionMetricDetail')?.close();document.querySelector('#missionMetricDetail')?.remove();
  const fields={distance:['distanceMiles','mi'],duration:['elapsedSeconds','s'],average:['averageSpeedMph','mph'],elevation:['altitudeFt','ft'],heading:['heading','°'],accuracy:['accuracyFt','ft']};
  const [field,unit]=fields[id]||[];if(!field)return;
  const points=liveSeries.filter(point=>number(point[field])!==null),dialog=document.createElement('dialog');dialog.id='missionMetricDetail';dialog.className='mmDetailDialog';
  let graph='<p>No valid GPS-linked samples in this session yet.</p>';
  if(points.length>1){const min=Math.min(...points.map(point=>point[field])),max=Math.max(...points.map(point=>point[field])),start=points[0].time,span=Math.max(1,points.at(-1).time-start),runs=[];let run=[],lastTime=null;
    for(const point of points){if(lastTime&&point.time-lastTime>5000){runs.push(run);run=[];}run.push(`${10+380*(point.time-start)/span},${110-90*(point[field]-min)/Math.max(.01,max-min)}`);lastTime=point.time;}if(run.length)runs.push(run);
    graph=`<svg viewBox="0 0 400 130" role="img" aria-label="Last minute of real ${esc(id)} samples, capture gaps preserved">${runs.map(line=>`<polyline points="${line.join(' ')}" fill="none" stroke="#F47716" stroke-width="3"/>`).join('')}</svg><p>${min.toFixed(1)}–${max.toFixed(1)} ${unit} · ${points.length} recorded snapshots. Gaps over five seconds remain separate.</p>`;
  }
  dialog.innerHTML=`<header><h2>${esc(id[0].toUpperCase()+id.slice(1))}</h2><button type="button" data-close aria-label="Close metric details">×</button></header>${graph}<p>Source: phone GPS / recorder summary. This graph is a snapshot of up to 60 real fixes. It is not calibrated vehicle telemetry.</p><button type="button" data-refresh>Refresh graph</button>`;
  document.body.appendChild(dialog);$('[data-close]',dialog).onclick=()=>dialog.close();$('[data-refresh]',dialog).onclick=()=>metricDetail(id);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
function allowed(view){return window.MotoAccess?.canView(view)===true;}
function bindPaneModes(main,items,initial,onChange){
  const key=`moto-workspace-mode:${main.dataset.workspace}`;
  try{const saved=sessionStorage.getItem(key);if(items.some(([id])=>id===saved))initial=saved;}catch{}
  const choose=mode=>{main.dataset.mode=mode;try{sessionStorage.setItem(key,mode);}catch{}main.querySelectorAll('[data-pane]').forEach(pane=>{pane.hidden=pane.dataset.pane!==mode;pane.inert=pane.hidden;});onChange?.(mode);};
  const segments=mountSegments($('[data-workspace-modes]',main),items,choose,initial);choose(initial);return segments;
}

function mapWorkspace(main){
  const body=page(main,'Map',[1]);body.classList.add('mmMapStage');
  body.innerHTML=`<div id="missionMapViewport" class="mmMapViewport"><p class="mmMapLoading" role="status">Loading map renderer…</p></div>
    <div class="mmMapBadges"><button type="button" data-map-search aria-label="Search routes">⌕</button><button type="button" data-offline-open>Offline coverage</button><button type="button" data-map-tool="advLayersSheet" aria-label="Map layers">Layers</button><button type="button" data-map-tool="advPointsSheet">Waypoints</button><button type="button" data-map-tool="advMoreSheet" aria-label="Compass and map orientation">Compass</button></div>
    <div id="missionNavigationSummary" class="mmNavigationSummary" hidden><strong data-nav-speed>—<small>mph</small></strong><div><b data-nav-road>Road unavailable</b><span data-nav-limit>Speed limit unavailable</span><span data-nav-next>Choose a route for guidance</span><span data-nav-remaining></span><span data-nav-heading></span></div><button type="button" data-nav-fullscreen aria-label="Toggle fullscreen navigation">⛶</button></div>
    <section id="missionMapDrawer" aria-label="Map details"><div class="mmExploreTools" data-map-explore><h3>Explore</h3><p>Roads, terrain and your saved tracks. Mapped trails do not establish legal motorcycle access.</p><div class="actions"><button type="button" data-explore-routes>Saved routes & places</button><button type="button" data-map-tool="advMoreSheet">Orientation & range</button><button type="button" data-map-scout>Nearby roads</button></div></div>
    <div data-map-routes><section id="missionRouteLibrary"></section><details class="missionDisclosure"><summary>Offline navigation & saved destinations</summary><section id="missionOfflineNavigation"></section></details><details><summary>Matching & route capabilities</summary><p>Original GPX bytes are preserved. Edit a separate copy, follow original geometry, or calculate a route inside a downloaded road network. Graph-aware Fit to Road is not available.</p><button type="button" disabled>Fit to Road — unavailable</button><p>No legal road connection or maneuver is invented for an unmatched segment.</p></details><div class="actions"><button type="button" data-map-tool="advRoutesSheet">Cloud routes / waypoint editor</button></div></div></section>`;
  const drawer=mountSheet($('#missionMapDrawer',main),{key:'map-details',group:'map',dismissible:false});
  const mountMap=()=>window.MotoMapWorkspace?.mount?.($('#missionMapViewport',main));
  mountMap();window.addEventListener('moto-map-workspace-ready',mountMap,{once:true});
  main.addEventListener('click',event=>{
    if(event.target.closest('[data-map-search]')){$('[data-workspace-modes]',main).choose('routes');setSheetState(drawer,'expanded');$('#missionRouteSearch',main)?.focus();}
    if(event.target.closest('[data-map-scout]')){window.MotoMapWorkspace?.openPanel?.('advRoutesSheet');window.MotoRideOS3?.openRoadScout?.();}
    const tool=event.target.closest('[data-map-tool]');if(tool)window.MotoMapWorkspace?.openPanel?.(tool.dataset.mapTool);
    if(event.target.closest('[data-offline-open]')){$('[data-workspace-modes]',main).choose('routes');setSheetState(drawer,'expanded');$('.missionDisclosure',main).open=true;}
    if(event.target.closest('[data-explore-routes]'))$('[data-workspace-modes]',main).choose('routes');
    if(event.target.closest('[data-nav-fullscreen]')){body.classList.toggle('mmFullscreenNavigation');document.body.classList.toggle('mm-navigation-fullscreen',body.classList.contains('mmFullscreenNavigation'));window.MotoMapWorkspace?.resize?.();}
  });
  bindPaneModes(main,[['explore','Explore'],['routes','Routes'],['navigate','Navigate']],'explore',mode=>{
    $('[data-map-explore]',main).hidden=mode!=='explore';$('[data-map-routes]',main).hidden=mode==='explore';
    $('#missionNavigationSummary',main).hidden=mode!=='navigate';
    setSheetState(drawer,mode==='routes'?'half':'minimized');window.MotoMapWorkspace?.resize?.();
  });
  void mountRouteLibrary($('#missionRouteLibrary',main));
  void mountOfflineNavigation($('#missionOfflineNavigation',main)).catch(error=>report($('#missionOfflineNavigation',main),error));
}

function sensors(host){
  if(!allowed('devices')){host.innerHTML='<p>Sensor/device access is not enabled for this account.</p>';return;}
  host.innerHTML=`<div class="mmSensorList">${[
    ['Phone GPS','Phone geolocation','Speed, course, position, elevation','Location permission required; quality comes from GPS accuracy.','gps'],
    ['Phone IMU','Browser motion · experimental','Mount-dependent motion estimates','Phone motion is not calibrated motorcycle lean. iPhone motion remains disabled by the existing stability gate.','imu'],
    ['Bluetooth / external GPS','No verified device transport','Unavailable','Native adapter and supported hardware are required.','ble'],
    ['ESP32 telemetry','Disconnected / experimental','Unavailable','Firmware, authentication and measurement quality require validation.','esp32'],
    ['OBD-II','Unavailable in this beta','Unavailable','Existing ECU-data exclusion remains. No diagnostics or writes are enabled.','obd'],
    ['Tire pressure','No connected TPMS source','Unavailable','Manual service records are available in Garage.','tpms']
  ].map(([label,source,measurements,note,id])=>`<details class="card mmSensor" data-sensor="${id}"><summary><strong>${label}</strong>${statusChip(id==='gps'?'Waiting for fix':'Unavailable')}</summary><dl><dt>Source</dt><dd>${source}</dd><dt>Measurements</dt><dd>${measurements}</dd><dt>Last update</dt><dd data-sensor-updated>Unavailable</dd><dt>Quality</dt><dd data-sensor-quality>${note}</dd></dl>${id==='gps'?'<button type="button" data-sensor-location>Request phone location</button>':''}<p>${note}</p></details>`).join('')}</div><p>Configure supported dashboard widgets in Live. No unsupported measurement is shown as zero.</p>`;
  $('[data-sensor-location]',host)?.addEventListener('click',()=>window.MotoPermissionController?.requestLocation?.());
}

function rideWorkspace(main){
  const body=page(main,'Ride Center',[1]);
  body.innerHTML=`<section data-pane="live"><div class="mmBikeContext"><button type="button" id="missionRideMotorcycle" aria-label="Select motorcycle">Select motorcycle</button><button type="button" id="missionCustomizeDashboard" class="secondary">Customize dashboard</button></div><article class="mmSpeedGauge"><small>GPS speed</small><strong id="missionLiveSpeed">—</strong><span data-speed-unit>mph</span><p id="missionLiveSource">Waiting for a reliable phone fix</p></article><div class="mmRideActions"><button type="button" data-record-action="start" class="primary">Start</button><button type="button" data-record-action="pause">Pause</button><button type="button" data-record-action="resume">Resume</button><button type="button" data-record-action="stop">End</button></div><p id="missionRideActionStatus" role="status"></p><div class="mmMetricGrid" id="missionLiveMetrics"></div><details class="card"><summary>Choose live metrics</summary><form id="missionMetricPreferences">${['distance','duration','average','elevation','heading','accuracy'].map(id=>`<label><input type="checkbox" name="${id}" checked> ${id[0].toUpperCase()+id.slice(1)}</label>`).join('')}<button type="submit">Save dashboard metrics</button><p role="status"></p></form></details><details class="card"><summary>Recovery & exports</summary><p>Keep local browser data until synchronization is confirmed. Export requires a stopped ride.</p><div class="actions"><button type="button" data-record-action="retry">Retry upload</button><button type="button" data-record-action="exportGPX">Export local GPX</button><button type="button" data-record-action="export">Recovery copy</button></div></details></section><section data-pane="sensors" hidden></section><section data-pane="review" hidden><div id="missionRideLibrary"></div></section>`;
  $('#missionCustomizeDashboard',body).onclick=()=>window.MotoRide?.open?.();
  mountMotorcycleSelector($('#missionRideMotorcycle',body));
  let busy=false;
  body.addEventListener('click',async event=>{
    const button=event.target.closest('[data-record-action]');if(!button||busy)return;
    const action=button.dataset.recordAction,control=window.MotoRide,status=$('#missionRideActionStatus',body);
    busy=true;button.disabled=true;
    try{if(!control)throw new Error('Ride services are loading.');if(action==='start'){const bike=control.getActiveBike?.();if(!bike)throw new Error('Choose a motorcycle before starting.');await control.start(bike.id);}else await control[action]();text(status,action==='stop'?'Ride ended. Saved on this device; check upload status.':'');}
    catch(error){text(status,error.message);}finally{busy=false;refreshRideUI();}
  });
  bindPaneModes(main,[['live','Live'],['sensors','Sensors'],['review','Review']],'live',mode=>{
    if(mode==='sensors')sensors($('[data-pane="sensors"]',main));
    if(mode==='review'&&!$('#missionRideLibrary',main).childNodes.length)window.dispatchEvent(new CustomEvent('moto-review-library-open',{detail:{host:$('#missionRideLibrary',main)}}));
  });
  const form=$('#missionMetricPreferences',body);
  $('#missionLiveMetrics',body).addEventListener('click',event=>{const tile=event.target.closest('[data-live-metric]');if(tile)metricDetail(tile.dataset.liveMetric);});
  $('#missionLiveMetrics',body).addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('[data-live-metric]')){event.preventDefault();metricDetail(event.target.dataset.liveMetric);}});
  form.onsubmit=async event=>{event.preventDefault();try{const {data}=await supabase.auth.getSession(),owner=data.session?.user.id;if(!owner)throw new Error('Sign in to save your dashboard.');const metrics=[...new FormData(form).keys()];await missionStore.put(owner,'dashboard-metrics',metrics);if(!form.isConnected)return;form.dataset.metrics=JSON.stringify(metrics);text($('[role="status"]',form),'Dashboard saved on this device.');refreshRideUI();}catch(error){text($('[role="status"]',form),error.message);}};
  void (async()=>{const {data}=await supabase.auth.getSession(),owner=data.session?.user.id;if(!owner)return;const metrics=await missionStore.get(owner,'dashboard-metrics');if(form.isConnected&&Array.isArray(metrics)){form.dataset.metrics=JSON.stringify(metrics);form.querySelectorAll('input').forEach(input=>{input.checked=metrics.includes(input.name);});refreshRideUI();}})().catch(()=>{});
  refreshRideUI();
}

function refreshRideUI(){
  const ride=window.MotoRide?.getState?.()||{},gps=window.MotoGPS||{},road=window.MotoRoadContext||{};
  const status=ride.active?'Recording':ride.status==='paused'?'Paused':ride.sessionId?'Ride saved · recovery available':'Not recording';
  document.querySelectorAll('.mmRecordingStatus').forEach(node=>text(node,status));
  const fixTimestamp=ride.active?ride.gpsTimestamp:gps.timestamp;
  const fresh=number(fixTimestamp)!==null&&Date.now()-fixTimestamp<=15000&&fixTimestamp<=Date.now()+5000;
  const speed=fresh?number(ride.active?ride.speedMph:gps.speed):null;
  text($('#missionLiveSpeed'),showNumber(uiPreferences.units==='metric'&&speed!==null?speed*1.609344:speed));
  text($('[data-speed-unit]'),uiPreferences.units==='metric'?'km/h':'mph');
  text($('#missionLiveSource'),ride.gpsError||`Phone GPS · ${fresh?'last fix '+new Date(fixTimestamp).toLocaleTimeString():'waiting for fresh fix'}`);
  const root=$('#missionLiveMetrics');
  if(root){
    let selected;try{selected=JSON.parse($('#missionMetricPreferences')?.dataset.metrics||'null');}catch{};
    const unit=uiPreferences.units==='metric'?'km':'mi',scale=unit==='km'?1.609344:1;
    const rows={distance:['Distance',showNumber(number(ride.distanceMiles)===null?null:ride.distanceMiles*scale,2),unit],duration:['Duration',ride.elapsedText||'00:00:00',''],average:['Average speed',showNumber(number(ride.averageSpeedMph)===null?null:ride.averageSpeedMph*scale,1),unit+'/h'],elevation:['Elevation',showNumber(number(ride.altitudeFt)===null?null:uiPreferences.units==='metric'?ride.altitudeFt/3.28084:ride.altitudeFt),uiPreferences.units==='metric'?'m':'ft'],heading:['Heading',showNumber(ride.heading),'°'],accuracy:['GPS accuracy',showNumber(ride.accuracyFt),'ft']};
    for(const [id,args] of Object.entries(rows)){let node=$(`[data-live-metric="${id}"]`,root);if(!node){root.insertAdjacentHTML('beforeend',metricCard(...args));node=root.lastElementChild;node.dataset.liveMetric=id;node.tabIndex=0;node.setAttribute('role','button');node.setAttribute('aria-label',`${args[0]} graph and source details`);}node.hidden=selected? !selected.includes(id):false;const strong=$('strong',node);if(strong.dataset.value!==args[1]||strong.dataset.unit!==args[2]){strong.innerHTML=`${esc(args[1])}<span>${esc(args[2])}</span>`;strong.dataset.value=args[1];strong.dataset.unit=args[2];}}
  }
  document.querySelectorAll('[data-record-action]').forEach(button=>{const action=button.dataset.recordAction;button.disabled=ride.starting||ride.stopping||action==='start'&&Boolean(ride.sessionId)||action==='pause'&&!ride.active||action==='resume'&&!['paused','interrupted'].includes(ride.status)||action==='stop'&&!ride.sessionId||['exportGPX','export'].includes(action)&&(!ride.sessionId||ride.active);});
  text($('[data-nav-speed]'),`${showNumber(speed)} mph`);
  text($('[data-nav-road]'),road.road||'Road unavailable');
  const limit=number(road.limit_mph);text($('[data-nav-limit]'),limit===null?'Speed limit unavailable':`${Math.round(limit)} mph limit · ${road.cached||road.stale?'cached / uncertain':road.source||'source not verified'}`);
  const route=window.MotoAdventure?.getState?.();text($('#missionMapDrawer [data-panel-handle] span'),route?.active?route.name:'Map details');text($('[data-nav-next]'),route?.active?`${route.name} · ${route.remaining||'remaining distance unavailable'} · ETA unavailable`:'Choose a route for track guidance. Graph maneuvers unavailable without a calculated network route.');
  const guidance=window.MotoOfflineGuidance;
  if(guidance?.active){const stale=Date.now()-guidance.updatedAt>15000;text($('[data-nav-next]'),`${guidance.next} · ${guidance.distanceMiles.toFixed(2)} mi${stale?' · last GPS fix is stale':''}`);text($('[data-nav-remaining]'),`${guidance.remainingMiles.toFixed(2)} mi remaining · ${guidance.estimatedMinutes.toFixed(0)} min constant-speed estimate`);}else text($('[data-nav-remaining]'),'');
  text($('[data-nav-heading]'),fresh?`Heading ${showNumber(ride.heading??gps.heading)}°`:'Heading unavailable');
  const fixTime=ride.gpsTimestamp||gps.timestamp;
  text($('[data-sensor="gps"] [data-sensor-updated]'),fixTime?new Date(fixTime).toLocaleTimeString():'Unavailable');
  if(number(ride.accuracyFt)!==null)text($('[data-sensor="gps"] [data-sensor-quality]'),`±${ride.accuracyFt.toFixed(0)} ft reported accuracy`);
}

function settingsWorkspace(main,options){
  let pendingMode=uiPreferences.mode;
  const body=page(main,'Settings');
  body.innerHTML=`<details class="card" open><summary>Profile & Account</summary><div class="actions"><button id="missionSecurity" type="button">Account security / MFA</button><button id="missionPreferences" type="button">Motorcycles & dashboard</button><button type="button" data-settings-signout>Sign out</button></div><p>Invitation-only verified access. Existing administrator controls remain in the menu.</p></details>
  <details class="card"><summary>Ride Modes</summary><p>App display presets only. These do not change motorcycle ECU settings or create a new routing engine.</p><div data-ride-modes aria-label="Ride mode"></div><p data-mode-description></p></details>
  <details class="card"><summary>Map & Navigation</summary><button type="button" data-settings-map>Layers, orientation & offline coverage</button><p>Road, terrain and satellite sources keep their existing attribution. Legal access may be unknown.</p></details>
  <details class="card"><summary>Sensors & Devices</summary><button type="button" data-settings-sensors>Sensor status & available measurements</button></details>
  <details class="card"><summary>Data & Units</summary><div data-unit-setting></div><p>Existing exports and specialized editors retain their labeled source units.</p></details><details class="card" open><summary>App & Display</summary><label>Theme<button type="button" data-theme-toggle aria-label="Switch color mode">◐</button></label><form id="missionInterfacePreferences"><div class="missionFormGrid"><label>Startup tab<select name="startup">${[['dashboard','Map'],['rideCenter','Ride Center'],['weather','Weather'],['garage','Garage'],['settings','Settings']].map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><label>Density<select name="density"><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label><label>Units for new live/weather displays<select name="units"><option value="imperial">Miles / Fahrenheit</option><option value="metric">Kilometers / Celsius</option></select></label></div><label><input name="autoCollapse" type="checkbox" checked> Minimize panels when navigation or recording starts</label><p>Historical exports and existing specialized editors retain their labeled source units.</p><button type="submit" class="primary">Save interface settings</button><p role="status"></p></form></details>
  <details class="card"><summary>Sync & Cloud</summary><section id="missionDataPreferences"></section></details>
  <details class="card"><summary>Privacy</summary><p>Ride traces stay private by default. Weather coordinates are sent only on explicit fetch. Export valuable routes and recordings before clearing browser data.</p></details><details class="card"><summary>About</summary><p>Moto Mission · MM-UI-007. Web/PWA capture is subject to iOS foreground/background limits. Unavailable sensors and map matching are labeled honestly.</p></details>`;
  $('#missionSecurity',body).onclick=()=>$('#securityCenterNav')?.click();
  $('#missionPreferences',body).onclick=options.openSettingsModal;
  $('[data-settings-signout]',body).onclick=()=>supabase.auth.signOut();
  $('[data-settings-map]',body).onclick=()=>window.MotoWorkspace.navigate('dashboard','routes');
  $('[data-settings-sensors]',body).onclick=()=>window.MotoWorkspace.navigate('devices');
  void mountMissionPreferences($('#missionDataPreferences',body)).catch(error=>report($('#missionDataPreferences',body),error));
  mountSegments($('[data-ride-modes]',body),[['street','Street'],['adventure','Adventure'],['enduro','Enduro'],['custom','Custom']],mode=>{
    pendingMode=mode;text($('[data-mode-description]',body),{street:'Street: paved-road tools and standard telemetry.',adventure:'Adventure: terrain, route surfaces, weather and range tools.',enduro:'Enduro: compact track and waypoint focus.',custom:'Custom: keep your saved dashboard and map choices.'}[mode]);
  },uiPreferences.mode);
  const form=$('#missionInterfacePreferences',body);
  const units=form.elements.units;units.setAttribute('form',form.id);$('[data-unit-setting]',body).appendChild(units.closest('label'));
  $('[data-theme-toggle]',body).onclick=()=>void toggleAppearance().catch(error=>report($('[role="status"]',form),error));refreshThemeControls();
  for(const key of ['startup','density','units'])form.elements[key].value=uiPreferences[key];form.elements.autoCollapse.checked=uiPreferences.autoCollapse;
  form.onsubmit=async event=>{event.preventDefault();const status=$('[role="status"]',form);try{const {data}=await supabase.auth.getSession(),owner=data.session?.user.id;if(!owner)throw new Error('Sign in before saving.');const values=new FormData(form);const next={...uiPreferences,mode:pendingMode,startup:values.get('startup'),density:values.get('density'),units:values.get('units'),autoCollapse:values.get('autoCollapse')==='on'};await missionStore.put(owner,'interface',next);const {data:latest}=await supabase.auth.getSession();if(latest.session?.user.id!==owner||!form.isConnected)return;const modeChanged=next.mode!==uiPreferences.mode;applyUI(next);if(modeChanged&&next.mode!=='custom')window.MotoMapWorkspace?.setStyle?.(next.mode==='street'?'street':'terrain');text(status,'Interface settings saved on this device.');}catch(error){text(status,error.message);}};
}

function applyUI(value){uiPreferences={...uiPreferences,...value};document.documentElement.dataset.density=uiPreferences.density;document.documentElement.dataset.rideMode=uiPreferences.mode;window.dispatchEvent(new CustomEvent('moto-interface-preferences',{detail:uiPreferences}));refreshRideUI();}
export function mountWorkspace(view,main,options={}){
  if(!['dashboard','rideCenter','weather','settings'].includes(view))return false;
  if(main.dataset.accessBlocked)return true;
  if($('.mmWorkspace',main))return true;
  if(view==='dashboard')mapWorkspace(main);
  if(view==='rideCenter')rideWorkspace(main);
  if(view==='settings')settingsWorkspace(main,options);
  if(view==='weather'){const body=page(main,'Weather',[1]);void import('./weather-workspace.js').then(({mountWeatherWorkspace})=>mountWeatherWorkspace(main,body)).catch(error=>report(body,error));}
  refreshRideUI();return true;
}
window.addEventListener('moto-workspace-ride',event=>{
  const ride=event.detail;if(seriesSession!==ride.sessionId){seriesSession=ride.sessionId;liveSeries=[];}if(ride.active&&number(ride.gpsTimestamp)!==null&&liveSeries.at(-1)?.time!==ride.gpsTimestamp){liveSeries.push({...ride,time:ride.gpsTimestamp});liveSeries=liveSeries.slice(-60);}
  refreshRideUI();window.MotoMapWorkspace?.updateRecorderPosition?.(event.detail);
  if(uiPreferences.autoCollapse&&event.detail.active&&!recordingWasActive)for(const sheet of document.querySelectorAll('.mmSheet[data-panel-state="expanded"],.mmSheet[data-panel-state="half"]'))setSheetState(sheet,'minimized');
  recordingWasActive=Boolean(event.detail.active);
});
window.addEventListener('moto-workspaces-reset',()=>{liveSeries=[];seriesSession=null;document.querySelector('#missionMetricDetail')?.close();});
window.addEventListener('moto-guidance-state',refreshRideUI);
window.addEventListener('moto-road-update',refreshRideUI);
window.addEventListener('moto-gps-fix',refreshRideUI);
window.addEventListener('moto-route-update',()=>{refreshRideUI();const route=window.MotoAdventure?.getState?.();if(uiPreferences.autoCollapse&&route?.active&&route.name!==lastNavigationName){const sheet=$('#missionMapDrawer');if(sheet)setSheetState(sheet,'minimized');}lastNavigationName=route?.active?route.name:'';});
window.addEventListener('moto-workspace-change',event=>{document.querySelector('#rideV3Toast')?.classList.remove('show');document.querySelector('#adventureStatus')?.classList.remove('show');document.body.classList.remove('mm-navigation-fullscreen');if(event.detail.view!=='dashboard')$('.mmFullscreenNavigation')?.classList.remove('mmFullscreenNavigation');if(event.detail.view==='dashboard')void window.MotoMapWorkspace?.mount?.($('#missionMapViewport'));window.MotoMapWorkspace?.resize?.();refreshRideUI();if(event.detail.view==='rideCenter'&&event.detail.mode==='sensors')sensors($('#main [data-pane="sensors"]'));});
window.addEventListener('moto-access-ready',()=>{applyStartup();const host=$('#main [data-pane="sensors"]');if(host)sensors(host);});
window.addEventListener('moto-motorcycle-context',refreshRideUI);
supabase.auth.onAuthStateChange((_event,session)=>{applyUI({autoCollapse:true,density:'compact',startup:'dashboard',mode:'street',units:'imperial'});if(session)setTimeout(async()=>{try{const owner=session.user.id,stored=await missionStore.get(owner,'interface'),{data}=await supabase.auth.getSession();if(data.session?.user.id===owner){applyUI(stored||{});startupTarget=stored?.startup||null;applyStartup();}}catch{}},0);});

window.addEventListener('moto-offline-coverage',event=>text($('[data-offline-open]'),`Offline: ${event.detail.count} region${event.detail.count===1?'':'s'}`));
