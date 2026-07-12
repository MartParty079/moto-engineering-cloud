import { supabase } from './supabase.js';

const $=q=>document.querySelector(q);
const esc=(s='')=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const fmt=s=>`${String(Math.floor((s||0)/3600)).padStart(2,'0')}:${String(Math.floor((s||0)%3600/60)).padStart(2,'0')}:${String(Math.floor((s||0)%60)).padStart(2,'0')}`;
const fmtTotal=s=>{s=Number(s||0);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?`${h}h ${m}m`:`${m}m`};
let session=null,sessions=[],sampleCache=new Map(),enhancing=false;

async function loadSessions(){
 const {data:{session:s}}=await supabase.auth.getSession();session=s;if(!s)return[];
 const {data,error}=await supabase.from('ride_sessions').select('*').order('started_at',{ascending:false}).limit(250);
 if(error){console.error('Ride sessions unavailable',error);return sessions}
 sessions=data||[];return sessions
}

async function loadSamples(id){
 if(sampleCache.has(id))return sampleCache.get(id);
 const {data,error}=await supabase.from('ride_samples').select('recorded_at,latitude,longitude,speed_mps,pitch_deg,lean_deg').eq('session_id',id).order('recorded_at',{ascending:true});
 if(error){console.error('Ride samples unavailable',error);return[]}
 const rows=data||[];sampleCache.set(id,rows);return rows
}

function countWheelies(rows){
 let count=0,inWheelie=false,started=0;
 for(const r of rows){
  const pitch=Math.abs(Number(r.pitch_deg)),speed=Number(r.speed_mps||0)*2.236936,now=Date.parse(r.recorded_at)||0;
  const raised=Number.isFinite(pitch)&&pitch>=20&&speed>=5;
  if(raised&&!inWheelie){inWheelie=true;started=now}
  if(!raised&&inWheelie){if(now-started>=1000)count++;inWheelie=false}
 }
 if(inWheelie)count++;
 return count
}

async function showRideDetails(id){
 const ride=sessions.find(r=>r.id===id)||(await supabase.from('ride_sessions').select('*').eq('id',id).single()).data;if(!ride)return;
 const rows=await loadSamples(id),wheelies=countWheelies(rows),old=$('#rideDetailModal');if(old)old.remove();
 const m=document.createElement('div');m.id='rideDetailModal';m.className='rideModal';
 m.innerHTML=`<section><header><div><small>RIDE LOG</small><h3>${esc(ride.bike_name)}</h3></div><button id="closeRideDetail">×</button></header><div class="rideDetailStats"><article><small>DATE</small><strong>${new Date(ride.started_at).toLocaleString()}</strong></article><article><small>DURATION</small><strong>${fmt(ride.duration_seconds)}</strong></article><article><small>DISTANCE</small><strong>${Number(ride.distance_miles||0).toFixed(2)} mi</strong></article><article><small>MAX SPEED</small><strong>${Number(ride.max_speed_mph||0).toFixed(1)} mph</strong></article><article><small>AVG SPEED</small><strong>${Number(ride.average_speed_mph||0).toFixed(1)} mph</strong></article><article><small>WHEELIES</small><strong>${wheelies}</strong></article><article><small>MAX LEAN</small><strong>${Number(ride.max_lean_deg||0).toFixed(1)}°</strong></article><article><small>MAX ACCEL</small><strong>${Number(ride.max_accel_g||0).toFixed(2)} g</strong></article><article><small>SAMPLES</small><strong>${rows.length}</strong></article></div><div class="rideLogActions"><button id="downloadRideCsv" class="rideStart">DOWNLOAD CSV</button></div><div class="rideSamplePreview"><h3>Recorded data</h3>${rows.length?`<p>${rows.length} GPS/IMU samples are stored for this ride.</p><div class="rideSampleTable"><div><b>First sample</b><span>${new Date(rows[0].recorded_at).toLocaleTimeString()}</span><span>${rows[0].latitude?.toFixed(5)||'—'}, ${rows[0].longitude?.toFixed(5)||'—'}</span></div><div><b>Last sample</b><span>${new Date(rows.at(-1).recorded_at).toLocaleTimeString()}</span><span>${rows.at(-1).latitude?.toFixed(5)||'—'}, ${rows.at(-1).longitude?.toFixed(5)||'—'}</span></div></div>`:'<div class="rideEmpty">This session has no stored sensor samples.</div>'}</div></section>`;
 document.body.appendChild(m);$('#closeRideDetail').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};$('#downloadRideCsv').onclick=()=>downloadCsv(ride,rows)
}

