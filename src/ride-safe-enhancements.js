import { supabase } from './supabase.js';

const $ = q => document.querySelector(q);
const set = (q, value) => { const el = $(q); if (el) el.textContent = value; };
const activeRide = () => { try { return JSON.parse(localStorage.getItem('motoActiveRide') || 'null'); } catch { return null; } };
const hav = (a,b) => { if(!a||!b) return Infinity; const R=3958.7613,r=x=>x*Math.PI/180,dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon),q=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(q)); };
const angleDiff = (a,b) => !Number.isFinite(a)||!Number.isFinite(b) ? Infinity : Math.abs(((a-b+540)%360)-180);
const signedAngleDiff = (a,b) => ((a-b+540)%360)-180;
const median = values => { const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b); if(!sorted.length)return null; const middle=Math.floor(sorted.length/2); return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2; };
const spread = values => { const usable=values.filter(Number.isFinite); return usable.length?Math.max(...usable)-Math.min(...usable):0; };
const circularSpread = values => { const usable=values.filter(Number.isFinite); if(usable.length<2)return 0; return Math.max(...usable.map(value=>angleDiff(value,usable[0]))); };
const finite = value => value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;

function normalizeFix(fix){
  if(!fix || !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return null;
  return {
    lat: fix.latitude,
    lon: fix.longitude,
    altitude: Number.isFinite(fix.altitude) ? fix.altitude : null,
    accuracy: Number.isFinite(fix.accuracy) ? fix.accuracy : null,
    heading: Number.isFinite(fix.heading) ? fix.heading : null,
    speed: Number.isFinite(fix.speed) ? fix.speed : null,
    speedMps: Number.isFinite(fix.speedMps) ? fix.speedMps : null,
    timestamp: Number(fix.timestamp || Date.now())
  };
}

function latestGps(){ return normalizeFix(window.MotoGPS || window.__motoLatestGpsFix); }
function waitForGps(timeoutMs=20000){
  const current=latestGps();
  if(current) return Promise.resolve(current);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ window.removeEventListener('moto-gps-fix',onFix); reject(new Error('Waiting for Ride Center GPS fix')); },timeoutMs);
    const onFix=e=>{ const fix=normalizeFix(e.detail)||latestGps(); if(!fix) return; clearTimeout(timer); window.removeEventListener('moto-gps-fix',onFix); resolve(fix); };
    window.addEventListener('moto-gps-fix',onFix);
  });
}

let mounted=false,mounting=false,motionEnabled=false,roadBusy=false,weatherBusy=false,toolsBusy=false;
let lastRoadAt=0,lastRoadPos=null,lastHeading=null,lastWeatherAt=0,lastBridgeAt=0,lastMotionSave=0;
let leanZero=0,rawLean=null,lean=null,pitch=null,roll=null,accelG=null,maxLean=0,maxAccel=0,maxBrake=0;
let leanCalibrated=false,leanCalibrating=false,calibrationSamples=[],lastCalibrationSample=null,lastScreenAngle=null,leanFilter=[];
let weatherSnapshot=null,roadSnapshot=null,motionBuffer=[],timers=[];

