// Keep unrelated feature failures from being mistaken for Ride Center startup failures.
// Ride Center already handles its own startup errors inside beginRide().
function belongsToRideCenter(event) {
  const filename = String(event?.filename || '');
  const stack = String(event?.error?.stack || event?.reason?.stack || '');
  return filename.includes('/ride-center.js') || stack.includes('/ride-center.js');
}

window.addEventListener('error', event => {
  if (!belongsToRideCenter(event)) {
    event.stopImmediatePropagation();
    console.error('Isolated non-Ride Center error:', event.error || event.message);
  }
}, true);

window.addEventListener('unhandledrejection', event => {
  if (!belongsToRideCenter(event)) {
    event.stopImmediatePropagation();
    console.error('Isolated non-Ride Center rejection:', event.reason);
  }
}, true);
