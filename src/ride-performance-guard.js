function installStableRideStyles(){
  if(document.querySelector('style[data-ride-performance-guard]'))return;
  const style=document.createElement('style');
  style.dataset.ridePerformanceGuard='1';
  style.textContent=`
    #rideDashOverlay .rideV3Scene{display:none!important}
    #rideDashOverlay .rideV3ModeRibbon,
    #rideDashOverlay .rideV3Hero,
    #rideDashOverlay .rideDash>header{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    #rideDashOverlay .rideV3AttitudeWorld,
    #rideDashOverlay .rideV3BikeMark{transition:none!important}
    #rideDashOverlay .rideV3Hero,
    #rideDashOverlay .rideV3ModeRibbon{contain:layout style paint}
    @media (prefers-reduced-motion:reduce){
      #rideDashOverlay *,#rideDashOverlay *::before,#rideDashOverlay *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
    }
  `;
  document.head.appendChild(style);
}

function stabilizeRideVisuals(overlay=document.querySelector('#rideDashOverlay')){
  if(!overlay?.isConnected)return;
  overlay.dataset.ridePerformance='stable';
  overlay.querySelectorAll('.rideV3Scene').forEach(scene=>scene.remove());
}

installStableRideStyles();
window.addEventListener('moto-ride-dash-opened',event=>stabilizeRideVisuals(event.detail?.overlay));
window.addEventListener('moto-ride-dash-rendered',event=>stabilizeRideVisuals(event.detail?.overlay));
window.addEventListener('moto-ride-v3-mode',()=>stabilizeRideVisuals());
stabilizeRideVisuals();
