const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>[...r.querySelectorAll(q)];
const esc=(s='')=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

const MODE_KEY='motoRideExperienceModeV2';
const FUEL_KEY='motoRideFuelProfilesV2';
const TOLERANCE_KEY='motoRideSpeedToleranceV2';
const WAKE_KEY='motoRideWakeLockV1';

const modes={
  road:{name:'Adaptive Road',short:'ROAD',icon:'road',accent:'#3b82f6',theme:'modern',description:'Daily-road intelligence with speed-limit awareness, fuel confidence and clean navigation.',features:['Adaptive speed color','Road and limit context','Fuel confidence','Route status']},
  race:{name:'Race',short:'RACE',icon:'race',accent:'#ef2b2d',theme:'race',description:'High-density performance telemetry for corners, acceleration and post-session review.',features:['Lean priority','Corner average','Acceleration focus','Fast red telemetry']},
  enduro:{name:'Enduro',short:'ENDURO',icon:'enduro',accent:'#f97316',theme:'rally',description:'Glove-friendly trail information with altitude, route confidence and hazard marking.',features:['Large trail data','Elevation focus','Hazard marker','Topo-first map']},
  adventure:{name:'Adventure',short:'ADV',icon:'adventure',accent:'#d6a62b',theme:'adventure',description:'Long-range navigation with routes, fuel reserve, weather and map-first decision making.',features:['Route progress','Range planning','Weather context','Map integration']}
};

const iconPaths={
  road:'<path d="M12 2 8 22M16 2l-4 20M9.4 7h5.2M8.5 12h5M7.5 17h5"/>',
  race:'<path d="M5 21V4m0 1c5-3 8 3 14 0v9c-6 3-9-3-14 0"/>',
  enduro:'<path d="m3 19 6-10 3 5 3-9 6 14H3Zm5-3h8"/>',
  adventure:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  fuel:'<path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M4 21h12M8 7h4v4H8Zm7 0h2l2 3v7a2 2 0 0 1-4 0"/>',
  route:'<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7.5 16.5c2-3 5-2 6.5-5s.5-4 2.5-5"/>',
  sensor:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  hazard:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  note:'<path d="M4 4h16v12H8l-4 4V4Z"/><path d="M8 8h8m-8 4h5"/>',
  share:'<circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5m-8 7 8 5"/>',
  wake:'<path d="M8 19h8m-7-3h6m-8-4a5 5 0 1 1 10 0c0 2-1 3-2 4H9c-1-1-2-2-2-4Z"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  palette:'<path d="M12 3a9 9 0 1 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h2a7 7 0 0 0-2-11Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.5" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="17" cy="11" r="1"/>',
  layout:'<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/>',
  log:'<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',
  map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>'
};
function icon(name){return `<svg class="rideXIcon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]||iconPaths.road}</svg>`;}

let mode=localStorage.getItem(MODE_KEY);
if(!modes[mode]) mode='road';
let ride={},road={},gps={},route={},tools={};
let wakeLock=null;
let observer=null;
let refreshQueued=false;

function fuelProfiles(){try{return JSON.parse(localStorage.getItem(FUEL_KEY)||'{}')}catch{return {}}}
function currentBikeId(){return String(ride?.bikeId||window.MotoRide?.getState?.()?.bikeId||'default')}
function fuelProfile(){const all=fuelProfiles();return all[currentBikeId()]||{percent:100,fullRange:120,reserve:15,updatedAt:null};}
function saveFuel(profile){const all=fuelProfiles();all[currentBikeId()]={...profile,updatedAt:new Date().toISOString()};localStorage.setItem(FUEL_KEY,JSON.stringify(all));update();}
function tolerance(){return Math.max(0,Math.min(20,Number(localStorage.getItem(TOLERANCE_KEY)||5)));}
function speed(){return Math.max(0,Number(ride?.speedMph??gps?.speed??0)||0)}
function limit(){const n=Number(road?.limit_mph);return Number.isFinite(n)&&n>0?n:null}
function compliance(){
  const mph=speed(),max=limit();
  if(!max)return {state:'unknown',color:'var(--ride-mode-accent)',ratio:null,label:'LIMIT SEARCH'};
  const ratio=mph/max,allowed=1+tolerance()/100;
  if(ratio<=.9)return {state:'clear',color:'#22c55e',ratio,label:'IN RANGE'};
  if(ratio<=1)return {state:'near',color:'#f59e0b',ratio,label:'NEAR LIMIT'};
  if(ratio<=allowed)return {state:'grace',color:'#f97316',ratio,label:`+${Math.round((ratio-1)*100)}%`};
  if(ratio<=1.15)return {state:'over',color:'#ef4444',ratio,label:`+${Math.round((ratio-1)*100)}%`};
  return {state:'critical',color:'#e879f9',ratio,label:`+${Math.round((ratio-1)*100)}%`};
}
function fuelState(){const p=fuelProfile(),percent=Math.max(0,Math.min(100,Number(p.percent)||0)),remaining=Number(p.fullRange||0)*percent/100;return {...p,percent,remaining,state:percent<=Number(p.reserve||15)/2?'critical':percent<=Number(p.reserve||15)?'reserve':percent<=30?'low':'good'};}
function routeState(){return route&&typeof route==='object'?route:{};}

