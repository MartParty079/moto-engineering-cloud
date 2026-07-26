// Compatibility shim for the legacy isolated recorder speed-limit card.
// Number(null) is 0, so convert missing limits to undefined before downstream
// listeners render them. Real numeric limits are unchanged.
(() => {
  if (window.__motoRoadContextCompatV45Installed) return;
  window.__motoRoadContextCompatV45Installed = true;
  window.addEventListener('moto-road-update', event => {
    const detail = event.detail;
    if (!detail || (detail.limit_mph !== null && detail.limit_mph !== '')) return;
    detail.limit_mph = undefined;
  }, true);
})();