function screenAngle(){ const raw=Number(window.screen?.orientation?.angle ?? window.orientation ?? 0); return ((raw%360)+360)%360; }
function rawLeanFromOrientation(event){
  const gamma=finite(event.gamma),beta=finite(event.beta),angle=screenAngle();
  if(angle===90)return Number.isFinite(beta)?-beta:null;
  if(angle===270)return Number.isFinite(beta)?beta:null;
  if(angle===180)return Number.isFinite(gamma)?-gamma:null;
  return gamma;
}
function resetRideMotionState(){
  leanZero=0;rawLean=null;lean=null;pitch=null;roll=null;accelG=null;maxLean=0;maxAccel=0;maxBrake=0;
  leanCalibrated=false;leanCalibrating=false;calibrationSamples=[];lastCalibrationSample=null;lastScreenAngle=screenAngle();leanFilter=[];lastMotionSave=0;
}
function setSensorStatus(text,badge='CALIBRATING'){set('#safeSensorStatus',text);set('#safeSensorsBadge',badge)}
function startLeanCalibration(reason='Auto calibration started. Hold the motorcycle upright and steady, or ride straight at a steady speed.',resetMax=false){
  leanCalibrating=true;leanCalibrated=false;calibrationSamples=[];lastCalibrationSample=null;leanFilter=[];lean=null;lastScreenAngle=screenAngle();
  if(resetMax){maxLean=0;set('#safeMaxLean','0.0°')}
  set('#safeLean','--°');setSensorStatus(reason,'CALIBRATING');
}
function stableCalibrationSample(sample){
  const parked=(!Number.isFinite(sample.speed)||sample.speed<3)&&Math.abs(sample.raw)<=8;
  const moving=Number.isFinite(sample.speed)&&sample.speed>=8&&sample.speed<=100;
  const gravityStable=!Number.isFinite(accelG)||Math.abs(accelG-1)<=0.12;
  if((!parked&&!moving)||!gravityStable)return false;
  if(!lastCalibrationSample)return true;
  const leanStable=Math.abs(signedAngleDiff(sample.raw,lastCalibrationSample.raw))<=1.2;
  const pitchStable=!Number.isFinite(sample.pitch)||!Number.isFinite(lastCalibrationSample.pitch)||Math.abs(sample.pitch-lastCalibrationSample.pitch)<=1.8;
  const yawStable=!Number.isFinite(sample.alpha)||!Number.isFinite(lastCalibrationSample.alpha)||angleDiff(sample.alpha,lastCalibrationSample.alpha)<=3;
  return leanStable&&pitchStable&&yawStable;
}
function calibrationWindowStable(rows){
  if(spread(rows.map(row=>row.raw))>3.5||spread(rows.map(row=>row.pitch))>5)return false;
  const moving=rows.some(row=>Number.isFinite(row.speed)&&row.speed>=8);
  if(!moving)return true;
  const headings=rows.map(row=>row.heading).filter(Number.isFinite),alphas=rows.map(row=>row.alpha).filter(Number.isFinite);
  if(headings.length>=2)return circularSpread(headings)<=6;
  if(alphas.length>=2)return circularSpread(alphas)<=6;
  return true;
}
function finishLeanCalibration(){
  const baseline=median(calibrationSamples.map(row=>row.raw));
  if(!Number.isFinite(baseline))return;
  leanZero=baseline;leanCalibrating=false;leanCalibrated=true;calibrationSamples=[];lastCalibrationSample=null;leanFilter=[];lean=0;
  set('#safeLean','0.0°');setSensorStatus(`Lean calibrated · ${baseline.toFixed(1)}° sensor offset. Only calibrated lean points count toward max lean.`,'ACTIVE');
  window.dispatchEvent(new CustomEvent('moto-lean-calibrated',{detail:{automatic:true,zero:baseline,screenAngle:screenAngle(),timestamp:Date.now()}}));
  publishMotion();
}
function processCalibration(event){
  const now=Date.now(),p=latestGps(),sample={raw:rawLean,pitch,alpha:finite(event.alpha),speed:p?.speed??null,heading:p?.heading??null,at:now};
  if(!stableCalibrationSample(sample)){
    calibrationSamples=[];lastCalibrationSample=sample;
    setSensorStatus('Calibration waiting for an upright, steady motorcycle or a straight steady section.','CALIBRATING');
    return;
  }
  calibrationSamples.push(sample);calibrationSamples=calibrationSamples.filter(row=>now-row.at<=2600);lastCalibrationSample=sample;
  const duration=calibrationSamples.at(-1).at-calibrationSamples[0].at,progress=Math.min(99,Math.round(Math.min(1,calibrationSamples.length/24,duration/1800)*100));
  setSensorStatus(`Auto calibrating lean… ${progress}%`,'CALIBRATING');
  if(calibrationSamples.length>=24&&duration>=1800&&calibrationWindowStable(calibrationSamples))finishLeanCalibration();
}
function updateFilteredLean(candidate){
  const now=Date.now();leanFilter.push({value:candidate,at:now});leanFilter=leanFilter.filter(row=>now-row.at<=300).slice(-15);
  const recent=leanFilter.slice(-7).map(row=>row.value),filtered=median(recent);
  if(!Number.isFinite(filtered)||Math.abs(filtered)>75)return null;
  if(recent.length>=3&&spread(recent)<=7)maxLean=Math.max(maxLean,Math.abs(filtered));
  return filtered;
}
function publishMotion(){
  window.dispatchEvent(new CustomEvent('moto-motion-update',{detail:{lean:leanCalibrated&&Number.isFinite(lean)?lean:null,pitch,roll,accel:accelG,calibrated:leanCalibrated,automaticCalibration:true}}));
}

