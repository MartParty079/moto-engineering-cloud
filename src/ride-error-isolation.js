// Safe-mode compatibility layer for older cached HTML shells.
// It runs before Weather and Ride Tools and removes the legacy #rideStop hook
// so those optional modules cannot attach to the minimal GPS logger.

function isolateSafeRideCenter(){
  const overlay=document.querySelector('#rideCenterOverlay');
  const stop=document.querySelector('#rideStop');
  if(!overlay||!stop) return;
  const safeMode=overlay.textContent.includes('SAFE MODE')||overlay.textContent.includes('GPS RIDE LOGGER');
  if(!safeMode) return;
  stop.id='coreRideStop';
  overlay.dataset.rideSafeMode='true';
}

const observer=new MutationObserver(isolateSafeRideCenter);
observer.observe(document.body,{childList:true,subtree:true});
isolateSafeRideCenter();
