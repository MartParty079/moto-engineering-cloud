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

function returnHome(overlay){
  const closeButton=overlay.querySelector('#closeAdventure');
  if(closeButton)closeButton.click();
  else overlay.remove();

  requestAnimationFrame(()=>{
    const home=document.querySelector('#nav [data-v="dashboard"]');
    if(home)home.click();
    else location.hash='dashboard';
  });
}

function fixHomeButton(overlay){
  const home=overlay.querySelector('#advRideReturn');
  if(!home)return;

  home.classList.remove('advExitButton');
  home.classList.add('advHomeButton');

  if(!home.querySelector('.advHomeLabel')){
    home.innerHTML='<svg class="advHomeIcon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10.5 9-7.5 9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/></svg><span class="advHomeLabel">HOME</span>';
  }

  if(home.getAttribute('aria-label')!=='Go to Home')home.setAttribute('aria-label','Go to Home');
  if(home.getAttribute('title')!=='Go to Home')home.setAttribute('title','Go to Home');
  if(home.dataset.homeBound!=='1'){
    home.dataset.homeBound='1';
    home.onclick=()=>returnHome(overlay);
  }
}

function polishOverlay(overlay){
  fixHomeButton(overlay);
  removeLegacyRouteCards(overlay);

  overlayObserver?.disconnect();
  overlayObserver=new MutationObserver(()=>{
    fixHomeButton(overlay);
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