function panel(title,id,body,open=false){ return `<details class="rideSafePanel" ${open?'open':''}><summary><b>${title}</b><span id="${id}Badge">READY</span></summary><div id="${id}" class="rideSafePanelBody">${body}</div></details>`; }
function markup(){ return `<section id="rideSafeEnhancements" class="rideSafeEnhancements">
  <div class="rideSafeEnhanceHead"><div><small>RIDE INTELLIGENCE</small><h3>Live ride tools</h3></div><span>ONE GPS SOURCE</span></div>
  ${panel('Sensors & lean','safeSensors',`<div class="rideSafeGrid"><article><small>LEAN</small><strong id="safeLean">--°</strong></article><article><small>PITCH</small><strong id="safePitch">--°</strong></article><article><small>ROLL</small><strong id="safeRoll">--°</strong></article><article><small>ACCELERATION</small><strong id="safeAccel">-- g</strong></article><article><small>MAX LEAN</small><strong id="safeMaxLean">0°</strong></article><article><small>MAX G</small><strong id="safeMaxG">0.00 g</strong></article></div><div class="rideSafeActions"><button id="enableRideSensors">ENABLE SENSORS</button><button id="zeroRideLean">RECALIBRATE</button></div><p id="safeSensorStatus">Sensors are separate from GPS. Tap once to grant iPhone motion access.</p>`,true)}
  ${panel('Local weather','safeWeather',`<div class="rideSafeGrid"><article><small>TEMP</small><strong id="safeTemp">--°</strong></article><article><small>RAIN</small><strong id="safeRain">--%</strong></article><article><small>HUMIDITY</small><strong id="safeHumidity">--%</strong></article><article><small>WIND</small><strong id="safeWind">--</strong></article><article><small>SUNRISE</small><strong id="safeSunrise">--</strong></article><article><small>SUNSET</small><strong id="safeSunset">--</strong></article></div><div id="safeWeatherAlert" class="rideSafeInlineAlert" hidden></div><button id="refreshSafeWeather">REFRESH WEATHER</button><p id="safeWeatherStatus">Waiting for the shared Ride Center GPS fix.</p>`)}
  ${panel('Road & speed limit','safeRoad',`<div class="rideSafeRoad"><div><small>ROAD</small><strong id="safeRoadName">Waiting for lookup</strong><span id="safeRoadSource">—</span></div><div class="safeLimit"><small>LIMIT</small><strong id="safeRoadLimit">--</strong></div></div><label>Provider<select id="safeRoadProvider"><option value="auto">Automatic</option><option value="osm">OpenStreetMap</option><option value="tomtom">TomTom</option><option value="google">Google Roads</option></select></label><button id="refreshSafeRoad">REFRESH ROAD</button><p id="safeRoadStatus">Waiting for the shared Ride Center GPS fix.</p>`)}
  ${panel('Ride tools','safeTools',`<div class="rideSafeGrid"><article><small>EST. RANGE</small><strong id="safeRange">—</strong><span id="safeMpg">Fuel data needed</span></article><article><small>NEXT SERVICE</small><strong id="safeService">—</strong><span id="safeServiceSub">No interval</span></article><article><small>ACTIVE TIRES</small><strong id="safeTires">—</strong><span id="safeTiresSub">No profile</span></article></div><div class="rideSafeActions"><button id="safeVoiceNote">RIDE NOTE</button><button id="safeMarkRoad">MARK ROAD</button><button id="refreshSafeTools">REFRESH TOOLS</button></div><p id="safeToolsStatus">Tools load independently from ride logging.</p>`)}
  ${panel('Adventure sharing','safeAdventure',`<div class="rideSafeGrid rideSafeGridTwo"><article><small>MAP FEED</small><strong id="safeAdventureState">READY</strong><span>Uses the same Ride Center GPS position.</span></article><article><small>BACKGROUND</small><strong>OFF</strong><span>iOS may pause the PWA when locked.</span></article></div><p id="safeAdventureStatus">Waiting for the next shared GPS point.</p>`)}
</section>`; }

