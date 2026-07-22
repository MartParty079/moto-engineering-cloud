import { supabase } from './supabase.js';

const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const hav = (a,b) => {
  if(!a || !b) return Infinity;
  const R = 3958.7613;
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
};
const angleDiff = (a,b) => !Number.isFinite(a) || !Number.isFinite(b) ? Infinity : Math.abs(((a - b + 540) % 360) - 180);
const signedAngleDiff = (a,b) => ((a - b + 540) % 360) - 180;
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a - b);
  if(!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const spread = values => {
  const usable = values.filter(Number.isFinite);
  return usable.length ? Math.max(...usable) - Math.min(...usable) : 0;
};

const PERMISSION_STORE = 'moto-startup-permissions-v1';
const CALIBRATION = {
  minSpeedMph: 8,
  maxSpeedMph: 100,
  minDurationMs: 2200,
  sampleWindowMs: 3600,
  minSamples: 28,
  maxHeadingChangeDeg: 6,
  maxRawSpreadDeg: 3.5,
  maxPitchSpreadDeg: 4,
  maxAccelDeltaG: .16
};

let runtimeActive = false;
let motionEnabled = false;
let leanZero = 0;
let rawLean = null;
let lean = null;
let pitch = null;
let roll = null;
let accelG = null;
let maxLean = 0;
let maxAccel = 0;
let maxBrake = 0;
let leanCalibrated = false;
let leanCalibrating = false;
let calibrationSamples = [];
let lastCalibrationSample = null;
let calibrationReason = 'automatic';
let calibrationPhase = 'permission';
let calibrationProgress = 0;
let calibratedAt = 0;
let lastScreenAngle = null;
let leanFilter = [];
let lastMotionSave = 0;
let motionBuffer = [];
let weatherSnapshot = null;
let roadSnapshot = null;
let weatherBusy = false;
let roadBusy = false;
let toolsBusy = false;
let lastWeatherAt = 0;
let lastRoadAt = 0;
let lastRoadPos = null;
let lastHeading = null;
let lastBridgeAt = 0;
let timers = [];

function activeRide(){
  const state = window.MotoRide?.getState?.() || window.MotoRideState || {};
  if(state.active) return state;
  try{
    const saved = JSON.parse(localStorage.getItem('motoActiveRide') || 'null');
    return saved ? {active:true,sessionId:saved.id,bikeId:saved.bikeId} : null;
  }catch{return null;}
}

function normalizeFix(fix){
  if(!fix || !Number.isFinite(Number(fix.latitude)) || !Number.isFinite(Number(fix.longitude))) return null;
  return {
    lat:Number(fix.latitude),lon:Number(fix.longitude),
    altitude:finite(fix.altitude),accuracy:finite(fix.accuracy),heading:finite(fix.heading),speed:finite(fix.speed),speedMps:finite(fix.speedMps),timestamp:Number(fix.timestamp || Date.now())
  };
}

function latestGps(){ return normalizeFix(window.MotoGPS || window.__motoLatestGpsFix); }
function waitForGps(timeoutMs = 20000){
  const current = latestGps();
  if(current) return Promise.resolve(current);
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => { window.removeEventListener('moto-gps-fix',onFix); reject(new Error('Waiting for GPS fix')); },timeoutMs);
    const onFix = event => {
      const fix = normalizeFix(event.detail) || latestGps();
      if(!fix) return;
      clearTimeout(timer);
      window.removeEventListener('moto-gps-fix',onFix);
      resolve(fix);
    };
    window.addEventListener('moto-gps-fix',onFix);
  });
}

function rememberedMotionGranted(){
  if(window.MotoPermissions?.motion === 'granted') return true;
  try{return JSON.parse(localStorage.getItem(PERMISSION_STORE) || 'null')?.motion === 'granted';}catch{return false;}
}

function screenAngle(){
  const raw = Number(window.screen?.orientation?.angle ?? window.orientation ?? 0);
  return ((raw % 360) + 360) % 360;
}