function setMode(next,{announce=true}={}){
  if(!modes[next])return;
  mode=next;localStorage.setItem(MODE_KEY,next);
  document.documentElement.dataset.rideMode=next;
  const overlay=$('#rideDashOverlay');
  if(overlay){overlay.dataset.rideMode=next;enhanceOverlay(overlay);update();}
  window.MotoRide?.setMode?.(next);
  window.dispatchEvent(new CustomEvent('moto-ride-mode-change',{detail:{mode,next,profile:modes[next]}}));
  if(announce)toast(`${modes[next].name} mode ready`);
}

function smartStrip(){
  const c=compliance(),f=fuelState(),r=routeState(),max=limit();
  return `<div id="rideXSmartStrip" class="rideXSmartStrip" data-speed-state="${c.state}" data-fuel-state="${f.state}">
    <button class="rideXModeSummary" data-ridex="modes" type="button">${icon(modes[mode].icon)}<span><small>RIDE MODE</small><strong>${esc(modes[mode].name)}</strong></span></button>
    <button class="rideXCompliance" data-ridex="speed" type="button" style="--adaptive:${c.color}"><span class="rideXComplianceRing" style="--ratio:${Math.min(1.25,c.ratio||0)}"><b>${Math.round(speed())}</b><small>MPH</small></span><span><small>${max?`${max} MPH LIMIT`:'ROAD CONTEXT'}</small><strong>${esc(c.label)}</strong></span></button>
    <button class="rideXRoute" data-ridex="routes" type="button">${icon('route')}<span><small>ROUTE</small><strong>${esc(r.name||'Choose route')}</strong></span></button>
    <button class="rideXFuel" data-ridex="fuel" type="button" style="--fuel:${f.percent}%">${icon('fuel')}<span><small>FUEL RANGE</small><strong>${Math.round(f.remaining)} MI · ${Math.round(f.percent)}%</strong></span></button>
  </div>`;
}

function enhanceOverlay(overlay){
  if(!overlay?.isConnected)return;
  overlay.dataset.rideExperience='v2';overlay.dataset.rideMode=mode;
  const brand=$('.dashBrand small',overlay);if(brand)brand.textContent='MOTO MISSION · RIDE OS';
  const adv=$('#dashAdventure',overlay);if(adv){adv.textContent='MAPS';adv.title='Open Maps & Routes';}
  let modeButton=$('#rideXModeButton',overlay);
  if(!modeButton){
    modeButton=document.createElement('button');modeButton.id='rideXModeButton';modeButton.type='button';modeButton.className='rideXModeButton';
    const actions=$('.dashHeaderActions',overlay);actions?.insertBefore(modeButton,$('#dashEdit',overlay)||actions.firstChild);
  }
  modeButton.innerHTML=`${icon(modes[mode].icon)}<span>${esc(modes[mode].short)}</span>`;
  modeButton.onclick=()=>openModeSheet();
  let strip=$('#rideXSmartStrip',overlay);
  if(!strip){strip=document.createElement('div');const anchor=$('#dashRideControl',overlay)||$('.rideDash>header',overlay);anchor?.insertAdjacentElement('afterend',strip);}
  strip.outerHTML=smartStrip();
  bindOverlayActions(overlay);
  enrichQuickSettings(overlay);
  auditControls(overlay);
}

