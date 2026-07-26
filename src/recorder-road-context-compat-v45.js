// Compatibility bridge for the legacy isolated recorder road and speed-limit cards.
// The dedicated v45 road service owns lookup/caching; this bridge keeps the original
// summary cards synchronized without reconnecting the old enhancement runtime.
(() => {
  if (window.__motoRoadContextCompatV45Installed) return;
  window.__motoRoadContextCompatV45Installed = true;

  const write = (selector, value) => {
    const node = document.querySelector(selector);
    const next = String(value ?? '');
    if (node && node.textContent !== next) node.textContent = next;
  };

  window.addEventListener('moto-road-update', event => {
    const detail = event.detail || {};
    const numeric = detail.limit_mph !== null && detail.limit_mph !== '' && Number.isFinite(Number(detail.limit_mph));
    if (!numeric) detail.limit_mph = undefined;

    queueMicrotask(() => {
      write('#recLimit', numeric ? Math.round(Number(detail.limit_mph)) : '--');
      write('#recLimitState', numeric ? (detail.cached ? 'CACHED' : detail.stale ? 'STALE' : 'LIVE') : (detail.offline ? 'OFFLINE' : 'SEARCHING'));
      write('#recRoad', detail.road ? String(detail.road).toUpperCase() : (detail.offline ? 'ROAD CONTEXT OFFLINE' : 'ROAD CONTEXT SEARCHING'));
    });
  }, true);
})();