function rawLeanFromOrientation(event){
  const gamma = finite(event.gamma);
  const beta = finite(event.beta);
  const angle = screenAngle();
  if(angle === 90) return Number.isFinite(beta) ? -beta : null;
  if(angle === 270) return Number.isFinite(beta) ? beta : null;
  if(angle === 180) return Number.isFinite(gamma) ? -gamma : null;
  return gamma;
}

function calibrationStatus(){
  if(!motionEnabled) return 'SENSOR PERMISSION REQUIRED';
  if(leanCalibrated) return 'CALIBRATED';
  if(calibrationPhase === 'sampling') return `CALIBRATING ${calibrationProgress}%`;
  if(calibrationPhase === 'waiting-heading') return 'WAITING FOR GPS HEADING';
  if(calibrationPhase === 'waiting-straight') return 'RIDE STRAIGHT AND STEADY';
  return `MOVE ABOVE ${CALIBRATION.minSpeedMph} MPH`;
}

function publishMotion(){
  window.dispatchEvent(new CustomEvent('moto-motion-update',{detail:{
    lean:leanCalibrated && Number.isFinite(lean) ? lean : null,
    pitch,roll,accel:accelG,calibrated:leanCalibrated,calibrating:leanCalibrating,
    calibrationPhase,calibrationProgress,calibrationStatus:calibrationStatus(),calibrationReason,
    waitingForMovement:motionEnabled && leanCalibrating && calibrationPhase === 'waiting-motion',
    motionEnabled,maxLean,automaticCalibration:true,calibratedAt:calibratedAt || null
  }}));
}

function resetRideMotionState(){
  rawLean = null; lean = null; pitch = null; roll = null; accelG = null;
  maxLean = 0; maxAccel = 0; maxBrake = 0;
  calibrationSamples = []; lastCalibrationSample = null; leanFilter = []; lastScreenAngle = screenAngle(); lastMotionSave = 0;
  if(motionEnabled) startLeanCalibration(true,'ride-start');
  else {
    leanCalibrated = false;
    leanCalibrating = false;
    calibrationPhase = 'permission';
    calibrationProgress = 0;
    publishMotion();
  }
}

function startLeanCalibration(resetMax = false, reason = 'automatic'){
  calibrationReason = reason;
  calibrationSamples = [];
  lastCalibrationSample = null;
  calibrationProgress = 0;
  leanFilter = [];
  lean = null;
  lastScreenAngle = screenAngle();
  if(resetMax) maxLean = 0;
  if(!motionEnabled){
    leanCalibrated = false;
    leanCalibrating = false;
    calibrationPhase = 'permission';
    publishMotion();
    return false;
  }
  leanCalibrated = false;
  leanCalibrating = true;
  calibrationPhase = 'waiting-motion';
  window.dispatchEvent(new CustomEvent('moto-lean-calibration-started',{detail:{automatic:true,reason,minSpeedMph:CALIBRATION.minSpeedMph,timestamp:Date.now()}}));
  publishMotion();
  return true;
}

function stableCalibrationSample(sample){
  if(!Number.isFinite(sample.speed) || sample.speed < CALIBRATION.minSpeedMph || sample.speed > CALIBRATION.maxSpeedMph) {
    calibrationPhase = 'waiting-motion';
    return false;
  }
  if(!Number.isFinite(sample.heading)) {
    calibrationPhase = 'waiting-heading';
    return false;
  }
  if(!Number.isFinite(sample.raw) || Math.abs(sample.raw) > 35) {
    calibrationPhase = 'waiting-straight';
    return false;
  }
  if(Number.isFinite(accelG) && Math.abs(accelG - 1) > CALIBRATION.maxAccelDeltaG) {
    calibrationPhase = 'waiting-straight';
    return false;
  }
  const first = calibrationSamples[0];
  if(first && angleDiff(sample.heading,first.heading) > CALIBRATION.maxHeadingChangeDeg) {
    calibrationPhase = 'waiting-straight';
    return false;
  }
  if(lastCalibrationSample){
    const rawStep = Math.abs(signedAngleDiff(sample.raw,lastCalibrationSample.raw));
    const pitchStep = Number.isFinite(sample.pitch) && Number.isFinite(lastCalibrationSample.pitch) ? Math.abs(sample.pitch-lastCalibrationSample.pitch) : 0;
    const speedStep = Number.isFinite(lastCalibrationSample.speed) ? Math.abs(sample.speed-lastCalibrationSample.speed) : 0;
    if(rawStep > 1.6 || pitchStep > 2.4 || speedStep > 15){
      calibrationPhase = 'waiting-straight';
      return false;
    }
  }
  return true;
}

