const ICON_SELECTOR='svg.rideXIcon';

function loadRidePickerStability(){
  if(!document.querySelector('link[data-ride-picker-stability]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/src/ride-picker-stability.css?v=1';
    link.dataset.ridePickerStability='1';
    document.head.appendChild(link);
  }
  if(!window.__motoRidePickerStability){
    window.__motoRidePickerStability=import('./ride-picker-stability.js?v=1').catch(error=>console.error('Ride picker stability failed to load',error));
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
secureRideUi();