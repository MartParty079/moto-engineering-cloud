const ICON_SELECTOR='svg.rideXIcon';

function loadStyleOnce(href,key){
  if(document.querySelector(`link[data-${key}]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=href;
  link.dataset[key]='1';
  document.head.appendChild(link);
}

function loadRidePickerStability(){
  loadStyleOnce('/src/ride-picker-stability.css?v=1','ridePickerStability');
  if(!window.__motoRidePickerStability){
    window.__motoRidePickerStability=import('./ride-picker-stability.js?v=1').catch(error=>console.error('Ride picker stability failed to load',error));
  }
}

function loadRideV20Fixes(){
  loadStyleOnce('/src/ride-speed-cell.css?v=3','rideSpeedCell');
  loadStyleOnce('/src/ride-layout-cleanup.css?v=1','rideLayoutCleanup');
  if(!window.__motoRideSpeedCellModule){
    window.__motoRideSpeedCellModule=import('./ride-speed-cell.js?v=3').catch(error=>console.error('Adaptive speed cell failed to load',error));
  }
  if(!window.__motoLeanRuntimeV2Module){
    window.__motoLeanRuntimeV2Module=import('./ride-lean-v2.js?v=1').catch(error=>console.error('Lean runtime v2 failed to load',error));
  }
  if(!window.__motoRideLayoutCleanupModule){
    window.__motoRideLayoutCleanupModule=import('./ride-layout-cleanup.js?v=1').catch(error=>console.error('Ride layout cleanup failed to load',error));
  }
}

function loadPremiumVisibility(){
  loadStyleOnce('/src/premium-visibility.css?v=1','premiumVisibility');
  if(!window.__motoPremiumVisibilityModule){
    window.__motoPremiumVisibilityModule=import('./premium-visibility.js?v=1').catch(error=>console.error('Premium visibility controls failed to load',error));
  }
}

function boundIcon(icon){
  if(!icon||icon.dataset.rideSizeSafe==='1')return;
  icon.dataset.rideSizeSafe='1';
  icon.setAttribute('width','16');
  icon.setAttribute('height','16');
  icon.setAttribute('focusable','false');
  ['width','height','min-width','min-height','max-width','max-height','flex-basis'].forEach(property=>icon.style.setProperty(property,'16px','important'));
  icon.style.setProperty('display','block','important');
  icon.style.setProperty('flex-grow','0','important');
  icon.style.setProperty('flex-shrink','0','important');
}

function secureRideUi(root=document){
  if(root.matches?.(ICON_SELECTOR))boundIcon(root);
  root.querySelectorAll?.(ICON_SELECTOR).forEach(boundIcon);
  const strip=root.matches?.('.rideXSmartStrip')?root:root.querySelector?.('.rideXSmartStrip');
  if(strip){
    strip.setAttribute('aria-label','Ride status and quick controls');
    strip.querySelectorAll('button').forEach(button=>{if(!button.type)button.type='button';});
  }
}

const observer=new MutationObserver(mutations=>{
  for(const mutation of mutations){
    for(const node of mutation.addedNodes){
      if(node.nodeType!==1)continue;
      if(node.matches?.('#rideDashOverlay,.rideXSmartStrip,.rideXSheet')||node.querySelector?.('#rideDashOverlay,.rideXSmartStrip,.rideXSheet'))secureRideUi(node);
    }
  }
});
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('moto-ride-dash-opened',event=>secureRideUi(event.detail?.overlay||document));
window.addEventListener('moto-ride-dash-rendered',event=>secureRideUi(event.detail?.overlay||document));
loadRidePickerStability();
loadRideV20Fixes();
loadPremiumVisibility();
secureRideUi();