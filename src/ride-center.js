import { supabase } from './supabase.js';

const $ = q => document.querySelector(q);
const esc = (s='') => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const mph = mps => Number.isFinite(mps) ? mps * 2.236936 : 0;
const ft = m => Number.isFinite(m) ? m * 3.28084 : null;
const fmtTime = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const timeout = (promise, ms, label) => Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} timed out.`)),ms))]);

let session=null,bikes=[],rides=[],active=null,starting=false,watchId=null,timerId=null,flushTimerId=null,lastPos=null;
let distanceMi=0,maxSpeed=0,speedSum=0,speedCount=0,samples=[],flushing=false;

function bikeName(b){ return [b.year,b.make,b.model].filter(Boolean).join(' ') || b.name || 'Motorcycle'; }
function hav(a,b){ const R=3958.7613,toRad=x=>x*Math.PI/180,dLat=toRad(b.latitude-a.latitude),dLon=toRad(b.longitude-a.longitude),q=Math.sin(dLat/2)**2+Math.cos(toRad(a.latitude))*Math.cos(toRad(b.latitude))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(q)); }
function rideState(){ const p=active?.latest||{},elapsed=active?Math.max(0,Math.floor((Date.now()-active.startMs)/1000)):0; return {active:Boolean(active),starting,bikeId:active?.bike?.id||null,bikeName:active?.bike_name||null,sessionId:active?.id||null,elapsedSeconds:elapsed,elapsedText:fmtTime(elapsed),distanceMiles:distanceMi,speedMph:Number.isFinite(p.speed)?p.speed:null,averageSpeedMph:speedCount?speedSum/speedCount:0,maxSpeedMph:maxSpeed,heading:Number.isFinite(p.heading)?p.heading:null,altitudeFt:Number.isFinite(p.altitude)?ft(p.altitude):null,accuracyFt:Number.isFinite(p.accuracy)?ft(p.accuracy):null,latitude:p.latitude??null,longitude:p.longitude??null,gpsLocked:Boolean(active?.latest)}; }
function rideHistory(){ return rides.map(r=>({id:r.id,bikeId:r.bike_id||null,bikeName:r.bike_name||'Motorcycle',startedAt:r.started_at||null,endedAt:r.ended_at||null,durationSeconds:Number(r.duration_seconds||0),distanceMiles:Number(r.distance_miles||0),maxSpeedMph:Number(r.max_speed_mph||0),averageSpeedMph:Number(r.average_speed_mph||0),status:r.status||'complete'})); }
function publish(){ const state=rideState(); window.MotoRideState=state; window.dispatchEvent(new CustomEvent('moto-ride-state',{detail:state})); return state; }
function publishRides(){ const history=rideHistory(); window.MotoRideHistory=history; window.dispatchEvent(new CustomEvent('moto-rides-update',{detail:history})); return history; }

async function loadData(){
  const {data:{session:s}}=await supabase.auth.getSession();
  session=s;
  if(!session){ bikes=[]; rides=[]; publishRides(); publish(); return; }
  const [b,r]=await Promise.all([
    supabase.from('bikes').select('*').order('created_at'),
    supabase.from('ride_sessions').select('*').order('started_at',{ascending:false}).limit(20)
  ]);
  bikes=b.data||[];
  rides=r.data||[];
  injectNav();
  publishRides();
  publish();
}

function injectNav(){
  const nav=$('#nav');
  if(!nav||$('#rideCenterNav'))return;
  const btn=document.createElement('button');
  btn.id='rideCenterNav';
  btn.innerHTML='<span class="navIcon">◉</span><span>Ride Center</span>';
  btn.onclick=()=>{nav.classList.remove('open');document.body.classList.remove('menu-open');openRideCenter()};
  const garageButton=nav.querySelector('[data-v="garage"]'),garageGroup=garageButton?.closest('.navGroup');
  (garageGroup||nav).appendChild(btn);
}

function openRideCenter(){
  document.querySelector('#rideCenterOverlay')?.remove();
  const o=document.createElement('div');
  o.id='rideCenterOverlay';
  o.innerHTML='<section class="rideCenter"><header><div><small>GPS RIDE LOGGER</small><h2>Ride Center</h2></div><div class="rideHeaderActions"><button id="closeRideCenter">×</button></div></header><div id="rideCenterBody"></div></section>';
  document.body.appendChild(o);
  $('#closeRideCenter').onclick=()=>{if(!active&&!starting)o.remove()};
  renderHome();
}

function renderHome(){
  const body=$('#rideCenterBody');
  if(!body)return;
  if(active){renderLive();return}
  body.innerHTML=`<div class="rideHero"><span class="rideDot"></span><div><small>SAFE MODE</small><h3>Start a GPS ride</h3><p>Core GPS logging stays isolated from optional tools.</p></div></div><button id="rideStart" class="rideStart">START RIDE</button><div class="rideHistory"><h3>Recent rides</h3>${rides.length?rides.map(r=>`<article><div><strong>${esc(r.bike_name)}</strong><small>${new Date(r.started_at).toLocaleString()}</small></div><div><b>${Number(r.distance_miles||0).toFixed(1)} mi</b><small>${fmtTime(r.duration_seconds||0)}</small></div></article>`).join(''):'<div class="rideEmpty">No rides yet.</div>'}</div>`;
  $('#rideStart').onclick=showBikePicker;
}

function showBikePicker(){
  if(starting)return;
  document.querySelector('#rideBikePicker')?.remove();
  const modal=document.createElement('div');
  modal.id='rideBikePicker';
  modal.className='rideModal';
  modal.innerHTML=`<section><header><div><small>START RIDE</small><h3>Select motorcycle</h3></div><button id="closeBikePicker">×</button></header><div class="bikePickerGrid">${bikes.map(b=>`<article class="bikePickCard" data-bike-id="${b.id}"><div><strong>${esc(bikeName(b))}</strong><small>${Number(b.odometer||0).toFixed(0)} mi</small></div></article>`).join('')||'<div class="rideEmpty">Add a motorcycle first.</div>'}</div></section>`;
  document.body.appendChild(modal);
  $('#closeBikePicker').onclick=()=>modal.remove();
  modal.querySelectorAll('[data-bike-id]').forEach(card=>card.onclick=()=>beginRide(card.dataset.bikeId));
}

function showStarting(bike,stage='Creating ride session…'){
  document.querySelector('#rideBikePicker')?.remove();
  const body=$('#rideCenterBody');
  if(body)body.innerHTML=`<div class="rideHero"><span class="recordPulse"></span><div><small>STARTING LOGGER</small><h3>${esc(bikeName(bike))}</h3><p id="rideStartStage">${esc(stage)}</p></div></div><button class="rideStart" disabled>PLEASE WAIT</button>`;
}

function cleanupRuntime(){
  if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null}
  clearInterval(timerId);timerId=null;
  clearInterval(flushTimerId);flushTimerId=null;
}

async function beginRide(bikeId){
  if(starting||active)return rideState();
  const bike=bikes.find(b=>String(b.id)===String(bikeId));
  if(!bike)throw new Error('Motorcycle not found.');
  if(!navigator.geolocation)throw new Error('GPS is unavailable.');
  starting=true;
  showStarting(bike);
  publish();
  cleanupRuntime();
  try{
    const result=await timeout(supabase.from('ride_sessions').insert({user_id:session.user.id,bike_id:bike.id,bike_name:bikeName(bike),status:'recording'}).select().single(),15000,'Ride session');
    if(result.error)throw result.error;
    active={...result.data,bike,startMs:Date.now(),latest:null};
    localStorage.setItem('motoActiveRide',JSON.stringify({id:active.id,bikeId:bike.id,startedAt:active.startMs}));
    distanceMi=maxSpeed=speedSum=speedCount=0;
    lastPos=null;
    samples=[];
    renderLive();
    await new Promise(resolve=>requestAnimationFrame(resolve));
    watchId=navigator.geolocation.watchPosition(onPosition,onGpsError,{enableHighAccuracy:true,maximumAge:2000,timeout:20000});
    timerId=setInterval(()=>{updateDash();publish()},1000);
    flushTimerId=setInterval(()=>void flushSamples(),10000);
    return rideState();
  }catch(error){
    console.error('Ride start failed',error);
    cleanupRuntime();
    active=null;
    localStorage.removeItem('motoActiveRide');
    const body=$('#rideCenterBody');
    if(body){
      body.innerHTML=`<div class="rideHero"><span class="rideDot"></span><div><small>START FAILED</small><h3>Ride Center recovered</h3><p>${esc(error?.message||String(error))}</p></div></div><button id="rideRetry" class="rideStart">RETURN TO START</button>`;
      $('#rideRetry').onclick=renderHome;
    }
    throw error;
  }finally{
    starting=false;
    publish();
  }
}

function renderLive(){
  const body=$('#rideCenterBody');
  if(!body||!active)return;
  body.innerHTML=`<div class="liveBikeHero"><div><span class="recordPulse"></span><small>RECORDING · SAFE MODE</small><h3>${esc(active.bike_name)}</h3></div><strong id="rideClock">00:00:00</strong></div><div class="speedDial"><strong id="rideSpeed">--</strong><span>MPH</span></div><div class="rideMetrics"><article><small>DISTANCE</small><strong id="rideDistance">0.00 mi</strong></article><article><small>HEADING</small><strong id="rideHeading">--°</strong></article><article><small>ALTITUDE</small><strong id="rideAltitude">-- ft</strong></article><article><small>GPS ACCURACY</small><strong id="rideAccuracy">-- ft</strong></article><article><small>AVERAGE SPEED</small><strong id="rideAverage">0 mph</strong></article><article><small>MAX SPEED</small><strong id="rideMaxSpeed">0 mph</strong></article></div><div id="rideStatus" class="rideStatus">Waiting for GPS fix…</div><button id="rideStop" class="rideStop">STOP & SAVE RIDE</button>`;
  $('#rideStop').onclick=()=>stopRide(true);
  updateDash();
}

function onGpsError(error){ const e=$('#rideStatus'); if(e)e.textContent=`GPS error: ${error.message}`; publish(); }

function onPosition(position){
  if(!active)return;
  const c=position.coords,pos={latitude:c.latitude,longitude:c.longitude};
  if(lastPos&&Number.isFinite(c.accuracy)&&c.accuracy<80){
    const d=hav(lastPos,pos);
    if(Number.isFinite(d)&&d>=0&&d<.5)distanceMi+=d;
  }
  lastPos=pos;
  const speed=mph(c.speed);
  if(speed>=0&&speed<250){maxSpeed=Math.max(maxSpeed,speed);speedSum+=speed;speedCount++}
  active.latest={...pos,altitude:c.altitude,accuracy:c.accuracy,speed,heading:c.heading,timestamp:position.timestamp};
  samples.push({session_id:active.id,user_id:session.user.id,recorded_at:new Date().toISOString(),latitude:c.latitude,longitude:c.longitude,altitude_m:c.altitude??null,accuracy_m:c.accuracy??null,speed_mps:Number.isFinite(c.speed)?c.speed:null,heading_deg:c.heading??null});
  if(samples.length>=10)void flushSamples();
  updateDash();
  publish();
}

function updateDash(){
  if(!active)return;
  const s=rideState(),values={rideClock:s.elapsedText,rideSpeed:Number.isFinite(s.speedMph)?Math.round(s.speedMph):'--',rideDistance:`${s.distanceMiles.toFixed(2)} mi`,rideHeading:Number.isFinite(s.heading)?`${Math.round(s.heading)}°`:'--°',rideAltitude:Number.isFinite(s.altitudeFt)?`${Math.round(s.altitudeFt)} ft`:'-- ft',rideAccuracy:Number.isFinite(s.accuracyFt)?`±${Math.round(s.accuracyFt)} ft`:'-- ft',rideAverage:`${Math.round(s.averageSpeedMph)} mph`,rideMaxSpeed:`${Math.round(s.maxSpeedMph)} mph`};
  for(const [id,value] of Object.entries(values)){const el=$(`#${id}`);if(el)el.textContent=value}
  const status=$('#rideStatus');
  if(status)status.textContent=active.latest?'GPS locked · core logging active':'Waiting for GPS fix…';
}

