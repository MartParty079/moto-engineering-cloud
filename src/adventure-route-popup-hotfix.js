const $=selector=>document.querySelector(selector);

let currentOverlay=null;
let overlayObserver=null;

function normalizedText(element){
  return (element?.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
}

function looksLikeLegacyRouteCard(element){
  if(!(element instanceof HTMLElement))return false;
  if(element.matches('.adventureShell,#adventureOverlay,.advSheet,.advBottomBar,.advTopBar'))return false;
  if(element.closest('#advRoutesSheet,.advBottomBar,.advTopBar'))return false;

  const text=normalizedText(element);
  if(!text.includes('ACTIVE ROUTE'))return false;

  const hasRoutesButton=[...element.querySelectorAll('button')].some(button=>normalizedText(button)==='ROUTES');
  if(!hasRoutesButton)return false;

  const rect=element.getBoundingClientRect();
  return rect.width>=180&&rect.height>=60&&rect.height<=340;
}

function removeLegacyRouteCards(overlay){
  overlay.querySelectorAll('#adventureNavPanel,.adventureNavPanel,.advLegacyRoutePopup,[data-adventure-route-card]').forEach(element=>element.remove());

  const candidates=[...overlay.querySelectorAll('section,article,div')].filter(looksLikeLegacyRouteCard);
  const leafCandidates=candidates.filter(element=>![...element.children].some(child=>looksLikeLegacyRouteCard(child)));
  leafCandidates.forEach(element=>element.remove());
}

function fixExitButton(overlay){
  const exit=overlay.querySelector('#advRideReturn');
  if(!exit)return;

  exit.classList.add('advExitButton');
  if(exit.textContent!=='×')exit.textContent='×';
  if(exit.getAttribute('aria-label')!=='Exit Adventure mode')exit.setAttribute('aria-label','Exit Adventure mode');
  if(exit.getAttribute('title')!=='Exit Adventure mode')exit.setAttribute('title','Exit Adventure mode');
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