async function enableSensors(){
  try{
    let ok=true;
    if(typeof DeviceMotionEvent!=='undefined' && typeof DeviceMotionEvent.requestPermission==='function') ok=(await DeviceMotionEvent.requestPermission())==='granted';
    if(ok && typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission==='function') ok=(await DeviceOrientationEvent.requestPermission())==='granted';
    if(!ok) throw new Error('Sensor permission was not granted.');
    if(!motionEnabled){ window.addEventListener('deviceorientation',onOrientation,{passive:true}); window.addEventListener('devicemotion',onMotion,{passive:true}); motionEnabled=true; }
    startLeanCalibration();
  }catch(e){ setSensorStatus(e.message||String(e),'OFF'); }
}
function onOrientation(e){
  if(!motionEnabled)return;
  rawLean=rawLeanFromOrientation(e);pitch=finite(e.beta);roll=finite(e.gamma);
  if(!Number.isFinite(rawLean)){lean=null;publishMotion();return}
  const angle=screenAngle();
  if(lastScreenAngle!==null&&angle!==lastScreenAngle&&(leanCalibrated||leanCalibrating))startLeanCalibration('Phone orientation changed. Auto recalibrating lean.');
  lastScreenAngle=angle;
  if(leanCalibrating){processCalibration(e);lean=null}
  else if(leanCalibrated)lean=updateFilteredLean(signedAngleDiff(rawLean,leanZero));
  else lean=null;
  set('#safeLean',Number.isFinite(lean)?`${lean.toFixed(1)}°`:'--°');set('#safePitch',Number.isFinite(pitch)?`${pitch.toFixed(1)}°`:'--°');set('#safeRoll',Number.isFinite(roll)?`${roll.toFixed(1)}°`:'--°');set('#safeMaxLean',`${maxLean.toFixed(1)}°`);
  publishMotion();
}
function onMotion(e){
  if(!motionEnabled)return;
  const a=e.accelerationIncludingGravity||e.acceleration||{};
  if([a.x,a.y,a.z].every(Number.isFinite)){accelG=Math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z)/9.80665;maxAccel=Math.max(maxAccel,accelG);maxBrake=Math.max(maxBrake,Math.max(0,-Number(a.y||0)/9.80665));set('#safeAccel',`${accelG.toFixed(2)} g`);set('#safeMaxG',`${maxAccel.toFixed(2)} g`)}
  if(Date.now()-lastMotionSave>=500)queueMotionSample(a);
  publishMotion();
}
function queueMotionSample(a){
  const ride=activeRide(),p=latestGps();if(!ride?.id||!motionEnabled)return;lastMotionSave=Date.now();
  motionBuffer.push({session_id:ride.id,recorded_at:new Date().toISOString(),latitude:p?.lat??null,longitude:p?.lon??null,altitude_m:p?.altitude??null,accuracy_m:p?.accuracy??null,speed_mps:p?.speedMps??null,heading_deg:p?.heading??null,accel_x:a.x??null,accel_y:a.y??null,accel_z:a.z??null,accel_g:accelG,rotation_beta:pitch,rotation_gamma:roll,lean_deg:leanCalibrated&&Number.isFinite(lean)?lean:null,pitch_deg:pitch,roll_deg:roll});
  if(motionBuffer.length>=12)void flushMotion();
}
async function flushMotion(){
  if(!motionBuffer.length)return;
  const rows=motionBuffer.splice(0),rideId=rows.find(row=>row.session_id)?.session_id;
  if(!rideId)return;
  const {data:{session}}=await supabase.auth.getSession();rows.forEach(row=>row.user_id=session?.user?.id);
  const {error}=await supabase.from('ride_samples').insert(rows);
  if(error){console.warn('Motion samples skipped',error);motionBuffer.unshift(...rows.slice(-80))}
}