function finishLeanCalibration(){
  const baseline = median(calibrationSamples.map(row => row.raw));
  if(!Number.isFinite(baseline)) return;
  const point = latestGps();
  leanZero = baseline;
  leanCalibrating = false;
  leanCalibrated = true;
  calibrationPhase = 'ready';
  calibrationProgress = 100;
  calibratedAt = Date.now();
  calibrationSamples = [];
  lastCalibrationSample = null;
  leanFilter = [];
  lean = 0;
  try{
    localStorage.setItem('motoLeanCalibrationV2',JSON.stringify({zero:baseline,screenAngle:screenAngle(),speed:point?.speed ?? null,heading:point?.heading ?? null,reason:calibrationReason,calibratedAt}));
  }catch{}
  window.dispatchEvent(new CustomEvent('moto-lean-calibrated',{detail:{automatic:true,zero:baseline,screenAngle:screenAngle(),speed:point?.speed ?? null,heading:point?.heading ?? null,reason:calibrationReason,timestamp:calibratedAt}}));
  publishMotion();
}

function processCalibration(event){
  const now = Date.now();
  const point = latestGps();
  const sample = {raw:rawLean,pitch,alpha:finite(event.alpha),speed:point?.speed ?? null,heading:point?.heading ?? null,at:now};
  if(!stableCalibrationSample(sample)){
    calibrationSamples = [];
    calibrationProgress = 0;
    lastCalibrationSample = sample;
    return;
  }
  calibrationPhase = 'sampling';
  calibrationSamples.push(sample);
  calibrationSamples = calibrationSamples.filter(row => now-row.at <= CALIBRATION.sampleWindowMs);
  lastCalibrationSample = sample;
  const duration = calibrationSamples.length > 1 ? calibrationSamples.at(-1).at-calibrationSamples[0].at : 0;
  calibrationProgress = Math.min(99,Math.round(duration/CALIBRATION.minDurationMs*100));
  const headingBase = calibrationSamples[0]?.heading;
  const headingSpread = calibrationSamples.reduce((max,row)=>Math.max(max,angleDiff(row.heading,headingBase)),0);
  const ready = calibrationSamples.length >= CALIBRATION.minSamples &&
    duration >= CALIBRATION.minDurationMs &&
    spread(calibrationSamples.map(row=>row.raw)) <= CALIBRATION.maxRawSpreadDeg &&
    spread(calibrationSamples.map(row=>row.pitch)) <= CALIBRATION.maxPitchSpreadDeg &&
    headingSpread <= CALIBRATION.maxHeadingChangeDeg;
  if(ready) finishLeanCalibration();
}

function updateFilteredLean(candidate){
  const now = Date.now();
  leanFilter.push({value:candidate,at:now});
  leanFilter = leanFilter.filter(row => now-row.at <= 300).slice(-15);
  const recent = leanFilter.slice(-7).map(row => row.value);
  const filtered = median(recent);
  if(!Number.isFinite(filtered) || Math.abs(filtered) > 75) return null;
  if(recent.length >= 3 && spread(recent) <= 7) maxLean = Math.max(maxLean,Math.abs(filtered));
  return filtered;
}

