import { supabase } from './supabase.js';

const $ = q => document.querySelector(q);
const esc = (s='') => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const mph = mps => Number.isFinite(mps) ? mps * 2.236936 : 0;
const ft = m => Number.isFinite(m) ? m * 3.28084 : null;
const fmtTime = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const timeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out.`)), ms))
]);

let session = null;
let bikes = [];
let rides = [];
let active = null;
let starting = false;
let watchId = null;
let timerId = null;
let flushTimerId = null;
let lastPos = null;
let distanceMi = 0;
let maxSpeed = 0;
let speedSum = 0;
let speedCount = 0;
let samples = [];
let flushing = false;

function bikeName(b){ return [b.year,b.make,b.model].filter(Boolean).join(' ') || b.name || 'Motorcycle'; }
function hav(a,b){
  const R=3958.7613,toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.latitude-a.latitude),dLon=toRad(b.longitude-a.longitude);
  const q=Math.sin(dLat/2)**2+Math.cos(toRad(a.latitude))*Math.cos(toRad(b.latitude))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(q));
}

async function loadData(){
  const { data:{ session:s } } = await supabase.auth.getSession();
  session = s;
  if(!session) return;
  const [b,r] = await Promise.all([
    supabase.from('bikes').select('*').order('created_at'),
    supabase.from('ride_sessions').select('*').order('started_at',{ascending:false}).limit(20)
  ]);
  bikes = b.data || [];
  rides = r.data || [];
  injectNav();
}

function injectNav(){
  const nav=$('#nav');
  if(!nav || $('#rideCenterNav')) return;
  const btn=document.createElement('button');
  btn.id='rideCenterNav';
  btn.innerHTML='<span class="navIcon">◉</span><span>Ride Center</span><em>SAFE</em>';
  btn.onclick=openRideCenter;
  const ops=[...nav.querySelectorAll('.navGroup')].find(g=>g.querySelector('.navLabel')?.textContent.trim()==='Operations');
  (ops||nav).appendChild(btn);
}

function openRideCenter(){
  document.querySelector('#rideCenterOverlay')?.remove();
  const o=document.createElement('div');
  o.id='rideCenterOverlay';
  o.innerHTML=`<section class="rideCenter"><header><div><small>GPS RIDE LOGGER</small><h2>Ride Center</h2></div><div class="rideHeaderActions"><button id="closeRideCenter">×</button></div></header><div id="rideCenterBody"></div></section>`;
  document.body.appendChild(o);
  $('#closeRideCenter').onclick=()=>{ if(!active && !starting) o.remove(); };
  renderHome();
}

function renderHome(){
  const body=$('#rideCenterBody');
  if(!body) return;
  if(active){ renderLive(); return; }
  body.innerHTML=`<div class="rideHero"><span class="rideDot"></span><div><small>SAFE MODE</small><h3>Start a GPS ride</h3><p>Core GPS logging only. Optional integrations are disabled during startup.</p></div></div><button id="rideStart" class="rideStart">START RIDE</button><div class="rideHistory"><h3>Recent rides</h3>${rides.length?rides.map(r=>`<article><div><strong>${esc(r.bike_name)}</strong><small>${new Date(r.started_at).toLocaleString()}</small></div><div><b>${Number(r.distance_miles||0).toFixed(1)} mi</b><small>${fmtTime(r.duration_seconds||0)}</small></div></article>`).join(''):'<div class="rideEmpty">No rides yet.</div>'}</div>`;
  $('#rideStart').onclick=showBikePicker;
}

function showBikePicker(){
  if(starting) return;
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
  if(body) body.innerHTML=`<div class="rideHero"><span class="recordPulse"></span><div><small>STARTING LOGGER</small><h3>${esc(bikeName(bike))}</h3><p id="rideStartStage">${esc(stage)}</p></div></div><button class="rideStart" disabled>PLEASE WAIT</button>`;
}

function cleanupRuntime(){
  if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; }
  clearInterval(timerId); timerId=null;
  clearInterval(flushTimerId); flushTimerId=null;
}

async function beginRide(bikeId){
  if(starting || active) return;
  const bike=bikes.find(b=>b.id===bikeId);
  if(!bike) return;
  if(!navigator.geolocation) return alert('GPS is unavailable.');
  starting=true;
  showStarting(bike);
  cleanupRuntime();
  try{
    const result=await timeout(
      supabase.from('ride_sessions').insert({user_id:session.user.id,bike_id:bike.id,bike_name:bikeName(bike),status:'recording'}).select().single(),
      15000,
      'Ride session'
    );
    if(result.error) throw result.error;
    active={...result.data,bike,startMs:Date.now(),latest:null};
    localStorage.setItem('motoActiveRide',JSON.stringify({id:active.id,bikeId:bike.id,startedAt:active.startMs}));
    distanceMi=maxSpeed=speedSum=speedCount=0;
    lastPos=null;
    samples=[];
    renderLive();
    await new Promise(resolve=>requestAnimationFrame(resolve));
    watchId=navigator.geolocation.watchPosition(onPosition,onGpsError,{enableHighAccuracy:true,maximumAge:2000,timeout:20000});
    timerId=setInterval(updateDash,1000);
    flushTimerId=setInterval(()=>void flushSamples(),10000);
  }catch(error){
    console.error('Ride start failed',error);
    cleanupRuntime();
    active=null;
    localStorage.removeItem('motoActiveRide');
    const body=$('#rideCenterBody');
    if(body) body.innerHTML=`<div class="rideHero"><span class="rideDot"></span><div><small>START FAILED</small><h3>Ride Center recovered</h3><p>${esc(error?.message||String(error))}</p></div></div><button id="rideRetry" class="rideStart">RETURN TO START</button>`;
    $('#rideRetry').onclick=renderHome;
  }finally{
    starting=false;
  }
}

function renderLive(){
  const body=$('#rideCenterBody');
  if(!body || !active) return;
  body.innerHTML=`<div class="liveBikeHero"><div><span class="recordPulse"></span><small>RECORDING · SAFE MODE</small><h3>${esc(active.bike_name)}</h3></div><strong id="rideClock">00:00:00</strong></div><div class="speedDial"><strong id="rideSpeed">--</strong><span>MPH</span></div><div class="rideMetrics"><article><small>DISTANCE</small><strong id="rideDistance">0.00 mi</strong></article><article><small>HEADING</small><strong id="rideHeading">--°</strong></article><article><small>ALTITUDE</small><strong id="rideAltitude">-- ft</strong></article><article><small>GPS ACCURACY</small><strong id="rideAccuracy">-- ft</strong></article><article><small>AVERAGE SPEED</small><strong id="rideAverage">0 mph</strong></article><article><small>MAX SPEED</small><strong id="rideMaxSpeed">0 mph</strong></article></div><div id="rideStatus" class="rideStatus">Waiting for GPS fix…</div><button id="rideStop" class="rideStop">STOP & SAVE RIDE</button>`;
  $('#rideStop').onclick=stopRide;
  updateDash();
}

function onGpsError(error){
  const e=$('#rideStatus');
  if(e) e.textContent=`GPS error: ${error.message}`;
}

function onPosition(position){
  if(!active) return;
  const c=position.coords;
  const pos={latitude:c.latitude,longitude:c.longitude};
  if(lastPos && Number.isFinite(c.accuracy) && c.accuracy<80){
    const d=hav(lastPos,pos);
    if(Number.isFinite(d) && d>=0 && d<0.5) distanceMi+=d;
  }
  lastPos=pos;
  const speed=mph(c.speed);
  if(speed>=0 && speed<250){ maxSpeed=Math.max(maxSpeed,speed); speedSum+=speed; speedCount++; }
  active.latest={...pos,altitude:c.altitude,accuracy:c.accuracy,speed,heading:c.heading,timestamp:position.timestamp};
  samples.push({session_id:active.id,user_id:session.user.id,recorded_at:new Date().toISOString(),latitude:c.latitude,longitude:c.longitude,altitude_m:c.altitude??null,accuracy_m:c.accuracy??null,speed_mps:Number.isFinite(c.speed)?c.speed:null,heading_deg:c.heading??null});
  if(samples.length>=10) void flushSamples();
  updateDash();
}

function updateDash(){
  if(!active) return;
  const p=active.latest||{};
  const elapsed=Math.max(0,Math.floor((Date.now()-active.startMs)/1000));
  const avg=speedCount?speedSum/speedCount:0;
  const values={rideClock:fmtTime(elapsed),rideSpeed:Number.isFinite(p.speed)?Math.round(p.speed):'--',rideDistance:`${distanceMi.toFixed(2)} mi`,rideHeading:Number.isFinite(p.heading)?`${Math.round(p.heading)}°`:'--°',rideAltitude:Number.isFinite(p.altitude)?`${Math.round(ft(p.altitude))} ft`:'-- ft',rideAccuracy:Number.isFinite(p.accuracy)?`±${Math.round(ft(p.accuracy))} ft`:'-- ft',rideAverage:`${Math.round(avg)} mph`,rideMaxSpeed:`${Math.round(maxSpeed)} mph`};
  for(const [id,value] of Object.entries(values)){ const el=$(`#${id}`); if(el) el.textContent=value; }
  const status=$('#rideStatus');
  if(status) status.textContent=active.latest?'GPS locked · core logging active':'Waiting for GPS fix…';
}

