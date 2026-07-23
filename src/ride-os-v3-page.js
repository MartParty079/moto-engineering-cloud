const RIDE_DASH_SELECTOR='#rideDashOverlay';
const LEGACY_PAGE_SELECTOR='[data-fixed-ride-os-page="true"],[data-ride-os-placeholder="true"]';
const LEGACY_TAB_SELECTOR='[data-fixed-ride-os-tab="true"],[data-ride-os-placeholder-tab="true"]';

function currentMode(){
  return window.MotoRideOS3?.getMode?.()||localStorage.getItem('motoRideExperienceModeV2')||'road';
}

function rideIsActive(overlay){
  const state=window.MotoRide?.getState?.()||{};
  const control=overlay?.querySelector('#dashRideControl');
  return Boolean(state.active||state.starting||control?.classList.contains('recording')||control?.classList.contains('starting'));
}

function removeLegacyShell(overlay){
  if(!overlay?.isConnected)return;
  const dash=overlay.querySelector('.rideDash');
  const legacyPage=overlay.querySelector('[data-fixed-ride-os-page="true"]');
  const host=legacyPage?.querySelector('[data-ride-os-host]');
  const ribbon=host?.querySelector('.rideV3ModeRibbon');
  const hero=host?.querySelector('#rideV3Hero');
  const header=dash?.querySelector(':scope > header');

  if(dash&&header&&ribbon)header.insertAdjacentElement('afterend',ribbon);
  if(dash&&ribbon&&hero)ribbon.insertAdjacentElement('afterend',hero);

  overlay.querySelectorAll(LEGACY_PAGE_SELECTOR).forEach(node=>node.remove());
  overlay.querySelectorAll(LEGACY_TAB_SELECTOR).forEach(node=>node.remove());
  delete overlay.dataset.rideOsDedicatedPage;
  delete overlay.dataset.rideOsPageVisible;
  delete overlay.dataset.rideOsMount;
}

function requestRideOsOnce(overlay){
  if(!overlay?.isConnected||overlay.dataset.rideOsStaticRequest==='1')return;
  if(overlay.querySelector('.rideV3ModeRibbon')&&overlay.querySelector('#rideV3Hero'))return;
  const api=window.MotoRideOS3;
  if(!api?.setMode)return;
  overlay.dataset.rideOsStaticRequest='1';
  try{api.setMode(currentMode())}catch(error){console.warn('Ride OS initialization failed',error)}
}

function placeRideOs(overlay=document.querySelector(RIDE_DASH_SELECTOR),options={}){
  if(!overlay?.isConnected)return false;
  removeLegacyShell(overlay);

  const dash=overlay.querySelector('.rideDash');
  const header=dash?.querySelector(':scope > header');
  if(!dash||!header)return false;

  requestRideOsOnce(overlay);
  const ribbon=overlay.querySelector('.rideV3ModeRibbon');
  const hero=overlay.querySelector('#rideV3Hero');
  if(!ribbon||!hero)return false;

  if(ribbon.parentElement!==dash)header.insertAdjacentElement('afterend',ribbon);
  if(hero.parentElement!==dash||hero.previousElementSibling!==ribbon)ribbon.insertAdjacentElement('afterend',hero);

  overlay.dataset.rideOsStatic='ready';
  overlay.dataset.rideOsMount='ready';
  if(options.top||rideIsActive(overlay)){
    const pages=overlay.querySelector('#dashPages');
    if(pages)pages.scrollLeft=0;
  }
  return true;
}

function schedulePlacement(overlay,options={}){
  const target=overlay?.isConnected?overlay:document.querySelector(RIDE_DASH_SELECTOR);
  if(!target?.isConnected)return;
  if(placeRideOs(target,options))return;
  requestAnimationFrame(()=>placeRideOs(target,options));
}

window.addEventListener('moto-ride-dash-rendered',event=>schedulePlacement(event.detail?.overlay));
window.addEventListener('moto-ride-dash-opened',event=>schedulePlacement(event.detail?.overlay,{top:true}));
window.addEventListener('moto-ride-v3-mode',()=>schedulePlacement(document.querySelector(RIDE_DASH_SELECTOR)));
window.addEventListener('moto-ride-state',event=>{
  if(event.detail?.active||event.detail?.starting)schedulePlacement(document.querySelector(RIDE_DASH_SELECTOR),{top:true});
});
window.addEventListener('moto-ride-dash-closed',event=>{
  if(event.detail?.overlay)delete event.detail.overlay.dataset.rideOsStaticRequest;
});

schedulePlacement(document.querySelector(RIDE_DASH_SELECTOR));
