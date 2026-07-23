// Hard recording boundary for iPhone stability.
// Loaded before Ride subsystems so live recording events cannot fan out into the
// animated cockpit, weather/tools jobs, history aggregation, or multiple UI renderers.
(() => {
  if (window.__motoRecordingIsolationInstalled) return;
  window.__motoRecordingIsolationInstalled = true;

  const params = new URLSearchParams(location.search);
  const enabled = /iphone|ipod/i.test(navigator.userAgent) || params.get('forceRecordingIsolation') === '1' || params.get('e2e') === '1';
  if (!enabled) return;

  const MODE_KEY = 'motoRideExperienceModeV2';
  const modes = {
    road: ['ROAD', '#53a7ff'],
    race: ['RACE', '#ff374f'],
    enduro: ['ENDURO', '#ff9b3d'],
    adventure: ['ADV', '#dbb94c']
  };

  let isolated = false;
  let ride = {};
  let gps = {};
  let road = {};
  let tickTimer = 0;
  let renderTimer = 0;
  let lastTickAt = performance.now();
  let lastRenderAt = 0;
  let restoreDashboard = false;
  let mode = localStorage.getItem(MODE_KEY) || 'adventure';
  if (!modes[mode]) mode = 'adventure';

  const diagnostics = {
    activatedAt: 0,
    stateEvents: 0,
    gpsEvents: 0,
    roadEvents: 0,
    actionTests: 0,
    maxEventLoopLagMs: 0,
    currentEventLoopLagMs: 0,
    initialDomNodes: 0,
    currentDomNodes: 0,
    maxDomNodes: 0,
    lastStateAt: 0,
    lastGpsAt: 0,
    stopRequestedAt: 0,
    build: 'recording-isolation-v41'
  };

  const setText = (selector, value) => {
    const node = document.querySelector(selector);
    const next = String(value ?? '');
    if (node && node.textContent !== next) node.textContent = next;
  };

  function installStyles() {
    if (document.querySelector('style[data-recording-isolation]')) return;
    const style = document.createElement('style');
    style.dataset.recordingIsolation = '1';
    style.textContent = `
      html[data-recording-isolated="1"],html[data-recording-isolated="1"] body{background:#05070b!important;overflow:hidden!important}
      #motoRecordingIsolation{position:fixed;inset:0;z-index:2147483000;box-sizing:border-box;overflow:auto;background:linear-gradient(180deg,#090b0e 0,#03070e 36%,#05070d 100%);color:#f8fafc;padding:max(16px,env(safe-area-inset-top)) 14px max(22px,env(safe-area-inset-bottom));font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-overflow-scrolling:touch}
      #motoRecordingIsolation *{box-sizing:border-box}
      #motoRecordingIsolation .recShell{width:min(720px,100%);margin:0 auto;display:grid;gap:13px}
      #motoRecordingIsolation .recHeader{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:14px 15px;border:1px solid rgba(45,212,191,.35);border-radius:20px;background:#091117;box-shadow:inset 0 1px rgba(255,255,255,.04)}
      #motoRecordingIsolation .recHeader small,#motoRecordingIsolation .recLabel{display:block;color:#5eead4;font-size:10px;font-weight:900;letter-spacing:.18em}
      #motoRecordingIsolation .recHeader strong{display:block;margin-top:5px;font-size:20px;line-height:1.05}
      #motoRecordingIsolation .recLive{display:flex;align-items:center;gap:8px;color:#5eead4;font-size:11px;font-weight:900;letter-spacing:.12em}
      #motoRecordingIsolation .recLive i{width:11px;height:11px;border-radius:50%;background:#2dd4bf;box-shadow:0 0 16px rgba(45,212,191,.75)}
      #motoRecordingIsolation .recModes{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
      #motoRecordingIsolation .recModes button{min-height:47px;border:1px solid rgba(148,163,184,.22);border-radius:13px;background:#0b1018;color:#8f9bad;font:900 10px/1 system-ui;letter-spacing:.11em}
      #motoRecordingIsolation .recModes button.active{border-color:var(--mode);color:#fff;background:color-mix(in srgb,var(--mode) 20%,#0b1018);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--mode) 45%,transparent)}
      #motoRecordingIsolation .recGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      #motoRecordingIsolation .recCard{min-width:0;min-height:132px;padding:17px;border:1px solid rgba(148,163,184,.2);border-radius:19px;background:#0a0f16;display:flex;flex-direction:column;justify-content:center}
      #motoRecordingIsolation .recCard strong{display:block;margin-top:10px;font-size:48px;line-height:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #motoRecordingIsolation .recCard span{display:block;margin-top:9px;color:#aab5c4;font-size:11px;font-weight:900;letter-spacing:.13em}
      #motoRecordingIsolation .recWide{grid-column:1/-1;min-height:92px}
      #motoRecordingIsolation .recWide strong{font-size:23px;line-height:1.1}
      #motoRecordingIsolation .recHealth{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      #motoRecordingIsolation .recHealth article{padding:12px;border:1px solid rgba(148,163,184,.16);border-radius:14px;background:#080d13;min-width:0}
      #motoRecordingIsolation .recHealth small{display:block;color:#8390a3;font-size:8px;font-weight:900;letter-spacing:.13em}
      #motoRecordingIsolation .recHealth strong{display:block;margin-top:7px;font-size:15px;overflow:hidden;text-overflow:ellipsis}
      #motoRecordingIsolation .recActions{display:grid;grid-template-columns:1fr 1.4fr;gap:9px;position:sticky;bottom:0;padding-top:4px;background:linear-gradient(180deg,transparent,#05070b 35%)}
      #motoRecordingIsolation .recActions button{min-height:58px;border-radius:16px;border:1px solid rgba(148,163,184,.25);background:#101722;color:#fff;font:900 12px/1 system-ui;letter-spacing:.1em}
      #motoRecordingIsolation .recActions button.primary{border-color:#2dd4bf;background:#0f766e}
      #motoRecordingIsolation .recActions button:disabled{opacity:.55}
      #motoRecordingIsolation .recNote{margin:0;padding:0 3px;color:#8390a3;font-size:12px;line-height:1.45}
      @media(max-width:390px){#motoRecordingIsolation{padding-left:10px;padding-right:10px}#motoRecordingIsolation .recCard{min-height:116px;padding:14px}#motoRecordingIsolation .recCard strong{font-size:41px}#motoRecordingIsolation .recHealth{grid-template-columns:1fr 1fr}#motoRecordingIsolation .recModes button{font-size:9px}}
    `;
    document.head.appendChild(style);
  }

  function markup() {
    return `<main id="motoRecordingIsolation" aria-label="Active ride recording">
      <section class="recShell">
        <header class="recHeader"><div><small>GPS RECORDER · ISOLATED MODE</small><strong id="recBike">Recording ride</strong></div><div class="recLive"><i></i><span id="recLiveState">RECORDING</span></div></header>
        <nav class="recModes" aria-label="Ride mode">${Object.entries(modes).map(([id,[label,color]]) => `<button type="button" data-rec-mode="${id}" style="--mode:${color}" class="${id===mode?'active':''}">${label}</button>`).join('')}</nav>
        <div class="recGrid">
          <article class="recCard"><small class="recLabel">SPEED</small><strong id="recSpeed">0</strong><span>MPH</span></article>
          <article class="recCard"><small class="recLabel">SPEED LIMIT</small><strong id="recLimit">--</strong><span id="recLimitState">SEARCHING</span></article>
          <article class="recCard"><small class="recLabel">DISTANCE</small><strong id="recDistance">0.00</strong><span>MILES</span></article>
          <article class="recCard"><small class="recLabel">RIDE TIME</small><strong id="recTime">0:00</strong><span>ELAPSED</span></article>
          <article class="recCard recWide"><small class="recLabel">GPS STATUS</small><strong id="recGps">WAITING FOR GPS</strong><span id="recRoad">ROAD CONTEXT PAUSED FOR STABILITY</span></article>
        </div>
        <section class="recHealth" aria-label="Recorder diagnostics">
          <article><small>RECORDER HEALTH</small><strong id="recHealth">STARTING</strong></article>
          <article><small>EVENT LOOP</small><strong id="recLag">0 ms</strong></article>
          <article><small>GPS EVENTS</small><strong id="recGpsCount">0</strong></article>
          <article><small>BUFFERED</small><strong id="recBuffered">0</strong></article>
          <article><small>DOM NODES</small><strong id="recDom">0</strong></article>
          <article><small>BUILD</small><strong>v41</strong></article>
        </section>
        <p class="recNote">The animated cockpit, motion sensors, weather, fuel tools, history processing, and Adventure bridge are suspended while recording. One GPS recorder remains active. Mode changes do not stop the ride.</p>
        <div class="recActions"><button id="recActionTest" type="button">TEST CONTROLS</button><button id="recStop" class="primary" type="button">STOP & SAVE</button></div>
      </section>
    </main>`;
  }

  function fmtTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remaining = total % 60;
    return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${String(remaining).padStart(2,'0')}` : `${minutes}:${String(remaining).padStart(2,'0')}`;
  }

  function bind() {
    document.querySelectorAll('#motoRecordingIsolation [data-rec-mode]').forEach(button => {
      button.onclick = () => {
        mode = button.dataset.recMode;
        localStorage.setItem(MODE_KEY, mode);
        document.documentElement.dataset.rideMode = mode;
        document.querySelectorAll('#motoRecordingIsolation [data-rec-mode]').forEach(item => item.classList.toggle('active', item === button));
      };
    });
    const action = document.querySelector('#recActionTest');
    if (action) action.onclick = () => {
      diagnostics.actionTests += 1;
      action.textContent = `RESPONSIVE · ${diagnostics.actionTests}`;
      setTimeout(() => { if (action.isConnected) action.textContent = 'TEST CONTROLS'; }, 900);
    };
    const stop = document.querySelector('#recStop');
    if (stop) stop.onclick = async () => {
      if (stop.disabled) return;
      diagnostics.stopRequestedAt = Date.now();
      stop.disabled = true;
      stop.textContent = 'SAVING RIDE…';
      setText('#recLiveState','SAVING');
      try {
        await window.MotoRide?.stop?.();
      } catch (error) {
        console.error('Ride stop failed', error);
        stop.disabled = false;
        stop.textContent = 'RETRY STOP & SAVE';
        setText('#recLiveState','SAVE ERROR');
      }
    };
  }

  function scheduleRender(force = false) {
    if (!isolated || renderTimer) return;
    const wait = force ? 0 : Math.max(0, 1000 - (performance.now() - lastRenderAt));
    renderTimer = setTimeout(() => {
      renderTimer = 0;
      render();
    }, wait);
  }

  function render() {
    if (!isolated) return;
    lastRenderAt = performance.now();
    const speed = Math.max(0, Number(ride.speedMph ?? gps.speed ?? 0) || 0);
    const accuracyFt = Number.isFinite(Number(ride.accuracyFt)) ? Number(ride.accuracyFt) : Number.isFinite(Number(gps.accuracy)) ? Number(gps.accuracy) * 3.28084 : null;
    const gpsLocked = Boolean(ride.gpsLocked || (Number.isFinite(Number(gps.latitude)) && Number.isFinite(Number(gps.longitude))));
    const limit = Number(road.limit_mph);
    diagnostics.currentDomNodes = document.getElementsByTagName('*').length;
    diagnostics.maxDomNodes = Math.max(diagnostics.maxDomNodes, diagnostics.currentDomNodes);
    const domGrowth = diagnostics.currentDomNodes - diagnostics.initialDomNodes;
    const healthy = diagnostics.maxEventLoopLagMs < 500 && domGrowth < 80;

    setText('#recBike', ride.bikeName || 'Recording ride');
    setText('#recLiveState', ride.stopping ? 'SAVING' : 'RECORDING');
    setText('#recSpeed', Math.round(speed));
    setText('#recLimit', Number.isFinite(limit) ? Math.round(limit) : '--');
    setText('#recLimitState', Number.isFinite(limit) ? (road.cached ? 'CACHED' : 'LIVE') : 'PAUSED');
    setText('#recDistance', Number(ride.distanceMiles || 0).toFixed(2));
    setText('#recTime', ride.elapsedText || fmtTime(ride.elapsedSeconds));
    setText('#recGps', gpsLocked ? `GPS LOCK${accuracyFt !== null ? ` · ±${Math.round(accuracyFt)} FT` : ''}` : 'WAITING FOR GPS');
    setText('#recRoad', road.road ? String(road.road).toUpperCase() : 'ROAD CONTEXT PAUSED FOR STABILITY');
    setText('#recHealth', healthy ? 'STABLE' : 'CHECKING');
    setText('#recLag', `${Math.round(diagnostics.currentEventLoopLagMs)} ms`);
    setText('#recGpsCount', diagnostics.gpsEvents);
    setText('#recBuffered', ride.bufferedSamples ?? 0);
    setText('#recDom', diagnostics.currentDomNodes);
  }

  function persistDiagnostics() {
    try {
      localStorage.setItem('motoRecordingDiagnosticsV41', JSON.stringify({...diagnostics, isolated, savedAt: Date.now()}));
    } catch {}
  }

  function startHeartbeat() {
    clearInterval(tickTimer);
    lastTickAt = performance.now();
    tickTimer = setInterval(() => {
      const now = performance.now();
      const lag = Math.max(0, now - lastTickAt - 1000);
      lastTickAt = now;
      diagnostics.currentEventLoopLagMs = lag;
      diagnostics.maxEventLoopLagMs = Math.max(diagnostics.maxEventLoopLagMs, lag);
      persistDiagnostics();
      scheduleRender(true);
    }, 1000);
  }

  function activate(detail = {}) {
    ride = detail;
    diagnostics.stateEvents += 1;
    diagnostics.lastStateAt = Date.now();
    if (isolated) { scheduleRender(); return; }
    isolated = true;
    restoreDashboard = Boolean(document.querySelector('#rideDashOverlay'));
    window.__motoRecordingIsolation = true;
    document.documentElement.dataset.recordingIsolated = '1';
    diagnostics.activatedAt = Date.now();
    diagnostics.initialDomNodes = document.getElementsByTagName('*').length;
    diagnostics.maxDomNodes = diagnostics.initialDomNodes;
    installStyles();

    try { window.MotoRideDash?.close?.(false); } catch {}
    document.querySelector('#rideDashOverlay')?.remove();
    document.querySelector('#motoRecordingIsolation')?.remove();
    document.body.insertAdjacentHTML('beforeend', markup());
    bind();
    startHeartbeat();
    scheduleRender(true);
    window.dispatchEvent(new CustomEvent('moto-recording-isolation-change',{detail:{active:true,build:'v41'}}));
  }

  function deactivate() {
    if (!isolated) return;
    isolated = false;
    clearInterval(tickTimer);
    clearTimeout(renderTimer);
    tickTimer = 0;
    renderTimer = 0;
    persistDiagnostics();
    document.querySelector('#motoRecordingIsolation')?.remove();
    delete document.documentElement.dataset.recordingIsolated;
    window.__motoRecordingIsolation = false;
    window.dispatchEvent(new CustomEvent('moto-recording-isolation-change',{detail:{active:false,build:'v41'}}));
    if (restoreDashboard || !document.querySelector('#rideDashOverlay')) {
      setTimeout(() => { if (!window.MotoRide?.getState?.().active) window.MotoRideDash?.open?.(); }, 120);
    }
    restoreDashboard = false;
  }

  // These listeners are registered before Ride OS and enhancement modules. During an
  // active recording stopImmediatePropagation prevents fan-out into those systems.
  window.addEventListener('moto-ride-state', event => {
    const detail = event.detail || {};
    if (detail.active) {
      event.stopImmediatePropagation();
      activate(detail);
    } else if (isolated) {
      ride = detail;
      deactivate();
      // Allow the inactive event to continue so normal dashboards can restore.
    }
  }, true);

  window.addEventListener('moto-gps-fix', event => {
    if (!isolated) return;
    event.stopImmediatePropagation();
    gps = {...gps,...(event.detail || {})};
    diagnostics.gpsEvents += 1;
    diagnostics.lastGpsAt = Date.now();
    scheduleRender();
  }, true);

  window.addEventListener('moto-road-update', event => {
    if (!isolated) return;
    event.stopImmediatePropagation();
    road = event.detail || {};
    diagnostics.roadEvents += 1;
    scheduleRender();
  }, true);

  ['moto-motion-update','moto-tools-update','moto-weather-update','moto-position'].forEach(type => {
    window.addEventListener(type, event => { if (isolated) event.stopImmediatePropagation(); }, true);
  });

  window.addEventListener('pagehide', persistDiagnostics);
  window.MotoRecordingIsolation = {
    isActive: () => isolated,
    getDiagnostics: () => ({...diagnostics}),
    forceStart: detail => activate({active:true,bikeName:'Test Motorcycle',startMs:Date.now(),...detail}),
    forceStop: deactivate
  };
})();