const $=selector=>document.querySelector(selector);

let currentOverlay=null;
let overlayObserver=null;

function isLegacyRouteCard(element){
  if(!(element instanceof HTMLElement))return false;
  if(element.closest('#advRoutesSheet'))return false;
  if(element.matches('#adventureNavPanel,.adventureNavPanel'))return true;
  const text=(element.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
  return text.includes('ACTIVE ROUTE')&&(text.includes('NO ROUTE SELECTED')||text.includes('ROUTES'));
}

function removeLegacyRouteCards(overlay){
  overlay.querySelectorAll('#adventureNavPanel,.adventureNavPanel').forEach(element=>element.remove());
  [...overlay.children].forEach(element=>{
    if(isLegacyRouteCard(element))element.remove();
  });
}

function fixExitButton(overlay){
  const exit=overlay.querySelector('#advRideReturn');
  if(!exit)return;
  exit.classList.add('advExitButton');
  exit.textContent='×';
  exit.setAttribute('aria-label','Exit Adventure mode');
  exit.setAttribute('title','Exit Adventure mode');
}

function polishOverlay(overlay){
  fixExitButton(overlay);
  removeLegacyRouteCards(overlay);

  overlayObserver?.disconnect();
  overlayObserver=new MutationObserver(()=>{
    fixExitButton(overlay);
    removeLegacyRouteCards(overlay);
  });
  overlayObserver.observe(overlay,{childList:true,subtree:true});
}

function syncOverlay(){
  const overlay=$('#adventureOverlay');
  if(overlay===currentOverlay)return;
  overlayObserver?.disconnect();
  overlayObserver=null;
  currentOverlay=overlay;
  if(overlay)polishOverlay(overlay);
}

const bodyObserver=new MutationObserver(syncOverlay);
bodyObserver.observe(document.body,{childList:true,subtree:false});
syncOverlay();