function onOrientation(event){
  if(!motionEnabled) return;
  rawLean = rawLeanFromOrientation(event);
  pitch = finite(event.beta);
  roll = finite(event.gamma);
  if(!Number.isFinite(rawLean)){ lean = null; publishMotion(); return; }
  const angle = screenAngle();
  if(lastScreenAngle !== null && angle !== lastScreenAngle) startLeanCalibration(false,'screen-rotation');
  lastScreenAngle = angle;
  if(leanCalibrating){ processCalibration(event); lean = null; }
  else if(leanCalibrated) lean = updateFilteredLean(signedAngleDiff(rawLean,leanZero));
  else startLeanCalibration(false,'automatic-recovery');
  publishMotion();
}

function onMotion(event){
  if(!motionEnabled) return;
  const acceleration = event.accelerationIncludingGravity || event.acceleration || {};
  const x = finite(acceleration.x), y = finite(acceleration.y), z = finite(acceleration.z);
  if([x,y,z].every(Number.isFinite)){
    accelG = Math.sqrt(x*x+y*y+z*z)/9.80665;
    maxAccel = Math.max(maxAccel,accelG);
    maxBrake = Math.max(maxBrake,Math.max(0,-y/9.80665));
  }
  if(Date.now()-lastMotionSave >= 500) queueMotionSample({x,y,z});
  publishMotion();
}

function installSensorListeners(){
  if(motionEnabled) return false;
  window.addEventListener('deviceorientation',onOrientation,{passive:true});
  window.addEventListener('devicemotion',onMotion,{passive:true});
  motionEnabled = true;
  calibrationPhase = 'waiting-motion';
  window.dispatchEvent(new CustomEvent('moto-sensors-enabled',{detail:{automaticCalibration:true,timestamp:Date.now()}}));
  return true;
}

function removeSensorListeners(){
  window.removeEventListener('deviceorientation',onOrientation);
  window.removeEventListener('devicemotion',onMotion);
  motionEnabled = false;
  leanCalibrated = false;
  leanCalibrating = false;
  calibrationPhase = 'permission';
  calibrationProgress = 0;
  publishMotion();
}

async function requestSensorPermission(){
  const requests = [];
  if(typeof window.DeviceMotionEvent?.requestPermission === 'function') requests.push(Promise.resolve(window.DeviceMotionEvent.requestPermission()));
  if(typeof window.DeviceOrientationEvent?.requestPermission === 'function') requests.push(Promise.resolve(window.DeviceOrientationEvent.requestPermission()));
  if(requests.length){
    const results = await Promise.all(requests);
    if(!results.every(result=>result === 'granted')) throw new Error('Motion sensor permission was not granted.');
  }else if(!('DeviceMotionEvent' in window) && !('DeviceOrientationEvent' in window)){
    throw new Error('Motion sensors are not supported on this device.');
  }
  return true;
}

async function enableSensors(options = {}){
  const settings = typeof options === 'boolean' ? {requestPermission:options} : (options || {});
  if(settings.requestPermission !== false) await requestSensorPermission();
  else if(!rememberedMotionGranted() && (typeof window.DeviceMotionEvent?.requestPermission === 'function' || typeof window.DeviceOrientationEvent?.requestPermission === 'function')) {
    throw new Error('Open the startup permission prompt before enabling sensors.');
  }
  installSensorListeners();
  if(settings.autoCalibrate !== false) startLeanCalibration(Boolean(settings.resetMax),settings.reason || 'sensor-enabled');
  return {enabled:true,calibrating:leanCalibrating,phase:calibrationPhase,minSpeedMph:CALIBRATION.minSpeedMph};
}

