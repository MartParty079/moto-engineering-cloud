import { supabase } from './supabase.js';

const $=q=>document.querySelector(q);
const $$=q=>[...document.querySelectorAll(q)];
const esc=(s='')=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const miles=n=>`${Number(n||0).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})} mi`;
const hours=s=>`${(Number(s||0)/3600).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})} hr`;
const duration=s=>{s=Math.max(0,Number(s||0));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?`${h}h ${m}m`:`${m}m`};
const date=v=>v?new Date(v).toLocaleString():'—';
const bikeLabel=b=>[b?.year,b?.make,b?.model].filter(Boolean).join(' ')||b?.name||'Motorcycle';

let enhancing=false;
let cachedBikes=[];
let cachedSessions=[];

function sessionTotals(rows){
 const completed=(rows||[]).filter(r=>r.status==='complete');
 return completed.reduce((a,r)=>{
  a.seconds+=Number(r.duration_seconds||0);
  a.trackedMiles+=Number(r.distance_miles||0);
  a.maxSpeed=Math.max(a.maxSpeed,Number(r.max_speed_mph||0));
  a.maxLean=Math.max(a.maxLean,Number(r.max_lean_deg||0));
  a.rides++;
  return a
 },{seconds:0,trackedMiles:0,maxSpeed:0,maxLean:0,rides:0})
}

async function loadGarageData(){
 const [{data:bikes,error:bikeError},{data:sessions,error:rideError}]=await Promise.all([
  supabase.from('bikes').select('*').order('created_at',{ascending:false}),
  supabase.from('ride_sessions').select('id,bike_id,bike_name,status,started_at,ended_at,duration_seconds,distance_miles,max_speed_mph,average_speed_mph,max_lean_deg').order('started_at',{ascending:false}).limit(1000)
 ]);
 if(bikeError)throw bikeError;
 if(rideError)console.warn('Motorcycle ride totals unavailable',rideError);
 cachedBikes=bikes||[];
 cachedSessions=sessions||[];
}

function addCardSummary(card,bike){
 const totals=sessionTotals(cachedSessions.filter(r=>r.bike_id===bike.id));
 card.dataset.bikeProfile=bike.id;
 card.tabIndex=0;
 card.setAttribute('role','button');
 card.setAttribute('aria-label',`Open ${bike.name||bikeLabel(bike)} motorcycle profile`);
 card.classList.add('motorcycleSelectable');
 let summary=card.querySelector('.bikeCardTotals');
 if(!summary){
  summary=document.createElement('div');
  summary.className='bikeCardTotals';
  card.querySelector(':scope > div')?.appendChild(summary)
 }
 summary.innerHTML=`<span><small>TOTAL MILEAGE</small><b>${miles(bike.odometer)}</b></span><span><small>TOTAL HOURS</small><b>${hours(totals.seconds)}</b></span><em>Open motorcycle profile ›</em>`
}

async function enhanceMotorcycleCards(){
 const main=$('#main');
 const title=main?.querySelector('.section h2')?.textContent.trim();
 if(!main||title!=='Motorcycles'||enhancing)return;
 const cards=$$('.bikeHero');
 if(!cards.length||cards.every(c=>c.dataset.bikeProfile))return;
 enhancing=true;
 try{
  await loadGarageData();
  if(!document.body.contains(main))return;
  cards.forEach((card,index)=>{const bike=cachedBikes[index];if(bike)addCardSummary(card,bike)})
 }catch(error){console.error('Could not prepare motorcycle profiles',error)}finally{enhancing=false}
}

function loadingProfile(){
 document.querySelector('#motorcycleProfileOverlay')?.remove();
 const overlay=document.createElement('div');
 overlay.id='motorcycleProfileOverlay';
 overlay.className='motorcycleProfileOverlay';
 overlay.innerHTML=`<section class="motorcycleProfileShell"><header><div><small>MOTORCYCLE PROFILE</small><h2>Loading motorcycle…</h2></div><button id="closeMotorcycleProfile" aria-label="Close">×</button></header><div class="motorcycleProfileLoading">Loading mileage, hours, and ride history…</div></section>`;
 document.body.appendChild(overlay);
 $('#closeMotorcycleProfile').onclick=()=>overlay.remove();
 overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
 return overlay
}