async function flushSamples(){
  if(flushing || !samples.length) return;
  flushing=true;
  const rows=samples.splice(0);
  try{
    const {error}=await supabase.from('ride_samples').insert(rows);
    if(error) throw error;
  }catch(error){
    console.error('Sample save failed',error);
    samples.unshift(...rows.slice(-100));
  }finally{
    flushing=false;
  }
}

async function stopRide(){
  if(!active || !confirm('Stop and save this ride?')) return;
  cleanupRuntime();
  await flushSamples();
  const duration=Math.floor((Date.now()-active.startMs)/1000);
  const avg=speedCount?speedSum/speedCount:0;
  const p=active.latest||{};
  await supabase.from('ride_sessions').update({ended_at:new Date().toISOString(),duration_seconds:duration,distance_miles:distanceMi,max_speed_mph:maxSpeed,average_speed_mph:avg,end_lat:p.latitude??null,end_lng:p.longitude??null,status:'complete',updated_at:new Date().toISOString()}).eq('id',active.id);
  const b=active.bike;
  await supabase.from('bikes').update({odometer:Number(b.odometer||0)+distanceMi,gps_odometer_miles:Number(b.gps_odometer_miles||0)+distanceMi,rides_since_odometer_confirm:Number(b.rides_since_odometer_confirm||0)+1,updated_at:new Date().toISOString()}).eq('id',b.id);
  localStorage.removeItem('motoActiveRide');
  active=null;
  await loadData();
  renderHome();
}

const observer=new MutationObserver(injectNav);
observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:false});
supabase.auth.onAuthStateChange(()=>setTimeout(loadData,0));
loadData();