async function refreshWeather(force=false){
  if(weatherBusy||(!force&&Date.now()-lastWeatherAt<600000))return;weatherBusy=true;set('#safeWeatherStatus','Updating weather…');
  try{
    const p=latestGps()||await waitForGps();
    const u=new URLSearchParams({latitude:p.lat,longitude:p.lon,current:'temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,wind_direction_10m',daily:'sunrise,sunset',temperature_unit:'fahrenheit',wind_speed_unit:'mph',timezone:'auto',forecast_days:'1'});
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?${u}`);if(!r.ok)throw new Error(`Weather HTTP ${r.status}`);
    const d=await r.json(),c=d.current||{},day=d.daily||{};
    weatherSnapshot={temperature_f:Number(c.temperature_2m),rain_percent:Number(c.precipitation_probability),humidity_percent:Number(c.relative_humidity_2m),wind_mph:Number(c.wind_speed_10m),wind_direction_deg:Number(c.wind_direction_10m),sunrise:day.sunrise?.[0]||null,sunset:day.sunset?.[0]||null,recorded_at:new Date().toISOString()};
    set('#safeTemp',Number.isFinite(weatherSnapshot.temperature_f)?`${Math.round(weatherSnapshot.temperature_f)}°`:'--°');set('#safeRain',Number.isFinite(weatherSnapshot.rain_percent)?`${Math.round(weatherSnapshot.rain_percent)}%`:'--%');set('#safeHumidity',Number.isFinite(weatherSnapshot.humidity_percent)?`${Math.round(weatherSnapshot.humidity_percent)}%`:'--%');set('#safeWind',Number.isFinite(weatherSnapshot.wind_mph)?`${Math.round(weatherSnapshot.wind_mph)} mph`:'--');set('#safeSunrise',weatherSnapshot.sunrise?new Date(weatherSnapshot.sunrise).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'--');set('#safeSunset',weatherSnapshot.sunset?new Date(weatherSnapshot.sunset).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'--');
    const alerts=[];if(weatherSnapshot.rain_percent>=40)alerts.push(`${Math.round(weatherSnapshot.rain_percent)}% rain`);if(weatherSnapshot.wind_mph>=25)alerts.push(`${Math.round(weatherSnapshot.wind_mph)} mph wind`);if(weatherSnapshot.temperature_f<=40)alerts.push(`${Math.round(weatherSnapshot.temperature_f)}°F`);const box=$('#safeWeatherAlert');if(box){box.hidden=!alerts.length;box.textContent=alerts.length?`Ride advisory: ${alerts.join(' · ')}`:''}
    lastWeatherAt=Date.now();set('#safeWeatherStatus',`Using shared GPS · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`);set('#safeWeatherBadge','LIVE');
  }catch(e){set('#safeWeatherStatus',e.message||String(e));set('#safeWeatherBadge','ERROR')}finally{weatherBusy=false}
}

async function refreshRoad(force=false,reason='manual'){
  if(roadBusy)return;roadBusy=true;set('#safeRoadStatus',`Road lookup: ${reason}`);
  try{
    const p=latestGps()||await waitForGps(),provider=$('#safeRoadProvider')?.value||'auto',params=new URLSearchParams({lat:p.lat,lon:p.lon,provider});
    if(Number.isFinite(p.heading))params.set('heading',p.heading);if(Number.isFinite(p.speed))params.set('speed',p.speed);if(lastRoadPos){params.set('prevLat',lastRoadPos.lat);params.set('prevLon',lastRoadPos.lon)}
    const {data:{session}}=await supabase.auth.getSession(),headers={Accept:'application/json'};if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
    const r=await fetch(`/api/road-info?${params}`,{headers}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Road HTTP ${r.status}`);
    lastRoadAt=Date.now();lastRoadPos=p;lastHeading=p.heading;roadSnapshot={road:d.road||null,limit_mph:Number(d.limit?.mph??d.limit?.display),source:d.source||'MotoCloud',recorded_at:new Date().toISOString()};
    set('#safeRoadName',roadSnapshot.road||'Road not identified');set('#safeRoadLimit',Number.isFinite(roadSnapshot.limit_mph)?roadSnapshot.limit_mph:'--');set('#safeRoadSource',roadSnapshot.source);set('#safeRoadStatus',`${d.diagnostic||'Lookup complete'} · shared GPS`);set('#safeRoadBadge','LIVE');
  }catch(e){set('#safeRoadStatus',e.message||String(e));set('#safeRoadBadge','ERROR')}finally{roadBusy=false}
}
async function roadMonitor(){if(!mounted)return;const p=latestGps();if(!p)return;const moved=hav(lastRoadPos,p),turned=angleDiff(lastHeading,p.heading),age=Date.now()-lastRoadAt;let reason=null;if(!lastRoadAt)reason='initial';else if(moved>=0.08)reason='moved 400+ ft';else if(turned>=30)reason='significant turn';else if(age>=180000)reason='3-minute refresh';if(reason)await refreshRoad(false,reason)}