function queueMotionSample(acceleration){
  const ride = activeRide();
  const point = latestGps();
  if(!ride?.sessionId || !motionEnabled) return;
  lastMotionSave = Date.now();
  motionBuffer.push({
    session_id:ride.sessionId,recorded_at:new Date().toISOString(),latitude:point?.lat ?? null,longitude:point?.lon ?? null,altitude_m:point?.altitude ?? null,accuracy_m:point?.accuracy ?? null,speed_mps:point?.speedMps ?? null,heading_deg:point?.heading ?? null,
    accel_x:acceleration.x ?? null,accel_y:acceleration.y ?? null,accel_z:acceleration.z ?? null,accel_g:accelG,rotation_beta:pitch,rotation_gamma:roll,lean_deg:leanCalibrated && Number.isFinite(lean) ? lean : null,pitch_deg:pitch,roll_deg:roll
  });
  if(motionBuffer.length >= 12) void flushMotion();
}

async function flushMotion(){
  if(!motionBuffer.length) return;
  const rows = motionBuffer.splice(0);
  const {data:{session}} = await supabase.auth.getSession();
  if(!session){ motionBuffer.unshift(...rows.slice(-80)); return; }
  rows.forEach(row => { row.user_id = session.user.id; });
  const {error} = await supabase.from('ride_samples').insert(rows);
  if(error){ console.warn('Motion samples skipped',error); motionBuffer.unshift(...rows.slice(-80)); }
}

