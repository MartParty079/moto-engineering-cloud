// Garage observers are now frame-throttled and scoped by their owning modules.
// Keep this compatibility marker so older cached modules do not reinstall a global queueMicrotask shim.
window.__motoGarageObserverGuardInstalled=true;
window.dispatchEvent(new CustomEvent('moto-garage-observer-guard-ready'));