function bindOverlayActions(overlay){
  $$('[data-ridex]',overlay).forEach(button=>{if(button.dataset.rideXBound)return;button.dataset.rideXBound='1';button.onclick=()=>run(button.dataset.ridex);});
}
function auditControls(root){
  $$('button',root).forEach(button=>{if(!button.type)button.type='button';if(!button.getAttribute('aria-label')){const text=button.textContent.trim();if(text)button.setAttribute('aria-label',text.slice(0,80));}});
}

function sheet(id,title,body){
  $(`#${id}`)?.remove();const modal=document.createElement('div');modal.id=id;modal.className='rideXSheet';modal.innerHTML=`<section role="dialog" aria-modal="true"><header><div><small>RIDE OS</small><h3>${esc(title)}</h3></div><button data-close type="button">${icon('close')}</button></header>${body}</section>`;document.body.appendChild(modal);modal.onclick=e=>{if(e.target===modal||e.target.closest('[data-close]'))modal.remove();};return modal;
}
function modeCards(){return Object.entries(modes).map(([id,p])=>`<button class="rideXModeCard ${id===mode?'active':''}" data-mode="${id}" type="button" style="--mode:${p.accent}">${icon(p.icon)}<span><small>${p.short}</small><strong>${esc(p.name)}</strong><em>${esc(p.description)}</em><i>${p.features.map(esc).join(' · ')}</i></span><b>${id===mode?icon('check'):''}</b></button>`).join('');}
function openModeSheet(){
  const modal=sheet('rideXModeSheet','Choose ride mode',`<p class="rideXIntro">One logger, one map and one ride history. Modes only reorganize what matters most.</p><div class="rideXModeGrid">${modeCards()}</div><div class="rideXTolerance"><span><strong>Adaptive speed tolerance</strong><small>Color changes after the detected limit plus this allowance.</small></span><select id="rideXTolerance"><option value="0">0%</option><option value="5">5%</option><option value="10">10%</option><option value="15">15%</option></select></div><div class="rideXFooterActions"><button data-action="appearance">${icon('palette')} APPEARANCE</button><button data-action="layout">${icon('layout')} EDIT DISPLAYS</button></div>`);
  $('#rideXTolerance',modal).value=String(tolerance());$('#rideXTolerance',modal).onchange=e=>{localStorage.setItem(TOLERANCE_KEY,e.target.value);update();};
  $$('[data-mode]',modal).forEach(b=>b.onclick=()=>{setMode(b.dataset.mode);modal.remove();});
  $$('[data-action]',modal).forEach(b=>b.onclick=()=>{modal.remove();run(b.dataset.action);});
}
function openFuelSheet(){
  const f=fuelState();const modal=sheet('rideXFuelSheet','Fuel & range',`<p class="rideXIntro">A manual estimate designed to remain useful before bike telemetry is connected.</p><div class="rideXFuelHero" data-state="${f.state}"><span class="rideXFuelTank"><i style="height:${f.percent}%"></i></span><div><small>ESTIMATED REMAINING</small><strong id="rideXFuelMiles">${Math.round(f.remaining)} MI</strong><span id="rideXFuelPercent">${Math.round(f.percent)}%</span></div></div><label class="rideXRangeLabel"><span>CURRENT FUEL</span><input id="rideXFuelPercentInput" type="range" min="0" max="100" step="1" value="${f.percent}"></label><div class="rideXFormGrid"><label>FULL-TANK RANGE<input id="rideXFullRange" type="number" min="1" max="1000" value="${Number(f.fullRange)||120}"><span>miles</span></label><label>RESERVE WARNING<input id="rideXReserve" type="number" min="1" max="50" value="${Number(f.reserve)||15}"><span>percent</span></label></div><div class="rideXFooterActions"><button id="rideXFuelFull">MARK FULL</button><button id="rideXFuelSave" class="primary">SAVE ESTIMATE</button></div>`);
  const preview=()=>{const percent=Number($('#rideXFuelPercentInput',modal).value),range=Number($('#rideXFullRange',modal).value);$('#rideXFuelMiles',modal).textContent=`${Math.round(range*percent/100)} MI`;$('#rideXFuelPercent',modal).textContent=`${percent}%`;};
  $('#rideXFuelPercentInput',modal).oninput=preview;$('#rideXFullRange',modal).oninput=preview;
  $('#rideXFuelFull',modal).onclick=()=>{$('#rideXFuelPercentInput',modal).value='100';preview();};
  $('#rideXFuelSave',modal).onclick=()=>{saveFuel({percent:Number($('#rideXFuelPercentInput',modal).value),fullRange:Number($('#rideXFullRange',modal).value),reserve:Number($('#rideXReserve',modal).value)});modal.remove();toast('Fuel estimate updated');};
}
function openSystemCheck(){
  const r=window.MotoRide?.getState?.()||ride,t=window.MotoRideTools?.getState?.()||tools,checks=[['Ride logger',Boolean(window.MotoRide)],['GPS',Boolean(r.gpsLocked||gps?.latitude)],['Motion sensors',Boolean(t.motionEnabled)],['Road data',Boolean(limit()||road?.road)],['Routes',Boolean(window.MotoAdventure||$('#adventureNav'))],['Map engine',Boolean(window.L||navigator.onLine)]];
  sheet('rideXCheckSheet','System check',`<div class="rideXCheckList">${checks.map(([label,ok])=>`<div class="${ok?'ok':'wait'}"><span>${ok?icon('check'):icon('refresh')}</span><strong>${esc(label)}</strong><small>${ok?'READY':'AVAILABLE WHEN NEEDED'}</small></div>`).join('')}</div><p class="rideXFootnote">GPS recording remains independent from map tiles and optional sensor tools.</p>`);
}
function enrichQuickSettings(overlay){
  const grid=$('.dashRideSettingsGrid',overlay);if(!grid||grid.dataset.rideXEnhanced)return;grid.dataset.rideXEnhanced='1';
  const items=[['modes','mode','MODE','Race, Enduro, Adventure or Road'],['fuel','fuel','FUEL','Range and reserve estimate'],['routes','route','ROUTES','GPX and active navigation'],['sensors','sensor','SENSORS','Lean and acceleration'],['hazard','hazard','MARK','Road or trail condition'],['note','note','NOTE','Save a ride note'],['share','share','SHARE','Current ride position'],['wake','wake','SCREEN','Keep display awake'],['check','check','CHECK','System readiness']];
  items.reverse().forEach(([action,ico,label,sub])=>{const b=document.createElement('button');b.type='button';b.dataset.rideXQuick=action;b.innerHTML=`${icon(ico)}<span>${label}</span><small>${sub}</small>`;grid.insertBefore(b,grid.firstChild);});
  $$('[data-ride-x-quick]',grid).forEach(b=>b.onclick=()=>{overlay.querySelector('#dashRideQuickSettings')?.remove();run(b.dataset.rideXQuick);});
}

