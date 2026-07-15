// Prevent the Garage DOM observer from recursively scheduling itself after the Garage has rendered.
// The legacy Garage observer calls queueMicrotask(() => render()) for every body mutation.
// Rendering/hiding the legacy cards creates more mutations, which can starve taps on iOS.
const nativeQueueMicrotask = window.queueMicrotask.bind(window);
window.queueMicrotask = callback => {
  try {
    const source = Function.prototype.toString.call(callback);
    if (document.querySelector('#garageIntelligence') && /\brender\s*\(\s*\)/.test(source)) return;
  } catch (_) {}
  nativeQueueMicrotask(callback);
};
