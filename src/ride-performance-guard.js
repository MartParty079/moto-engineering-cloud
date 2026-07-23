const MOTION_EVENT_TYPES=['moto-motion-update','moto-tools-update'];
const UI_FLUSH_MS=250;
const state={timer:0,details:new Map(),lastRideSignature:''};

function redispatch(type,detail){
  window.dispatchEvent(new CustomEvent(type,{detail:{...(detail||{}),__motoPerformancePass:true}}));
}

function flush(){
  state.timer=0;
  const pending=[...state.details.entries()];
  state.details.clear();
  pending.forEach(([type,detail])=>redispatch(type,detail));
}

function queue(type,detail){
  state.details.set(type,{...(state.details.get(type)||{}),...(detail||{})});
  if(!state.timer)state.timer=window.setTimeout(flush,UI_FLUSH_MS);
}

function interceptHighFrequencyEvent(event){
  if(event.detail?.__motoPerformancePass)return;
  event.stopImmediatePropagation();
  queue(event.type,event.detail);
}

function interceptRideState(event){
  if(event.detail?.__motoPerformancePass)return;
  const detail=event.detail||{};
  const signature=`${Boolean(detail.active)}|${Boolean(detail.starting)}|${detail.id||detail.sessionId||detail.rideId||''}`;
  if(signature!==state.lastRideSignature){
    state.lastRideSignature=signature;
    return;
  }
  event.stopImmediatePropagation();
  queue(event.type,detail);
}

function installLowCostRideStyle(){
  if(document.querySelector('style[data-ride-performance-guard]'))return;
  const style=document.createElement('style');
  style.dataset.ridePerformanceGuard='1';
  style.textContent=`
    #rideDashOverlay .rideV3Scene{background:linear-gradient(165deg,#07101d 0,#030711 58%,#07101a 100%)!important}
    #rideDashOverlay .rideV3Orb,
    #rideDashOverlay .rideV3Machine,
    #rideDashOverlay .rideV3RoadGrid{display:none!important}
    #rideDashOverlay .rideV3Horizon{opacity:.22!important;box-shadow:none!important;transform:none!important}
    #rideDashOverlay .rideV3ModeRibbon,
    #rideDashOverlay .rideV3Hero,
    #rideDashOverlay .rideDash>header{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    #rideDashOverlay .rideV3AttitudeWorld,
    #rideDashOverlay .rideV3BikeMark{transition:none!important}
    #rideDashOverlay *,
    #rideDashOverlay *::before,
    #rideDashOverlay *::after{animation-duration:0s!important;animation-iteration-count:1!important}
  `;
  document.head.appendChild(style);
}

function removeHeavyScene(overlay=document.querySelector('#rideDashOverlay')){
  if(!overlay?.isConnected)return;
  overlay.dataset.ridePerformance='stable';
  overlay.querySelector('.rideV3Scene')?.remove();
}

function mountGuard(overlay){
  installLowCostRideStyle();
  removeHeavyScene(overlay);
  requestAnimationFrame(()=>removeHeavyScene(overlay));
  setTimeout(()=>removeHeavyScene(overlay),500);
}

MOTION_EVENT_TYPES.forEach(type=>window.addEventListener(type,interceptHighFrequencyEvent,{capture:true}));
window.addEventListener('moto-ride-state',interceptRideState,{capture:true});
window.addEventListener('moto-ride-dash-opened',event=>mountGuard(event.detail?.overlay));
window.addEventListener('moto-ride-dash-rendered',event=>removeHeavyScene(event.detail?.overlay));
window.addEventListener('moto-ride-dash-closed',()=>{
  if(state.timer)clearTimeout(state.timer);
  state.timer=0;
  state.details.clear();
});

new MutationObserver(mutations=>{
  for(const mutation of mutations){
    for(const node of mutation.addedNodes){
      if(node.nodeType!==1)continue;
      const overlay=node.matches?.('#rideDashOverlay')?node:node.querySelector?.('#rideDashOverlay');
      if(overlay){mountGuard(overlay);return}
    }
  }
}).observe(document.body,{childList:true,subtree:false});

installLowCostRideStyle();
mountGuard(document.querySelector('#rideDashOverlay'));