async function keepAwake(){
  if(!('wakeLock'in navigator)){toast('Screen wake lock is not supported here');return;}
  try{if(wakeLock){await wakeLock.release();wakeLock=null;localStorage.setItem(WAKE_KEY,'off');toast('Automatic screen lock restored');}else{wakeLock=await navigator.wakeLock.request('screen');localStorage.setItem(WAKE_KEY,'on');wakeLock.addEventListener('release',()=>{wakeLock=null;});toast('Screen will stay awake during this ride');}}catch(e){toast(e.message||'Wake lock unavailable');}
}
async function shareRide(){
  const lat=Number(ride?.latitude??gps?.latitude),lon=Number(ride?.longitude??gps?.longitude),text=`Moto Mission ride · ${modes[mode].name}${Number.isFinite(lat)&&Number.isFinite(lon)?` · https://maps.google.com/?q=${lat},${lon}`:''}`;
  try{if(navigator.share)await navigator.share({title:'Moto Mission Ride',text});else{await navigator.clipboard.writeText(text);toast('Ride status copied');}}catch(e){if(e?.name!=='AbortError')toast('Unable to share ride');}
}
async function sensorAction(){try{const t=window.MotoRideTools;if(!t)throw Error('Sensor tools are still loading');const s=t.getState?.()||{};if(s.motionEnabled)t.recalibrate?.();else await t.enableSensors?.();toast(s.motionEnabled?'Lean recalibration started':'Sensors enabled · hold the bike upright');}catch(e){toast(e.message||String(e));}}
async function hazardAction(){try{await window.MotoRideTools?.markRoad?.();toast('Condition marker saved');}catch(e){toast(e.message||'Could not save marker');}}
async function noteAction(){try{await window.MotoRideTools?.saveNote?.();toast('Ride note saved');}catch(e){toast(e.message||'Could not save note');}}
function openRoutes(){if(window.MotoAdventure?.openRoutes){window.MotoAdventure.openRoutes();return;}const nav=$('#adventureNav');if(nav){$('#rideDashOverlay')?.remove();nav.click();}else toast('Maps & Routes is still loading');}
function appearance(){const overlay=$('#rideDashOverlay');const style=$('#dashStyle',overlay);if(style)style.click();else toast('Appearance controls unavailable');}
function layout(){const overlay=$('#rideDashOverlay');const edit=$('#dashEdit',overlay);if(edit)edit.click();else toast('Display editor unavailable');}
function run(action){
  const actions={modes:openModeSheet,fuel:openFuelSheet,routes:openRoutes,map:openRoutes,sensors:sensorAction,hazard:hazardAction,note:noteAction,share:shareRide,wake:keepAwake,check:openSystemCheck,appearance,layout,speed:openModeSheet};
  return actions[action]?.();
}