async function refreshTools(){
  if(toolsBusy)return;toolsBusy=true;set('#safeToolsStatus','Loading tools…');
  try{
    const ride=activeRide(),{data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Not signed in');
    const {data:bike}=await supabase.from('bikes').select('*').eq('id',ride?.bikeId).maybeSingle();if(!bike)throw new Error('Active bike not found');
    const [f,m,t,r]=await Promise.all([supabase.from('fuel_entries').select('*').eq('bike_id',bike.id).order('odometer_miles'),supabase.from('maintenance_intervals').select('*').eq('bike_id',bike.id).eq('enabled',true),supabase.from('tire_profiles').select('*').eq('bike_id',bike.id).eq('active',true).limit(1).maybeSingle(),supabase.from('ride_sessions').select('duration_seconds').eq('bike_id',bike.id).eq('status','complete')]);
    const fuel=f.data||[],full=fuel.filter(x=>x.full_tank);let mi=0,gal=0;for(let i=1;i<full.length;i++){const d=Number(full[i].odometer_miles)-Number(full[i-1].odometer_miles);if(d>0&&d<2000){mi+=d;gal+=Number(full[i].gallons||0)}}
    const mpg=gal?mi/gal:null,tank=Number(bike.tank_capacity_gallons||2);set('#safeMpg',mpg?`${mpg.toFixed(1)} mpg`:'Need two full fill-ups');set('#safeRange',mpg?`${Math.round(mpg*tank)} mi`:'—');
    const odo=Number(bike.odometer||0),hrs=(r.data||[]).reduce((a,x)=>a+Number(x.duration_seconds||0),0)/3600,due=(m.data||[]).map(x=>({x,rem:Number.isFinite(Number(x.interval_miles))?Number(x.interval_miles)-(odo-Number(x.last_service_miles||0)):Number.isFinite(Number(x.interval_hours))?Number(x.interval_hours)-(hrs-Number(x.last_service_hours||0)):Infinity})).sort((a,b)=>a.rem-b.rem)[0];
    set('#safeService',due?.x?.item_name||'—');set('#safeServiceSub',Number.isFinite(due?.rem)?`${Math.round(due.rem)} remaining`:'No interval');set('#safeTires',t.data?.name||'—');set('#safeTiresSub',t.data?'Active profile':'No profile');set('#safeToolsStatus','Ride tools current');set('#safeToolsBadge','LIVE');
  }catch(e){set('#safeToolsStatus',e.message||String(e));set('#safeToolsBadge','ERROR')}finally{toolsBusy=false}
}
async function saveNote(){const text=prompt('Ride note:');if(!text)return;try{const ride=activeRide(),p=latestGps();if(!p)throw new Error('Waiting for shared GPS fix');const {data:{session}}=await supabase.auth.getSession();const {error}=await supabase.from('ride_notes').insert({user_id:session.user.id,bike_id:ride?.bikeId||null,session_id:ride?.id||null,note_text:text,latitude:p.lat,longitude:p.lon,speed_mph:p.speed,heading_deg:p.heading});if(error)throw error;set('#safeToolsStatus','Ride note saved')}catch(e){set('#safeToolsStatus',e.message||String(e))}}
async function markRoad(){const type=prompt('Road condition (gravel, pothole, construction, water, police, accident, curve, trail):','gravel');if(!type)return;try{const ride=activeRide(),p=latestGps();if(!p)throw new Error('Waiting for shared GPS fix');const {data:{session}}=await supabase.auth.getSession();const {error}=await supabase.from('road_condition_tags').insert({user_id:session.user.id,bike_id:ride?.bikeId||null,session_id:ride?.id||null,tag_type:type,latitude:p.lat,longitude:p.lon,road_name:roadSnapshot?.road||null,speed_mph:p.speed});if(error)throw error;set('#safeToolsStatus',`${type} marked`)}catch(e){set('#safeToolsStatus',e.message||String(e))}}
function bridgeAdventure(){if(!mounted||Date.now()-lastBridgeAt<2500)return;const p=latestGps();if(!p){set('#safeAdventureStatus','Waiting for shared GPS fix.');return}lastBridgeAt=Date.now();window.dispatchEvent(new CustomEvent('moto-position',{detail:{latitude:p.lat,longitude:p.lon,altitude:p.altitude,accuracy:p.accuracy,speed:p.speed,heading:p.heading,timestamp:p.timestamp}}));set('#safeAdventureState','ACTIVE');set('#safeAdventureStatus',`Shared ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`)}
async function finalizeEnhancements(rideId){
  if(!rideId)return;
  const captured={maxLean,maxAccel,maxBrake,weather:weatherSnapshot,road:roadSnapshot};
  try{
    await flushMotion();
    const {data:leanRows,error:leanError}=await supabase.from('ride_samples').select('lean_deg').eq('session_id',rideId).not('lean_deg','is',null).limit(20000);
    if(leanError)console.warn('Lean summary query skipped',leanError);
    const savedLean=(leanRows||[]).map(row=>finite(row.lean_deg)).filter(Number.isFinite),savedMax=savedLean.length?Math.max(...savedLean.map(value=>Math.abs(value))):0;
    const summary={max_accel_g:captured.maxAccel,max_brake_g:captured.maxBrake,max_lean_deg:Math.max(captured.maxLean,savedMax)};
    const {error}=await supabase.from('ride_sessions').update(summary).eq('id',rideId);if(error)console.warn('Enhanced summary update skipped',error);
    localStorage.setItem(`motoRideEnhancement:${rideId}`,JSON.stringify({weather:captured.weather,road:captured.road,lean_points:savedLean.length,...summary,saved_at:new Date().toISOString()}));
  }catch(e){console.warn('Enhanced ride finalization skipped',e)}
}

async function mount(){
  if(mounted||mounting||!$('#rideStop')||$('#rideSafeEnhancements'))return;mounting=true;
  try{
    await flushMotion();resetRideMotionState();await new Promise(r=>setTimeout(r,900));if(!$('#rideStop')||$('#rideSafeEnhancements'))return;
    const body=$('#rideCenterBody');if(!body)return;body.insertAdjacentHTML('beforeend',markup());mounted=true;
    $('#enableRideSensors').onclick=enableSensors;$('#zeroRideLean').onclick=()=>startLeanCalibration('Manual recalibration started. Hold the motorcycle upright and steady, or ride straight at a steady speed.',true);$('#refreshSafeWeather').onclick=()=>refreshWeather(true);$('#refreshSafeRoad').onclick=()=>refreshRoad(true,'manual');$('#refreshSafeTools').onclick=refreshTools;$('#safeVoiceNote').onclick=saveNote;$('#safeMarkRoad').onclick=markRoad;
    timers.push(setTimeout(()=>refreshWeather(false),800),setTimeout(()=>refreshRoad(false,'ride stabilized'),1400),setTimeout(refreshTools,2200),setInterval(roadMonitor,15000),setInterval(()=>refreshWeather(false),600000),setInterval(bridgeAdventure,3000),setInterval(()=>void flushMotion(),10000));
  }finally{mounting=false}
}
function unmount(){
  mounted=false;timers.forEach(clearInterval);timers=[];void flushMotion();window.removeEventListener('deviceorientation',onOrientation);window.removeEventListener('devicemotion',onMotion);motionEnabled=false;leanCalibrating=false;leanCalibrated=false;
}
window.MotoLeanCalibration={start:()=>startLeanCalibration('Manual recalibration started. Hold the motorcycle upright and steady, or ride straight at a steady speed.',true),getState:()=>({calibrated:leanCalibrated,calibrating:leanCalibrating,zero:leanZero,maxLean})};
window.addEventListener('moto-ride-complete',event=>void finalizeEnhancements(event.detail?.sessionId));
const observer=new MutationObserver(()=>queueMicrotask(()=>{if($('#rideStop'))mount();else if(mounted)unmount()}));observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('pagehide',()=>{void flushMotion();unmount()});
mount();
