// Adaptive speed-cell integration.
// Moves the speed-limit context into the primary speed gauge and colors the entire cell.
(() => {
  if (window.__motoAdaptiveSpeedCellInstalled) return;
  window.__motoAdaptiveSpeedCellInstalled = true;

  const TOLERANCE_KEY = 'motoRideSpeedToleranceV2';
  let ride = window.MotoRide?.getState?.() || window.MotoRideState || {};
  let gps = window.MotoGPS || window.__motoLatestGpsFix || {};
  let road = window.MotoRoadState || {};
  let queued = false;

  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const tolerance = () => Math.max(0,Math.min(20,Number(localStorage.getItem(TOLERANCE_KEY) || 5)));
  const speed = () => Math.max(0,Number(ride?.speedMph ?? gps?.speed ?? 0) || 0);
  const limit = () => {
    const value = Number(road?.limit_mph ?? road?.speedLimitMph ?? window.MotoRoadState?.limit_mph);
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  function compliance(){
    const current = speed();
    const maximum = limit();
    if (!maximum) return {state:'unknown',color:'#3b82f6',label:'SEARCHING',difference:null,percent:null};
    const ratio = current / maximum;
    const allowed = 1 + tolerance() / 100;
    const difference = current - maximum;
    const percent = Math.round((ratio - 1) * 100);
    if (ratio <= .9) return {state:'clear',color:'#22c55e',label:'IN RANGE',difference,percent};
    if (ratio <= 1) return {state:'near',color:'#f59e0b',label:'NEAR LIMIT',difference,percent};
    if (ratio <= allowed) return {state:'grace',color:'#f97316',label:`+${Math.max(0,percent)}% GRACE`,difference,percent};
    if (ratio <= 1.15) return {state:'over',color:'#ef4444',label:`+${Math.max(0,percent)}% OVER`,difference,percent};
    return {state:'critical',color:'#e879f9',label:`+${Math.max(0,percent)}% OVER`,difference,percent};
  }

  function ensureLimitPanel(gauge){
    let panel = gauge.querySelector('.dashInlineSpeedLimit');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'dashInlineSpeedLimit';
    panel.setAttribute('aria-live','polite');
    panel.innerHTML = '<div class="dashInlineLimitSign"><small>SPEED<br>LIMIT</small><strong>--</strong></div><div class="dashInlineLimitMeta"><b>SEARCHING</b><span>ROAD DATA</span></div>';
    gauge.appendChild(panel);
    return panel;
  }

  function update(){
    queued = false;
    const overlay = document.querySelector('#rideDashOverlay');
    if (!overlay) return;
    const widget = overlay.querySelector('.widget-speed');
    const gauge = widget?.querySelector('.dashSpeedGauge');
    if (!widget || !gauge) return;

    const currentLimit = limit();
    const status = compliance();
    const panel = ensureLimitPanel(gauge);
    const signNumber = panel.querySelector('.dashInlineLimitSign strong');
    const label = panel.querySelector('.dashInlineLimitMeta b');
    const sublabel = panel.querySelector('.dashInlineLimitMeta span');

    widget.dataset.speedState = status.state;
    widget.style.setProperty('--speed-cell-color',status.color);
    overlay.dataset.adaptiveSpeed = status.state;
    overlay.style.setProperty('--adaptive-speed',status.color);

    if (signNumber) signNumber.textContent = currentLimit ? String(Math.round(currentLimit)) : '--';
    if (label) label.textContent = status.label;
    if (sublabel) sublabel.textContent = currentLimit ? `${tolerance()}% TOLERANCE` : 'ROAD DATA';
    panel.dataset.known = currentLimit ? 'true' : 'false';
    panel.dataset.state = status.state;

    const currentSpeed = Math.round(speed());
    widget.setAttribute('aria-label',currentLimit ? `Speed ${currentSpeed} miles per hour. Speed limit ${Math.round(currentLimit)}. ${status.label}.` : `Speed ${currentSpeed} miles per hour. Searching for speed limit.`);
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