function update(){
  if(refreshQueued)return;refreshQueued=true;requestAnimationFrame(()=>{refreshQueued=false;const overlay=$('#rideDashOverlay');if(!overlay)return;overlay.dataset.rideMode=mode;const c=compliance(),f=fuelState();overlay.dataset.adaptiveSpeed=c.state;overlay.dataset.fuelState=f.state;overlay.style.setProperty('--ride-mode-accent',modes[mode].accent);overlay.style.setProperty('--adaptive-speed',c.color);const strip=$('#rideXSmartStrip',overlay);if(strip){strip.outerHTML=smartStrip();bindOverlayActions(overlay);}const modeButton=$('#rideXModeButton',overlay);if(modeButton)modeButton.innerHTML=`${icon(modes[mode].icon)}<span>${esc(modes[mode].short)}</span>`;enrichQuickSettings(overlay);});
}
function toast(message){let el=$('#rideXToast');if(!el){el=document.createElement('div');el.id='rideXToast';document.body.appendChild(el);}el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2600);}
function scan(){const overlay=$('#rideDashOverlay');if(overlay)enhanceOverlay(overlay);}

window.addEventListener('moto-ride-dash-opened',e=>enhanceOverlay(e.detail?.overlay||$('#rideDashOverlay')));
window.addEventListener('moto-ride-dash-rendered',e=>enhanceOverlay(e.detail?.overlay||$('#rideDashOverlay')));
window.addEventListener('moto-ride-dash-refreshed',e=>{enhanceOverlay(e.detail?.overlay||$('#rideDashOverlay'));update();});
window.addEventListener('moto-ride-state',e=>{ride=e.detail||{};if(ride.active&&localStorage.getItem(WAKE_KEY)==='on'&&!wakeLock)void keepAwake();update();});
window.addEventListener('moto-road-update',e=>{road=e.detail||{};update();});
window.addEventListener('moto-gps-fix',e=>{gps=e.detail||{};update();});
window.addEventListener('moto-route-update',e=>{route=e.detail||{};update();});
window.addEventListener('moto-tools-update',e=>{tools={...tools,...e.detail};update();});
window.addEventListener('moto-motion-update',e=>{tools={...tools,...e.detail};});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ride?.active&&localStorage.getItem(WAKE_KEY)==='on'&&!wakeLock)void keepAwake();});

observer=new MutationObserver(mutations=>{if(mutations.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('#rideDashOverlay,#dashRideQuickSettings')||n.querySelector?.('#rideDashOverlay,#dashRideQuickSettings')))))scan();});
observer.observe(document.body,{childList:true,subtree:true});
document.documentElement.dataset.rideMode=mode;
window.MotoRideExperience={getMode:()=>mode,setMode,openModes:openModeSheet,openFuel:openFuelSheet,check:openSystemCheck,share:shareRide};
scan();