async function flushSamples(){
  if(flushing||!samples.length)return;
  flushing=true;
  const rows=samples.splice(0);
  try{
    const {error}=await supabase.from('ride_samples').insert(rows);
    if(error)throw error;
  }catch(error){
    console.error('Sample save failed',error);
    samples.unshift(...rows.slice(-100));
  }finally{
    flushing=false;
  }
}

async function stopRide(confirmFirst=true){
  if(!active)return rideState();
  if(confirmFirst&&!confirm('Stop and save this ride?'))return rideState();
  cleanupRuntime();
  await flushSamples();
  const duration=Math.floor((Date.now()-active.startMs)/1000),avg=speedCount?speedSum/speedCount:0,p=active.latest||{},finished=active;
  await supabase.from('ride_sessions').update({ended_at:new Date().toISOString(),duration_seconds:duration,distance_miles:distanceMi,max_speed_mph:maxSpeed,average_speed_mph:avg,end_lat:p.latitude??null,end_lng:p.longitude??null,status:'complete',updated_at:new Date().toISOString()}).eq('id',active.id);
  const b=active.bike;
  await supabase.from('bikes').update({odometer:Number(b.odometer||0)+distanceMi,gps_odometer_miles:Number(b.gps_odometer_miles||0)+distanceMi,rides_since_odometer_confirm:Number(b.rides_since_odometer_confirm||0)+1,updated_at:new Date().toISOString()}).eq('id',b.id);
  localStorage.removeItem('motoActiveRide');
  active=null;
  await loadData();
  renderHome();
  publish();
  window.dispatchEvent(new CustomEvent('moto-ride-complete',{detail:{sessionId:finished.id,bikeId:b.id,distanceMiles:distanceMi,durationSeconds:duration}}));
  return rideState();
}

window.MotoRide={
  getState:rideState,
  getBikes:()=>bikes.map(b=>({id:b.id,name:bikeName(b),odometer:Number(b.odometer||0)})),
  getRides:rideHistory,
  start:beginRide,
  stop:()=>stopRide(false),
  open:openRideCenter,
  refresh:loadData
};

const observer=new MutationObserver(injectNav);
observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:false});
supabase.auth.onAuthStateChange(()=>setTimeout(loadData,0));
loadData();
