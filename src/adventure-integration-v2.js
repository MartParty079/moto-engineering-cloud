const $=(q,r=document)=>r.querySelector(q);
let activeRoute=null;
let overlayObserver=null;
let lastSignature='';

const icon='<svg class="rideXIcon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18-6-6 6-6M3 12h13a5 5 0 0 1 5 5v2"/></svg>';

function routeFromUi(){
  const overlay=$('#adventureOverlay');
  if(!overlay)return activeRoute;
  const title=$('#advTopTitle',overlay)?.textContent?.trim();
  const progress=Number.parseFloat($('#advProgress',overlay)?.textContent)||0;
  const remaining=$('#advRemaining',overlay)?.textContent?.trim()||'—';
  const offRoute=$('#advOffRoute',overlay)?.textContent?.trim()||'—';
  const selected=$('#adventureRouteList .active',overlay);
  const name=(title&&title!=='Explore'?title:selected?.querySelector('strong')?.textContent?.trim())||null;
  const core={active:Boolean(name),name:name||'No active route',progress,remaining,offRoute,offRouteState:/ON TRACK/i.test(offRoute)?'on':offRoute==='—'?'unknown':'off'};
  const signature=JSON.stringify(core);
  if(signature!==lastSignature){lastSignature=signature;activeRoute={...core,updatedAt:Date.now()};window.dispatchEvent(new CustomEvent('moto-route-update',{detail:activeRoute}));}
  return activeRoute||core;
}

function returnToRide(){
  $('#closeAdventure')?.click();
  requestAnimationFrame(()=>{
    if(window.MotoRideDash?.open)window.MotoRideDash.open();
    else window.MotoRide?.open?.();
  });
}
function openAdventure(){
  const nav=$('#adventureNav');
  if(!nav)return false;
  $('#rideDashOverlay')?.remove();
  nav.click();return true;
}
function openRoutes(){
  if(!$('#adventureOverlay')){if(openAdventure())setTimeout(()=>$('#adventureOverlay [data-sheet="advGpxSheet"]')?.click(),500);return;}
  $('#adventureOverlay [data-sheet="advGpxSheet"]')?.click();
}
function openMap(){if(!$('#adventureOverlay'))openAdventure();}

function addReturnButton(overlay){
  const top=$('.advTopBar',overlay);if(!top||$('.advRideReturn',top))return;
  const button=document.createElement('button');button.type='button';button.className='advRideReturn';button.innerHTML=`${icon}<span>RIDE</span>`;button.onclick=returnToRide;
  top.insertBefore(button,$('#closeAdventure',top));
}
function addRouteBridge(overlay){
  if($('.advRouteBridge',overlay))return;
  const bridge=document.createElement('div');bridge.className='advRouteBridge';bridge.hidden=true;bridge.innerHTML='<div><small>ACTIVE ROUTE</small><strong>No route selected</strong></div><button type="button">ROUTES</button>';
  bridge.querySelector('button').onclick=openRoutes;overlay.querySelector('.adventureShell')?.appendChild(bridge);
}
function updateBridge(overlay){
  const data=routeFromUi();const bridge=$('.advRouteBridge',overlay);if(!bridge)return;
  bridge.hidden=!data?.active;const strong=bridge.querySelector('strong');if(strong)strong.textContent=data?.active?`${data.name} · ${Math.round(data.progress)}% · ${data.remaining}`:'No route selected';
}
function bindOverlay(overlay){
  if(!overlay||overlay.dataset.rideIntegration==='ready')return;
  overlay.dataset.rideIntegration='ready';addReturnButton(overlay);addRouteBridge(overlay);updateBridge(overlay);
  overlayObserver?.disconnect();
  overlayObserver=new MutationObserver(()=>updateBridge(overlay));
  const routeList=$('#adventureRouteList',overlay),panel=$('#adventureNavPanel',overlay);
  if(routeList)overlayObserver.observe(routeList,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  if(panel)overlayObserver.observe(panel,{childList:true,subtree:true,characterData:true});
}
function polishNav(){
  const nav=$('#adventureNav');if(!nav)return;
  const label=nav.querySelector('span:nth-of-type(2)');if(label)label.textContent='Maps & Routes';
  const badge=nav.querySelector('em');if(badge)badge.textContent='GPX';
  nav.setAttribute('aria-label','Open Maps and Routes');
}
function scan(){polishNav();bindOverlay($('#adventureOverlay'));}
const observer=new MutationObserver(mutations=>{if(mutations.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('#adventureOverlay,#adventureNav')||n.querySelector?.('#adventureOverlay,#adventureNav')))))scan();});
observer.observe(document.body,{childList:true,subtree:true});
window.MotoAdventure={open:openAdventure,openMap,openRoutes,returnToRide,close:()=>$('#closeAdventure')?.click(),getState:()=>activeRoute||routeFromUi()||{active:false,name:'No active route'}};
scan();