async function refreshWeather(force = false){
  if(weatherBusy || (!force && Date.now()-lastWeatherAt < 600000)) return weatherSnapshot;
  weatherBusy = true;
  try{
    const point = latestGps() || await waitForGps();
    const params = new URLSearchParams({latitude:point.lat,longitude:point.lon,current:'temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,wind_direction_10m',daily:'sunrise,sunset',temperature_unit:'fahrenheit',wind_speed_unit:'mph',timezone:'auto',forecast_days:'1'});
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if(!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    const data = await response.json();
    const current = data.current || {};
    const daily = data.daily || {};
    weatherSnapshot = {temperature:Number(current.temperature_2m),temp:Number(current.temperature_2m),rainChance:Number(current.precipitation_probability),rain:Number(current.precipitation_probability),humidity:Number(current.relative_humidity_2m),wind:Number(current.wind_speed_10m),windDirection:Number(current.wind_direction_10m),sunrise:daily.sunrise?.[0] || null,sunset:daily.sunset?.[0] || null,recordedAt:new Date().toISOString()};
    lastWeatherAt = Date.now();
    window.dispatchEvent(new CustomEvent('moto-weather-update',{detail:weatherSnapshot}));
    return weatherSnapshot;
  }finally{weatherBusy = false;}
}

async function refreshRoad(force = false,reason = 'manual'){
  if(roadBusy || (!force && Date.now()-lastRoadAt < 15000)) return roadSnapshot;
  roadBusy = true;
  try{
    const point = latestGps() || await waitForGps();
    const provider = localStorage.getItem('motoRoadProvider') || 'auto';
    const params = new URLSearchParams({lat:point.lat,lon:point.lon,provider});
    if(Number.isFinite(point.heading)) params.set('heading',point.heading);
    if(Number.isFinite(point.speed)) params.set('speed',point.speed);
    if(lastRoadPos){params.set('prevLat',lastRoadPos.lat);params.set('prevLon',lastRoadPos.lon);}
    const {data:{session}} = await supabase.auth.getSession();
    const headers = {Accept:'application/json'};
    if(session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const response = await fetch(`/api/road-info?${params}`,{headers});
    const data = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error || `Road HTTP ${response.status}`);
    roadSnapshot = {road:data.road || null,limit_mph:Number(data.limit?.mph ?? data.limit?.display),source:data.source || 'MotoCloud',reason,recordedAt:new Date().toISOString()};
    lastRoadAt = Date.now();
    lastRoadPos = point;
    lastHeading = point.heading;
    window.dispatchEvent(new CustomEvent('moto-road-update',{detail:roadSnapshot}));
    return roadSnapshot;
  }finally{roadBusy = false;}
}

async function roadMonitor(){
  if(!runtimeActive) return;
  const point = latestGps();
  if(!point) return;
  const moved = hav(lastRoadPos,point);
  const turned = angleDiff(lastHeading,point.heading);
  const age = Date.now()-lastRoadAt;
  if(!lastRoadAt || moved >= .08 || turned >= 30 || age >= 180000) await refreshRoad(true,!lastRoadAt ? 'initial' : moved >= .08 ? 'moved' : turned >= 30 ? 'turned' : 'timed');
}

async function refreshTools(){
  if(toolsBusy) return null;
  toolsBusy = true;
  try{
    const ride = activeRide();
    const {data:{session}} = await supabase.auth.getSession();
    if(!session || !ride?.bikeId) return null;
    const {data:bike} = await supabase.from('bikes').select('*').eq('id',ride.bikeId).maybeSingle();
    if(!bike) return null;
    const {data:fuelRows} = await supabase.from('fuel_entries').select('*').eq('bike_id',bike.id).order('odometer_miles');
    const full = (fuelRows || []).filter(row=>row.full_tank);
    let miles = 0, gallons = 0;
    for(let index=1;index<full.length;index++){
      const delta = Number(full[index].odometer_miles)-Number(full[index-1].odometer_miles);
      if(delta > 0 && delta < 2000){miles += delta;gallons += Number(full[index].gallons || 0);}
    }
    const mpg = gallons ? miles/gallons : null;
    const range = mpg ? Math.round(mpg*Number(bike.tank_capacity_gallons || 2)) : null;
    if(range) localStorage.setItem('motoEstimatedRange',String(range));
    const detail = {mpg,range,bikeId:bike.id};
    window.dispatchEvent(new CustomEvent('moto-tools-update',{detail}));
    return detail;
  }finally{toolsBusy = false;}
}

async function saveNote(text){
  const note = text || prompt('Ride note:');
  if(!note) return;
  const ride = activeRide();
  const point = latestGps() || await waitForGps();
  const {data:{session}} = await supabase.auth.getSession();
  const {error} = await supabase.from('ride_notes').insert({user_id:session.user.id,bike_id:ride?.bikeId || null,session_id:ride?.sessionId || null,note_text:note,latitude:point.lat,longitude:point.lon,speed_mph:point.speed,heading_deg:point.heading});
  if(error) throw error;
}

async function markRoad(type){
  const tag = type || prompt('Road condition (gravel, pothole, construction, water, police, accident, curve, trail):','gravel');
  if(!tag) return;
  const ride = activeRide();
  const point = latestGps() || await waitForGps();
  const {data:{session}} = await supabase.auth.getSession();
  const {error} = await supabase.from('road_condition_tags').insert({user_id:session.user.id,bike_id:ride?.bikeId || null,session_id:ride?.sessionId || null,tag_type:tag,latitude:point.lat,longitude:point.lon,road_name:roadSnapshot?.road || null,speed_mph:point.speed});
  if(error) throw error;
}

function bridgeAdventure(){
  if(!runtimeActive || Date.now()-lastBridgeAt < 2500) return;
  const point = latestGps();
  if(!point) return;
  lastBridgeAt = Date.now();
  window.dispatchEvent(new CustomEvent('moto-position',{detail:{latitude:point.lat,longitude:point.lon,altitude:point.altitude,accuracy:point.accuracy,speed:point.speed,heading:point.heading,timestamp:point.timestamp}}));
}

async function finalizeEnhancements(rideId){
  if(!rideId) return;
  const captured = {maxLean,maxAccel,maxBrake,weather:weatherSnapshot,road:roadSnapshot};
  try{
    await flushMotion();
    const {data:leanRows} = await supabase.from('ride_samples').select('lean_deg').eq('session_id',rideId).not('lean_deg','is',null).limit(20000);
    const savedLean = (leanRows || []).map(row=>finite(row.lean_deg)).filter(Number.isFinite);
    const savedMax = savedLean.length ? Math.max(...savedLean.map(value=>Math.abs(value))) : 0;
    const summary = {max_accel_g:captured.maxAccel,max_brake_g:captured.maxBrake,max_lean_deg:Math.max(captured.maxLean,savedMax)};
    await supabase.from('ride_sessions').update(summary).eq('id',rideId);
    localStorage.setItem(`motoRideEnhancement:${rideId}`,JSON.stringify({weather:captured.weather,road:captured.road,lean_points:savedLean.length,...summary,saved_at:new Date().toISOString()}));
  }catch(error){console.warn('Enhanced ride finalization skipped',error);}
}

function startRuntime(){
  if(runtimeActive) return;
  runtimeActive = true;
  resetRideMotionState();
  if(!motionEnabled && rememberedMotionGranted()) void enableSensors({requestPermission:false,autoCalibrate:true,resetMax:true,reason:'ride-start'}).catch(error=>console.warn('Automatic sensor resume failed',error));
  timers.push(
    setTimeout(()=>void refreshWeather(false),800),
    setTimeout(()=>void refreshRoad(true,'ride started'),1300),
    setTimeout(()=>void refreshTools(),2000),
    setInterval(()=>void roadMonitor(),15000),
    setInterval(()=>void refreshWeather(false),600000),
    setInterval(bridgeAdventure,3000),
    setInterval(()=>void flushMotion(),10000)
  );
}

function stopRuntime(){
  if(!runtimeActive) return;
  runtimeActive = false;
  timers.forEach(timer=>{clearTimeout(timer);clearInterval(timer);});
  timers = [];
  void flushMotion();
  // Keep sensor listeners active for the app session so the next ride needs no new permission prompt.
}

function syncRuntime(ride){
  if(ride?.active) startRuntime();
  else stopRuntime();
}

window.MotoLeanCalibration = {
  start:()=>startLeanCalibration(true,'manual'),
  getState:()=>({calibrated:leanCalibrated,calibrating:leanCalibrating,phase:calibrationPhase,progress:calibrationProgress,status:calibrationStatus(),zero:leanZero,maxLean,minSpeedMph:CALIBRATION.minSpeedMph})
};
window.MotoRideTools = {
  enableSensors,
  resumeSensors:()=>enableSensors({requestPermission:false,autoCalibrate:true,reason:'resume'}),
  disableSensors:removeSensorListeners,
  recalibrate:()=>startLeanCalibration(true,'manual'),
  refreshWeather:()=>refreshWeather(true),
  refreshRoad:()=>refreshRoad(true,'manual'),
  refreshTools,saveNote,markRoad,
  getState:()=>({runtimeActive,motionEnabled,leanCalibrated,leanCalibrating,calibrationPhase,calibrationProgress,calibrationStatus:calibrationStatus(),calibrationReason,maxLean,maxAccel,maxBrake,weather:weatherSnapshot,road:roadSnapshot})
};
window.dispatchEvent(new CustomEvent('moto-ride-tools-ready',{detail:{automaticCalibration:true,minSpeedMph:CALIBRATION.minSpeedMph}}));

window.addEventListener('moto-ride-state',event=>syncRuntime(event.detail));
window.addEventListener('moto-ride-complete',event=>void finalizeEnhancements(event.detail?.sessionId));
window.addEventListener('moto-gps-fix',()=>{
  if(motionEnabled && !leanCalibrated && !leanCalibrating) startLeanCalibration(false,'gps-motion');
});
window.addEventListener('moto-permissions-change',event=>{
  if(event.detail?.motion === 'granted' && !motionEnabled) void enableSensors({requestPermission:false,autoCalibrate:true,reason:'permission-granted'}).catch(()=>{});
});
window.addEventListener('pagehide',()=>{void flushMotion();removeSensorListeners();});

syncRuntime(window.MotoRide?.getState?.() || window.MotoRideState);
if(rememberedMotionGranted()) void enableSensors({requestPermission:false,autoCalibrate:true,reason:'remembered-permission'}).catch(()=>{});
