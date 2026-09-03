// Adaptive speed-cell integration.
// Keeps the primary card focused on current speed and posted limit while adaptive
// status remains a small, stable corner label.
(() => {
  if (window.__motoAdaptiveSpeedCellInstalled) return;
  window.__motoAdaptiveSpeedCellInstalled = true;

  const TOLERANCE_KEY = 'motoRideSpeedToleranceV2';
  const LIMIT_HOLD_MS = 30000;
  let ride = window.MotoRide?.getState?.() || window.MotoRideState || {};
  let gps = window.MotoGPS || window.__motoLatestGpsFix || {};
  let road = window.MotoRoadState || {};
  let queued = false;
  let lastKnownLimit = null;
  let lastKnownLimitAt = 0;

  const tolerance = () => Math.max(0,Math.min(20,Number(localStorage.getItem(TOLERANCE_KEY) || 5)));
  const speed = () => Math.max(0,Number(ride?.speedMph ?? gps?.speed ?? 0) || 0);

  function limit(){
    const value = Number(road?.limit_mph ?? road?.speedLimitMph ?? window.MotoRoadState?.limit_mph);
    if (Number.isFinite(value) && value > 0) {
      lastKnownLimit = value;
      lastKnownLimitAt = Date.now();
      return value;
    }
    if (lastKnownLimit && Date.now() - lastKnownLimitAt < LIMIT_HOLD_MS) return lastKnownLimit;
    return null;
  }

  function compliance(){
    const current = speed();
    const maximum = limit();
    if (!maximum) return {state:'unknown',color:'#3b82f6',label:'LIMIT SEARCH'};
    const ratio = current / maximum;
    const allowed = 1 + tolerance() / 100;
    if (ratio <= .9) return {state:'clear',color:'#22c55e',label:'IN RANGE'};
    if (ratio <= 1) return {state:'near',color:'#f59e0b',label:'NEAR LIMIT'};
    if (ratio <= allowed) return {state:'grace',color:'#f97316',label:'TOLERANCE'};
    if (ratio <= 1.15) return {state:'over',color:'#ef4444',label:'OVER LIMIT'};
    return {state:'critical',color:'#e879f9',label:'HIGH OVER'};
  }

  function ensureLimitUi(gauge){
    let panel = gauge.querySelector('.dashInlineSpeedLimit');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'dashInlineSpeedLimit';
      panel.innerHTML = '<div class="dashInlineLimitSign"><div class="dashInlineLimitWord">LIMIT</div><div class="dashInlineLimitNumber">--</div></div>';
      gauge.appendChild(panel);
    }

    let status = gauge.querySelector('.dashSpeedCornerStatus');
    if (!status) {
      status = document.createElement('div');
      status.className = 'dashSpeedCornerStatus';
      status.setAttribute('aria-hidden','true');
      status.textContent = 'LIMIT SEARCH';
      gauge.appendChild(status);
    }
    return {panel,status};
  }

  function setText(element,value){
    if (element && element.textContent !== value) element.textContent = value;
  }

  function update(){
    queued = false;
    const overlay = document.querySelector('#rideDashOverlay');
    if (!overlay) return;
    const widget = overlay.querySelector('.widget-speed');
    const gauge = widget?.querySelector('.dashSpeedGauge');
    if (!widget || !gauge) return;

    const currentLimit = limit();
    const adaptive = compliance();
    const {panel,status} = ensureLimitUi(gauge);
    const signNumber = panel.querySelector('.dashInlineLimitNumber');

    widget.dataset.speedState = adaptive.state;
    widget.style.setProperty('--speed-cell-color',adaptive.color);
    overlay.dataset.adaptiveSpeed = adaptive.state;
    overlay.style.setProperty('--adaptive-speed',adaptive.color);

    setText(signNumber,currentLimit ? String(Math.round(currentLimit)) : '--');
    setText(status,adaptive.label);
    panel.dataset.known = currentLimit ? 'true' : 'false';
    status.dataset.state = adaptive.state;

    const currentSpeed = Math.round(speed());
    widget.setAttribute('aria-label',currentLimit
      ? `Speed ${currentSpeed} miles per hour. Speed limit ${Math.round(currentLimit)}. ${adaptive.label}.`
      : `Speed ${currentSpeed} miles per hour. Speed limit unavailable.`);
  }

  function schedule(){
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('moto-ride-state',event => { ride = event.detail || {}; schedule(); });
  window.addEventListener('moto-gps-fix',event => { gps = event.detail || {}; schedule(); });
  window.addEventListener('moto-road-update',event => {
    road = event.detail || {};
    window.MotoRoadState = road;
    schedule();
  });
  window.addEventListener('moto-ride-dash-opened',schedule);
  window.addEventListener('moto-ride-dash-rendered',schedule);
  window.addEventListener('moto-ride-dash-refreshed',schedule);
  window.addEventListener('storage',event => { if (event.key === TOLERANCE_KEY) schedule(); });

  window.MotoAdaptiveSpeedCell = {refresh:schedule,getState:() => ({speed:speed(),limit:limit(),...compliance()})};
  schedule();
})();