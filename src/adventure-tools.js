import { supabase } from './supabase.js';

const $ = q => document.querySelector(q);
const esc = (s='') => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const rad = n => n*Math.PI/180;
const miles = (a,b) => { const R=3958.7613,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),q=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(q)); };
const bearing = (a,b) => { const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat)); const x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon)); return (Math.atan2(y,x)*180/Math.PI+360)%360; };
const compass = d => ['N','NE','E','SE','S','SW','W','NW'][Math.round(d/45)%8];

let mounted=false, busy=false, estimate=null;

function activeBikeId(){
  try { return JSON.parse(localStorage.getItem('motoActiveRide')||'null')?.bikeId || localStorage.getItem('selectedBikeId') || null; }
  catch { return null; }
}

function panel(){
  const drawer=$('#adventureDrawer');
  if(!drawer || $('#adventureTools')) return;
  const section=document.createElement('section');
  section.id='adventureTools';
  section.innerHTML=`<header><div><small>ADVENTURE INTELLIGENCE</small><strong>Fuel & stops</strong></div><button id="advToolsRefresh" aria-label="Refresh">↻</button></header>
    <div class="advFuelGrid">
      <article><small>EST. MPG</small><strong id="advAutoMpg">—</strong></article>
      <article><small>FULL RANGE</small><strong id="advAutoRange">—</strong></article>
      <article><small>SAFE RANGE</small><strong id="advSafeRange">—</strong></article>
      <article><small>RANGE STATUS</small><strong id="advRangeStatus">SETUP</strong></article>
    </div>
    <div class="advStopButtons">
      <button data-stop="fuel">⛽ Gas</button><button data-stop="camp">⛺ Camp</button><button data-stop="food">🍔 Food</button><button data-stop="motorcycle">🏍 Shop</button><button data-stop="hospital">✚ Hospital</button><button data-stop="parking">Ⓟ Parking</button>
    </div>
    <div id="advStopStatus">Choose a stop category.</div><div id="advStopResults"></div>`;
  drawer.appendChild(section);
  $('#advToolsRefresh').onclick=()=>loadFuel(true);
  section.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>findStops(b.dataset.stop));
  mounted=true;
  loadFuel(false);
}

async function loadFuel(force){
  const bikeId=activeBikeId();
  const mpgEl=$('#advAutoMpg'),rangeEl=$('#advAutoRange'),safeEl=$('#advSafeRange'),statusEl=$('#advRangeStatus');
  if(!bikeId){ if(statusEl)statusEl.textContent='SELECT BIKE'; return; }
  try{
    if(statusEl)statusEl.textContent='LOADING';
    const [{data:bike,error:bikeErr},{data:fills,error:fillErr}]=await Promise.all([
      supabase.from('bikes').select('*').eq('id',bikeId).maybeSingle(),
      supabase.from('fuel_entries').select('*').eq('bike_id',bikeId).order('odometer_miles',{ascending:true})
    ]);
    if(bikeErr)throw bikeErr; if(fillErr)throw fillErr;
    const full=(fills||[]).filter(x=>x.full_tank && Number.isFinite(Number(x.odometer_miles)) && Number(x.gallons)>0);
    let distance=0,gallons=0;
    for(let i=1;i<full.length;i++){
      const leg=Number(full[i].odometer_miles)-Number(full[i-1].odometer_miles);
      if(leg>5 && leg<1000){ distance+=leg; gallons+=Number(full[i].gallons); }
    }
    const mpg=gallons>0?distance/gallons:null;
    const tank=Number(bike?.tank_capacity_gallons||bike?.fuel_capacity_gallons||0);
    const fullRange=mpg&&tank?mpg*tank:null;
    const safeRange=fullRange?fullRange*.8:null;
    estimate={mpg,fullRange,safeRange};
    if(mpgEl)mpgEl.textContent=mpg?`${mpg.toFixed(1)}`:'—';
    if(rangeEl)rangeEl.textContent=fullRange?`${Math.round(fullRange)} mi`:'—';
    if(safeEl)safeEl.textContent=safeRange?`${Math.round(safeRange)} mi`:'—';
    if(statusEl)statusEl.textContent=fullRange?'READY':full.length<2?'NEED 2 FILLS':'SET TANK SIZE';
    const input=$('#advRange'); if(input && safeRange && (!input.value || force)) input.value=Math.round(safeRange);
  }catch(e){ console.warn('Adventure range estimate failed',e); if(statusEl)statusEl.textContent='UNAVAILABLE'; }
}

async function findStops(type){
  if(busy)return;
  const gps=window.MotoGPS;
  const status=$('#advStopStatus'),results=$('#advStopResults');
  if(!Number.isFinite(gps?.latitude)||!Number.isFinite(gps?.longitude)){ if(status)status.textContent='Start Ride Center for a shared GPS fix.'; return; }
  busy=true; if(status)status.textContent=`Finding nearby ${type}…`; if(results)results.innerHTML='';
  try{
    const {data:{session}}=await supabase.auth.getSession();
    const headers={Accept:'application/json'}; if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
    const r=await fetch(`/api/places?lat=${gps.latitude}&lon=${gps.longitude}&type=${encodeURIComponent(type)}`,{headers});
    const d=await r.json(); if(!r.ok)throw Error(d.error||'Stop search failed');
    const origin={lat:gps.latitude,lon:gps.longitude};
    const places=(d.results||d.places||[]).map(p=>{
      const lat=Number(p.latitude??p.lat),lon=Number(p.longitude??p.lon),dest={lat,lon};
      return {...p,lat,lon,distance:Number.isFinite(lat)&&Number.isFinite(lon)?miles(origin,dest):Infinity,direction:Number.isFinite(lat)&&Number.isFinite(lon)?bearing(origin,dest):null};
    }).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).sort((a,b)=>a.distance-b.distance).slice(0,8);
    if(status)status.textContent=`${places.length} nearby · ${d.source||'MotoCloud'}`;
    if(results)results.innerHTML=places.length?places.map(p=>`<article><div><strong>${esc(p.name||type)}</strong><small>${esc(p.address||'Address unavailable')}</small></div><div><b>${p.distance.toFixed(1)} mi</b><small>${compass(p.direction)} · ${Math.round(p.direction)}°</small></div><a href="https://maps.apple.com/?daddr=${p.lat},${p.lon}" target="_blank" rel="noopener">GO</a></article>`).join(''):'<p>No nearby results.</p>';
    const selector=$('#advPoi'); if(selector)selector.value=type;
  }catch(e){ if(status)status.textContent=e.message||String(e); }
  finally{busy=false;}
}

setInterval(()=>{
  const open=Boolean($('#adventureOverlay'));
  if(open && !mounted) panel();
  if(!open) mounted=false;
},700);
