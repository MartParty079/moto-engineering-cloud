const OVERLAY_SELECTOR='#rideDashOverlay';

let roadState={};
let gpsState={};
let rideState={};
let patchFrame=0;

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;

function currentRide(){
  return {...rideState,...(window.MotoRide?.getState?.()||{})};
}

function currentGps(){
  return {...gpsState,...(window.MotoGPS||window.__motoLatestGpsFix||{})};
}

function currentSpeed(){
  const ride=currentRide();
  const gps=currentGps();
  return Math.max(0,finite(ride.speedMph??ride.speed??gps.speed)??0);
}

function currentLimit(){
  return finite(roadState.limit_mph??roadState.speedLimitMph??roadState.limit);
}

function limitStatus(){
  const limit=currentLimit();
  if(limit===null)return 'SEARCHING';
  if(roadState.cached||roadState.cacheHit)return 'CACHED';
  if(roadState.estimated)return 'ESTIMATED';
  return 'LIVE';
}

function speedMarkup(){
  const speed=Math.round(currentSpeed());
  const limit=currentLimit();
  const limitText=limit===null?'--':String(Math.round(limit));
  const state=limitStatus();
  return `<div class="dashSpeedSplit" role="group" aria-label="Current speed ${speed} miles per hour. Speed limit ${limitText} miles per hour.">
    <section class="dashSpeedPane dashSpeedCurrent">
      <small>SPEED</small>
      <div class="dashSpeedReadout"><strong>${speed}</strong><span>MPH</span></div>
    </section>
    <section class="dashSpeedPane dashSpeedLimit">
      <small>LIMIT</small>
      <div class="dashSpeedReadout"><strong>${limitText}</strong><span>MPH</span></div>
      <em class="dashLimitState">${state}</em>
    </section>
  </div>`;
}

function patchSpeedWidgets(overlay){
  if(!overlay?.isConnected)return;
  const key=`${Math.round(currentSpeed())}|${currentLimit()??'--'}|${limitStatus()}`;
  overlay.querySelectorAll('.widget-speed [data-value="speed"]').forEach(value=>{
    if(value.dataset.splitSpeedKey===key&&value.querySelector('.dashSpeedSplit'))return;
    value.innerHTML=speedMarkup();
    value.dataset.splitSpeedKey=key;
  });
}

function normalizeHeader(overlay){
  if(!overlay?.isConnected)return;
  const actions=overlay.querySelector('.dashHeaderActions');
  if(!actions)return;

  const active=overlay.dataset.rideActive==='true'||Boolean(currentRide().active||currentRide().starting);
  if(!active)return;

  const adventureButtons=[...actions.querySelectorAll('[id="dashAdventure"]')];
  const adventure=adventureButtons.shift();
  adventureButtons.forEach(button=>button.remove());

  const studioButtons=[...actions.querySelectorAll('[id="rideV3Studio"]')];
  studioButtons.slice(1).forEach(button=>button.remove());

  const edit=actions.querySelector('#dashEdit');
  const close=actions.querySelector('#dashClose');
  if(edit)edit.textContent='SET';
  if(adventure){
    adventure.textContent='ADV';
    adventure.setAttribute('aria-label','Open Adventure Mode');
    adventure.title='Open Adventure Mode';
  }

  if(edit&&adventure&&close){
    actions.append(edit,adventure,close);
  }
}

function patchOverlay(overlay=document.querySelector(OVERLAY_SELECTOR)){
  if(!overlay?.isConnected)return;
  patchSpeedWidgets(overlay);
  normalizeHeader(overlay);
}

function schedulePatch(overlay){
  if(patchFrame)return;
  patchFrame=requestAnimationFrame(()=>{
    patchFrame=0;
    patchOverlay(overlay||document.querySelector(OVERLAY_SELECTOR));
  });
}

window.addEventListener('moto-road-update',event=>{
  roadState={...roadState,...(event.detail||{})};
  schedulePatch();
});
window.addEventListener('moto-gps-fix',event=>{
  gpsState={...gpsState,...(event.detail||{})};
  schedulePatch();
});
window.addEventListener('moto-ride-state',event=>{
  rideState={...rideState,...(event.detail||{})};
  schedulePatch();
});
window.addEventListener('moto-ride-dash-opened',event=>schedulePatch(event.detail?.overlay));
window.addEventListener('moto-ride-dash-rendered',event=>schedulePatch(event.detail?.overlay));
window.addEventListener('moto-ride-dash-refreshed',event=>schedulePatch(event.detail?.overlay));
window.addEventListener('moto-ride-start-progress',()=>schedulePatch());

new MutationObserver(mutations=>{
  if(mutations.some(mutation=>[...mutation.addedNodes].some(node=>node.nodeType===1&&(node.matches?.(OVERLAY_SELECTOR)||node.querySelector?.(OVERLAY_SELECTOR)))))schedulePatch();
}).observe(document.body,{childList:true,subtree:false});

schedulePatch();
import('./ride-performance-guard.js?v=1').catch(error=>console.error('Ride performance guard failed to load',error));
