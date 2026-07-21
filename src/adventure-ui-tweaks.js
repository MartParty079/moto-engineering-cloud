import './adventure-route-popup-hotfix.js?v=3';

if(!document.querySelector('link[data-adventure-route-hotfix]')){
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/src/adventure-route-popup-hotfix.css?v=3';
  link.dataset.adventureRouteHotfix='1';
  document.head.appendChild(link);
}

const $=q=>document.querySelector(q);
let hiddenRole=[];
let activeOverlay=null;

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

  if(activeOverlay&&!overlay)restoreRoleBadge();
  activeOverlay=overlay;
  if(overlay)polishAdventure(overlay);
}

const observer=new MutationObserver(syncOverlay);
observer.observe(document.body,{childList:true,subtree:false});
syncOverlay();
