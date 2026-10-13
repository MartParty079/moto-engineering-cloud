import {supabase} from './supabase.js';
import {loadRecordedRide} from './ride-gpx.js';
import {analyzeRide,reduceReviewCache} from './ride-analysis.js';
import {missionStore,riderPreferences} from './rider-preferences.js';

let activeClose=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
export async function openRideReview(rideId) {
  const {data,error}=await supabase.auth.getSession(),owner=data.session?.user.id;if(error||!owner)throw new Error('Sign in before reviewing a ride.');
  activeClose?.();
  if(window.MotoRide?.getState?.().active)throw new Error('Stop recording before reviewing a ride.');
  const modal=document.createElement('div');modal.id='missionRideReview';modal.className='rideModal';modal.innerHTML='<section><header><h3>Playback & timeline</h3><button type="button" data-close aria-label="Close">×</button></header><p data-status role="status">Loading complete ride samples…</p><div data-review></div></section>';document.body.appendChild(modal);
  let frame=0,playing=false,analysis=null,entry=null;
  const stop=()=>{playing=false;cancelAnimationFrame(frame);frame=0},close=()=>{stop();modal.remove();subscription.unsubscribe();if(activeClose===close)activeClose=null};activeClose=close;modal.querySelector('[data-close]').onclick=close;
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{if(s?.user.id!==owner)close()});
  const current=async()=>{const {data,error}=await supabase.auth.getSession();return !error&&data.session?.user.id===owner&&modal.isConnected};
  const status=modal.querySelector('[data-status]'),body=modal.querySelector('[data-review]');
  try{
    const prefs=await riderPreferences(owner),cache=await missionStore.get(owner,'review-cache')||[];
    entry=cache.find(r=>r.id===rideId);
    try{
      const {ride,rows}=await loadRecordedRide(supabase,owner,rideId,current);if(!await current())return;
      analysis=analyzeRide(rows,{toleranceMph:prefs.toleranceMph});
      entry={...entry,id:rideId,name:ride.bike_name||'Ride',startedAt:Date.parse(ride.started_at),rows,trace:analysis.segments,summary:analysis.summary,detail:'full',fetchedAt:Date.now()};
      await missionStore.update(owner,'review-cache',old=>reduceReviewCache([...(old||[]).filter(r=>r.id!==rideId),entry],prefs.detailRides));
      status.textContent='Complete saved track loaded. Values below are computed from available recorded GPS.';
    }catch(error){
      if(!entry)throw error;
      if(entry.detail==='full')analysis=analyzeRide(entry.rows,{toleranceMph:prefs.toleranceMph});
      else analysis={summary:entry.summary,segments:entry.trace,points:entry.trace.flat(),events:[]};
      status.textContent=`Live data unavailable (${error.message}). Showing ${entry.detail==='full'?'full':'compact'} cache from ${new Date(entry.fetchedAt).toLocaleString()}.`;
    }
    if(!await current())return;
    const s=analysis.summary,points=analysis.points,hasTime=points.length>1&&points.at(-1).time>points[0].time;
    body.innerHTML=`<h3>${esc(entry.name)}</h3><div class="missionReviewStats"><p>${s.gpsCount} GPS fixes · ${s.invalidGPS} invalid excluded</p><p>GPS distance with known accuracy: ${s.distanceMiles.toFixed(2)} mi</p><p>Time-weighted average: ${s.averageSpeedMph==null?'Unavailable':s.averageSpeedMph.toFixed(1)+' mph'} · ${s.knownSpeedSeconds.toFixed(0)} s with speed data</p><p>Moving time: ${s.movingSeconds.toFixed(0)} s · peak: ${s.maxSpeedMph==null?'Unavailable':s.maxSpeedMph.toFixed(1)+' mph'}</p><p>Speeding: ${s.speedingSeconds.toFixed(0)} s above trusted recorded limit + ${prefs.toleranceMph} mph. ${s.unknownLimitSeconds.toFixed(0)} s excluded for unknown limits. This backend does not persist matched limits, so current lookups are never substituted.</p><p>Chassis lean: ${esc(s.lean)}</p></div><div data-track-view></div><div data-speed-graph></div><label>Playback position<input type="range" data-playback min="0" max="${Math.max(0,points.length-1)}" value="0" step="1" ${hasTime?'':'disabled'}/></label><div class="actions"><button type="button" data-play ${hasTime?'':'disabled'}>Play / pause</button><label>Playback speed<select data-play-speed><option value="1">1×</option><option value="10">10×</option><option value="60">60×</option></select></label></div><p data-playback-info role="status"></p><h4>Event timeline</h4>${analysis.events.length?`<ol>${analysis.events.map(e=>`<li><button type="button" data-event-index="${Math.min(e.index,points.length-1)}">${esc(new Date(e.time).toLocaleTimeString())} · ${esc(e.type)}</button> · ${esc(e.confidence)}</li>`).join('')}</ol>`:'<p>No supported events in the available stream. Compact caches omit detailed events.</p>'}<label><input data-pin type="checkbox" ${entry.pinned?'checked':''}/> Pin this ride’s local detail</label><label><input data-backup type="checkbox" ${entry.backupConfirmed?'checked':''}/> I have retained a full exported/backup copy</label><p>Older unpinned local review detail can become a compact trace only after this confirmation and summary validation. Server records, pending journals and original GPX files remain intact.</p>`;
    const slider=body.querySelector('[data-playback]'),info=body.querySelector('[data-playback-info]');
    const minLat=points.reduce((n,p)=>Math.min(n,p.lat),90),maxLat=points.reduce((n,p)=>Math.max(n,p.lat),-90),minLon=points.reduce((n,p)=>Math.min(n,p.lon),180),maxLon=points.reduce((n,p)=>Math.max(n,p.lon),-180);
    const displaySegments=analysis.segments.map(s=>s.filter((p,i)=>i===0||i===s.length-1||i%Math.max(1,Math.ceil(points.length/2000))===0));
    const svg=()=>{
      if(!points.length)return '<p>No valid GPS track.</p>';
      const lat=points.reduce((n,p)=>Math.min(n,p.lat),90),maxLat=points.reduce((n,p)=>Math.max(n,p.lat),-90),lon=points.reduce((n,p)=>Math.min(n,p.lon),180),maxLon=points.reduce((n,p)=>Math.max(n,p.lon),-180),xy=p=>`${20+460*(p.lon-lon)/Math.max(.00001,maxLon-lon)},${280-260*(p.lat-lat)/Math.max(.00001,maxLat-lat)}`;
      return `<svg viewBox="0 0 500 300" role="img" aria-label="Recorded track with playback marker">${displaySegments.map(segment=>`<polyline points="${segment.map(xy).join(' ')}" stroke="#bcd58b" stroke-width="3" fill="none"/>`).join('')}<circle data-marker cx="${xy(points[0]).split(',')[0]}" cy="${xy(points[0]).split(',')[1]}" r="6" fill="#ff8154"/></svg>`;
    };
    body.querySelector('[data-track-view]').innerHTML=svg();
    const known=points.filter(p=>Number.isFinite(p.speedMph));
    if(known.length>1){const max=Math.max(1,s.maxSpeedMph||1),start=points[0].time,duration=Math.max(1,points.at(-1).time-start);body.querySelector('[data-speed-graph]').innerHTML=`<p>GPS speed over recorded UTC time (mph)</p><svg viewBox="0 0 500 130" role="img" aria-label="Recorded speed graph">${displaySegments.map(segment=>`<polyline points="${segment.filter(p=>Number.isFinite(p.speedMph)).map(p=>`${20+460*(p.time-start)/duration},${115-p.speedMph/max*100}`).join(' ')}" stroke="#ff8154" stroke-width="2" fill="none"/>`).join('')}</svg>`;}
    const update=()=>{const point=points[Number(slider.value)];if(!point)return;info.textContent=`${new Date(point.time).toLocaleString()} · ${Number.isFinite(point.speedMph)?point.speedMph.toFixed(1)+' mph':'speed unavailable'} · ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;const paths=body.querySelector('[data-track-view] svg'),marker=paths?.querySelector('[data-marker]');if(marker){marker.setAttribute('cx',20+460*(point.lon-minLon)/Math.max(.00001,maxLon-minLon));marker.setAttribute('cy',280-260*(point.lat-minLat)/Math.max(.00001,maxLat-minLat));}};
    slider.oninput=()=>{stop();update()};body.querySelectorAll('[data-event-index]').forEach(button=>button.onclick=()=>{stop();slider.value=button.dataset.eventIndex;update()});
    body.querySelector('[data-play]').onclick=()=>{if(playing){stop();return}playing=true;let target=points[Number(slider.value)].time,last=performance.now();const step=now=>{if(!playing||!modal.isConnected){stop();return}target+=(now-last)*Number(body.querySelector('[data-play-speed]').value);last=now;let index=Number(slider.value);while(index<points.length-1&&points[index+1].time<=target)index++;slider.value=index;update();if(index>=points.length-1)stop();else frame=requestAnimationFrame(step)};frame=requestAnimationFrame(step)};
    const save=async()=>{try{if(!await current())return;const pin=body.querySelector('[data-pin]').checked,backup=body.querySelector('[data-backup]').checked;await missionStore.update(owner,'review-cache',old=>reduceReviewCache((old||[]).map(r=>r.id===rideId?{...r,pinned:pin,backupConfirmed:backup}:r),prefs.detailRides));status.textContent='Local review retention preference saved.'}catch(error){status.textContent=error.message}};
    body.querySelector('[data-pin]').onchange=save;body.querySelector('[data-backup]').onchange=save;update();
  }catch(error){if(modal.isConnected)status.textContent=error.message}
}
