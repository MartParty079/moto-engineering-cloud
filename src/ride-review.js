import { rideJournal } from './ride-runtime.js';
import { reviewStats, rideGpx } from './ride-review-data.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const num=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'Unavailable';
let generation=0;
export async function openRideReview(owner,id,isCurrent,summary={}) {
  const token=++generation;
  document.querySelector('#rideReview')?.close();
  let ride,rows=[],local=false;
  try { const result=await rideJournal.review(owner,id);ride=result.ride;rows=result.rows;local=true; }
  catch { if (!summary.id) { if (token===generation && isCurrent()) alert('The ride was stopped, but its local review could not be loaded. Retry from Ride history.'); return; } ride={id,bikeName:summary.bike_name||'Ride',distanceMiles:Number(summary.distance_miles)||0,startedAt:Date.parse(summary.started_at),stoppedAt:Date.parse(summary.ended_at),status:summary.status==='complete'?'synced':'pending'}; }
  if(token!==generation||!isCurrent())return;
  const stats=reviewStats(rows), count=rows.length, duration=local?Math.max(0,Math.floor((ride.stoppedAt-ride.startedAt)/1000)):Number(summary.duration_seconds)||0;
  const average=local?(ride.speedCount?ride.speedSum/ride.speedCount:null):Number(summary.average_speed_mph);
  const maximum=local?(ride.speedCount?ride.maxSpeedMph:null):Number(summary.max_speed_mph);
  const cards=[['Distance',num(ride.distanceMiles,2)+' mi'],['Duration',`${Math.floor(duration/3600)}h ${Math.floor(duration%3600/60)}m ${duration%60}s`],['Average GPS speed',num(average)+' mph'],['Maximum GPS speed',num(maximum)+' mph'],['Lean left / right',`${num(stats.left)}° / ${num(stats.right)}°`],['Above mapped limit',stats.checked?`${num(stats.overSeconds,0)} s observed`:'Unavailable'],['Maximum over limit',stats.checked?`${num(stats.maxOver??0)} mph`:'Unavailable'],['Altitude min / max',`${num(stats.minAltitude===null?null:stats.minAltitude*3.28084,0)} / ${num(stats.maxAltitude===null?null:stats.maxAltitude*3.28084,0)} ft`]];
  const dialog=document.createElement('dialog');dialog.id='rideReview';dialog.className='simpleDialog rideReview';
  dialog.innerHTML=`<header class="sectionHead"><div><h1>Ride review</h1><p>${esc(ride.bikeName)}</p></div><button type="button" data-close>Close</button></header>
    <p id="reviewSaveState">${ride.status==='synced'?'Ride summary synced.':'Ride saved on this device; cloud upload pending.'}</p>
    <section class="reviewCards">${cards.map(([title,value])=>`<article><small>${esc(title)}</small><strong>${esc(value)}</strong></article>`).join('')}</section>
    <p>Average is the mean of recorded GPS speeds. Lean is an experimental phone estimate.</p>
    <p>Limit coverage: ${stats.checked} of ${count} GPS samples; ${num(stats.coveredSeconds,0)} seconds measured. ${stats.over} samples above the mapped limit. Missing or last-known limits are excluded; this is not proof of a traffic violation.</p>
    <p>Lean coverage: ${stats.leanCount} of ${count} GPS samples. Detailed measurements and GPX remain on this device. ${count < (ride.sequence||0)?'Some older samples are unavailable locally.':''}</p>
    <section class="reviewExport"><h2>Save this ride as a GPX track?</h2><p>Includes GPS positions, elevation and timestamps; gaps remain separate segments.</p><button class="primary" type="button" id="saveRideGpx" ${!count?'disabled':''}>Save GPX track</button><button type="button" data-close>Not now</button><p id="gpxSaveStatus" role="status"></p></section>
    <details><summary>Review every recorded parameter</summary><div class="reviewTable"><table><thead><tr><th>Time</th><th>MPH</th><th>Limit MPH</th><th>Source</th><th>Lean °</th><th>Heading °</th><th>Altitude ft</th><th>Accuracy ft</th></tr></thead><tbody></tbody></table></div><p id="reviewPage"></p><button type="button" id="reviewPrev">Previous</button><button type="button" id="reviewNext">Next</button></details>`;
  document.body.appendChild(dialog);
  let page=0;
  function renderPage(){const size=50;dialog.querySelector('tbody').innerHTML=rows.slice(page*size,(page+1)*size).map(p=>`<tr><td>${esc(new Date(p.recorded_at).toLocaleTimeString())}</td><td>${num(Number.isFinite(p.speed_mps)?p.speed_mps*2.236936:null)}</td><td>${num(p.limit_mph,0)}</td><td>${esc(p.limit_source||'Unavailable')}${p.limit_cached?' (cached)':''}</td><td>${num(p.lean_estimate_deg)}</td><td>${num(p.heading_deg,0)}</td><td>${num(Number.isFinite(p.altitude_m)?p.altitude_m*3.28084:null,0)}</td><td>${num(Number.isFinite(p.accuracy_m)?p.accuracy_m*3.28084:null,0)}</td></tr>`).join('');dialog.querySelector('#reviewPage').textContent=count?`Samples ${page*size+1}–${Math.min(count,(page+1)*size)} of ${count}`:'No local parameter samples for this ride.';dialog.querySelector('#reviewPrev').disabled=!page;dialog.querySelector('#reviewNext').disabled=(page+1)*size>=count;}
  dialog.querySelector('#reviewPrev').onclick=()=>{page--;renderPage();};dialog.querySelector('#reviewNext').onclick=()=>{page++;renderPage();};renderPage();
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());
  dialog.querySelector('#saveRideGpx').onclick=()=>{
    if(!isCurrent())return dialog.close();
    const url=URL.createObjectURL(new Blob([rideGpx(ride.bikeName,rows)],{type:'application/gpx+xml'}));
    const link=document.createElement('a');link.href=url;link.download=`moto-ride-${id}.gpx`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    dialog.querySelector('#gpxSaveStatus').textContent='GPX download requested. You can export again from Ride history.';
  };
  const completed=e=>{if(e.detail.sessionId===id&&isCurrent())dialog.querySelector('#reviewSaveState').textContent='Ride summary synced.';};
  window.addEventListener('moto-ride-complete',completed);
  dialog.onclose=()=>{window.removeEventListener('moto-ride-complete',completed);dialog.remove();};
  dialog.showModal();
}
