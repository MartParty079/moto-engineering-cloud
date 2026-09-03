const $=q=>document.querySelector(q);
let hiddenRole=[];
let activeOverlay=null;
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
  home.setAttribute('aria-label','Go to Home');
  home.setAttribute('title','Go to Home');
  if(home.dataset.homeBound!=='1'){
    home.dataset.homeBound='1';
    home.onclick=()=>returnHome(overlay);
  }
}

function hideRoleBadge(){
  if(hiddenRole.length)return;
  document.querySelectorAll('body *').forEach(el=>{
    if(el.closest('#adventureOverlay'))return;
    const text=(el.textContent||'').trim();
    if(!/^Administrator(?:\s|$)/i.test(text))return;
    const r=el.getBoundingClientRect();
    const style=getComputedStyle(el);
    if((style.position==='fixed'||style.position==='absolute')&&r.width>100&&r.height<120){
      hiddenRole.push([el,el.style.display]);
      el.style.display='none';
    }
  });
}

function restoreRoleBadge(){
  hiddenRole.forEach(([el,d])=>{if(el?.isConnected)el.style.display=d});
  hiddenRole=[];
}

function polishAdventure(overlay){
  if(!overlay)return;
  hideRoleBadge();
  fixHomeButton(overlay);
  removeLegacyRouteCards(overlay);

  const limitLabel=overlay.querySelector('[data-metric="limit"] small');
  if(limitLabel&&limitLabel.textContent!=='SPEED LIMIT')limitLabel.textContent='SPEED LIMIT';

  const dataSheet=overlay.querySelector('#advDataSheet');
  if(dataSheet&&!dataSheet.dataset.polished){
    dataSheet.dataset.polished='1';
    const choices=dataSheet.querySelector('.advMetricChoices');
    if(choices){
      choices.insertAdjacentHTML('beforebegin','<div class="advDataIntro"><small>MAP OVERLAY</small><strong>Choose what stays visible while riding</strong><p>Keep only the information you need for a clear map view.</p></div>');
      choices.querySelectorAll('label').forEach(label=>{
        const input=label.querySelector('input');
        const text=label.textContent.trim();
        label.innerHTML=`<span><strong>${text}</strong><small>${text==='Speed'?'Live GPS speed':text==='Speed limit'?'Posted road limit':text==='Road'?'Current mapped road':text==='Heading'?'Course direction':text==='Altitude'?'GPS elevation':'Current GPS precision'}</small></span>`;
        if(input)label.prepend(input);
      });
    }
    const toggle=overlay.querySelector('#advOverlayToggle');
    if(toggle){
      toggle.textContent='HIDE DATA OVERLAY';
      toggle.classList.add('advOverlayVisibility');
    }
  }
}

function syncOverlay(){
  const overlay=$('#adventureOverlay');
  if(overlay===activeOverlay)return;
  overlayObserver?.disconnect();
  overlayObserver=null;
  if(activeOverlay&&!overlay)restoreRoleBadge();
  activeOverlay=overlay;
  if(overlay){
    polishAdventure(overlay);
    overlayObserver=new MutationObserver(()=>polishAdventure(overlay));
    overlayObserver.observe(overlay,{childList:true,subtree:true});
  }
}

const observer=new MutationObserver(syncOverlay);
observer.observe(document.body,{childList:true,subtree:false});
syncOverlay();