function downloadCsv(ride,rows){const cols=['recorded_at','latitude','longitude','speed_mps','pitch_deg','lean_deg'];const csv=[cols.join(','),...rows.map(r=>cols.map(c=>r[c]??'').join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(ride.bike_name||'ride').replace(/[^a-z0-9]+/gi,'-')}-${new Date(ride.started_at).toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

async function bikeSummaries(){
 const completed=sessions.filter(r=>r.status==='complete');
 const groups=new Map();
 for(const r of completed){
  const key=r.bike_id||r.bike_name||'unknown';
  if(!groups.has(key))groups.set(key,{name:r.bike_name||'Motorcycle',time:0,miles:0,wheelies:0,lean:0,rides:0,ids:[]});
  const g=groups.get(key);g.time+=Number(r.duration_seconds||0);g.miles+=Number(r.distance_miles||0);g.lean=Math.max(g.lean,Number(r.max_lean_deg||0));g.rides++;g.ids.push(r.id)
 }
 await Promise.all([...groups.values()].map(async g=>{g.wheelies=(await Promise.all(g.ids.map(async id=>countWheelies(await loadSamples(id))))).reduce((a,b)=>a+b,0)}));
 return [...groups.values()].sort((a,b)=>b.time-a.time)
}

async function enhanceRideCenter(){
 const h=$('.rideHistory');if(!h||enhancing)return;
 enhancing=true;
 try{
  await loadSessions();
  if(!document.body.contains(h))return;
  const summaries=await bikeSummaries();
  h.innerHTML=`<h3>Recent rides</h3>${sessions.length?sessions.slice(0,25).map(r=>`<article class="rideHistoryRow" data-ride-session="${r.id}"><div><strong>${esc(r.bike_name)}</strong><small>${new Date(r.started_at).toLocaleString()}</small></div><div><b>${Number(r.distance_miles||0).toFixed(1)} mi</b><small>${fmt(r.duration_seconds)}</small></div><span>›</span></article>`).join(''):'<div class="rideEmpty">No recorded rides yet.</div>'}<section id="bikeTotalsSection" class="bikeRideSummary"><div class="rowtop"><div><small>ALL-TIME TOTALS</small><h3>Totals by motorcycle</h3></div><span class="badge">${summaries.length} BIKES</span></div>${summaries.length?summaries.map(g=>`<article class="bikeRideSummaryCard"><div><strong>${esc(g.name)}</strong><small>${g.rides} saved ride${g.rides===1?'':'s'}</small></div><div class="bikeRideStats"><span><b>${fmtTotal(g.time)}</b><small>time ridden</small></span><span><b>${g.miles.toFixed(1)} mi</b><small>mileage</small></span><span><b>${g.wheelies}</b><small>wheelies</small></span><span><b>${g.lean.toFixed(1)}°</b><small>max lean</small></span></div></article>`).join(''):'<div class="rideEmpty">Per-bike totals will appear after your first completed ride.</div>'}</section>`;
  h.querySelectorAll('[data-ride-session]').forEach(x=>x.onclick=()=>showRideDetails(x.dataset.rideSession));
  h.dataset.logsEnhanced='1';
 }finally{enhancing=false}
}

async function renderUnifiedRideLog(){
 const main=$('#main');if(!main)return;await loadSessions();
 const completed=sessions.filter(r=>r.status==='complete');
 const cards=await Promise.all(completed.map(async r=>{const wheelies=countWheelies(await loadSamples(r.id));return`<article class="card rideLogCard" data-ride-session="${r.id}"><div><div class="eyebrow">${esc(r.status||'complete')}</div><h3>${esc(r.bike_name)}</h3><p>${new Date(r.started_at).toLocaleString()}</p></div><div class="rideLogSummary"><b>${Number(r.distance_miles||0).toFixed(2)} mi</b><span>${fmt(r.duration_seconds)}</span><span>${wheelies} wheelie${wheelies===1?'':'s'}</span><span>${Number(r.max_lean_deg||0).toFixed(1)}° lean</span><span>${Number(r.max_speed_mph||0).toFixed(1)} mph max</span></div><button class="mini">View log</button></article>`}));
 main.innerHTML=`<div class="section"><div><span class="eyebrow">GPS + IMU RIDE HISTORY</span><h2>Ride Log</h2><p>Every completed Ride Center recording appears here automatically.</p></div></div><div class="stack unifiedRideLog">${cards.join('')||'<div class="empty">No completed Ride Center sessions have been recorded yet.</div>'}</div>`;
 main.querySelectorAll('[data-ride-session]').forEach(x=>x.onclick=()=>showRideDetails(x.dataset.rideSession))
}

function bindRideLogNav(){document.querySelectorAll('[data-v="rides"]').forEach(b=>{if(b.dataset.unifiedRideBound)return;b.dataset.unifiedRideBound='1';b.addEventListener('click',()=>setTimeout(renderUnifiedRideLog,40))})}
function scheduleRideCenterEnhance(){for(const delay of [0,50,150,350])setTimeout(enhanceRideCenter,delay)}
function bindRideCenterNav(){document.querySelectorAll('#rideCenterNav,[data-open-ride-center]').forEach(b=>{if(b.dataset.totalsBound)return;b.dataset.totalsBound='1';b.addEventListener('click',scheduleRideCenterEnhance)})}
function refresh(){bindRideLogNav();bindRideCenterNav();if($('.rideHistory')&&!$('#bikeTotalsSection'))scheduleRideCenterEnhance();if(document.querySelector('[data-v="rides"].active'))setTimeout(renderUnifiedRideLog,20)}
const observer=new MutationObserver(refresh);observer.observe(document.body,{childList:true,subtree:true});
supabase.auth.onAuthStateChange(()=>{sessions=[];sampleCache.clear();setTimeout(refresh,50)});
bindRideLogNav();bindRideCenterNav();loadSessions();refresh();