async function openMotorcycleProfile(bikeId){
 const overlay=loadingProfile();
 const [{data:bike,error:bikeError},{data:rides,error:rideError}]=await Promise.all([
  supabase.from('bikes').select('*').eq('id',bikeId).single(),
  supabase.from('ride_sessions').select('*').eq('bike_id',bikeId).order('started_at',{ascending:false}).limit(250)
 ]);
 if(!document.body.contains(overlay))return;
 if(bikeError||!bike){
  overlay.querySelector('.motorcycleProfileLoading').innerHTML=`<div class="motorcycleProfileError">${esc(bikeError?.message||'Motorcycle not found.')}</div>`;
  return
 }
 const rows=rides||[];
 const completed=rows.filter(r=>r.status==='complete');
 const totals=sessionTotals(completed);
 const avgRide=totals.rides?totals.trackedMiles/totals.rides:0;
 const lastRide=completed[0]||null;
 const profileName=bike.name||bikeLabel(bike);
 const identity=[bike.year,bike.make,bike.model].filter(Boolean).join(' ');
 const confirmed=bike.odometer_last_confirmed_at?`Last confirmed ${new Date(bike.odometer_last_confirmed_at).toLocaleDateString()}`:'Current saved odometer';
 const image=bike.image_url?`<img src="${esc(bike.image_url)}" alt="${esc(profileName)}">`:'<div class="motorcycleProfilePlaceholder">🏍</div>';
 const rideWarning=rideError?`<div class="motorcycleProfileWarning">Ride totals could not be loaded: ${esc(rideError.message)}</div>`:'';
 overlay.querySelector('.motorcycleProfileShell').innerHTML=`
  <header><div><small>MOTORCYCLE PROFILE</small><h2>${esc(profileName)}</h2><p>${esc(identity)}</p></div><button id="closeMotorcycleProfile" aria-label="Close">×</button></header>
  <div class="motorcycleProfileHero">${image}<div><span class="motorcycleProfileBadge">${totals.rides} SAVED RIDE${totals.rides===1?'':'S'}</span><h3>${esc(bikeLabel(bike))}</h3><p>${esc(bike.notes||'No motorcycle notes have been added yet.')}</p></div></div>
  ${rideWarning}
  <div class="motorcycleLifetimeGrid">
   <article class="primaryMetric"><small>TOTAL MILEAGE</small><strong>${miles(bike.odometer)}</strong><span>${esc(confirmed)}</span></article>
   <article class="primaryMetric"><small>TOTAL HOURS</small><strong>${hours(totals.seconds)}</strong><span>${duration(totals.seconds)} recorded riding time</span></article>
   <article><small>TRACKED MILEAGE</small><strong>${miles(totals.trackedMiles)}</strong><span>GPS ride sessions</span></article>
   <article><small>SAVED RIDES</small><strong>${totals.rides}</strong><span>${miles(avgRide)} average</span></article>
   <article><small>MAX SPEED</small><strong>${totals.maxSpeed.toFixed(1)} mph</strong><span>Across saved rides</span></article>
   <article><small>MAX LEAN</small><strong>${totals.maxLean.toFixed(1)}°</strong><span>Across saved rides</span></article>
  </div>
  <div class="motorcycleProfileColumns">
   <section class="motorcycleProfilePanel"><div class="motorcyclePanelHeader"><div><small>RECENT ACTIVITY</small><h3>Ride history</h3></div><button id="openFullRideLog" class="mini">Full ride log</button></div>
    <div class="motorcycleRideList">${completed.length?completed.slice(0,8).map(r=>`<article><div><strong>${date(r.started_at)}</strong><span>${duration(r.duration_seconds)}</span></div><div><b>${miles(r.distance_miles)}</b><span>${Number(r.max_speed_mph||0).toFixed(1)} mph max</span></div></article>`).join(''):'<div class="motorcycleProfileEmpty">No completed rides are recorded for this motorcycle yet.</div>'}</div>
   </section>
   <section class="motorcycleProfilePanel"><small>AT A GLANCE</small><h3>Motorcycle record</h3><dl><div><dt>Name</dt><dd>${esc(profileName)}</dd></div><div><dt>Year</dt><dd>${esc(bike.year||'—')}</dd></div><div><dt>Make</dt><dd>${esc(bike.make||'—')}</dd></div><div><dt>Model</dt><dd>${esc(bike.model||'—')}</dd></div><div><dt>Last ride</dt><dd>${lastRide?date(lastRide.started_at):'—'}</dd></div></dl><button id="editMotorcycleProfile" class="motorcycleProfileEdit">EDIT MOTORCYCLE</button></section>
  </div>`;
 $('#closeMotorcycleProfile').onclick=()=>overlay.remove();
 $('#editMotorcycleProfile').onclick=()=>{
  overlay.remove();
  const button=$$('[data-edit^="bikes:"]').find(x=>x.dataset.edit===`bikes:${bike.id}`);
  button?.click()
 };
 $('#openFullRideLog').onclick=()=>{
  overlay.remove();
  document.querySelector('[data-v="rides"]')?.click()
 }
}

function activateCard(card){
 if(!card?.dataset.bikeProfile)return;
 openMotorcycleProfile(card.dataset.bikeProfile)
}

document.addEventListener('click',e=>{
 const card=e.target.closest('[data-bike-profile]');
 if(!card||e.target.closest('button,a,input,label,select,textarea'))return;
 activateCard(card)
});

document.addEventListener('keydown',e=>{
 const card=e.target.closest?.('[data-bike-profile]');
 if(!card||!['Enter',' '].includes(e.key))return;
 e.preventDefault();activateCard(card)
});

const observer=new MutationObserver(()=>setTimeout(enhanceMotorcycleCards,0));
observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
supabase.auth.onAuthStateChange(()=>{cachedBikes=[];cachedSessions=[];setTimeout(enhanceMotorcycleCards,50)});
enhanceMotorcycleCards();
