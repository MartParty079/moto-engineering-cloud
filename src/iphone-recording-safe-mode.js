// Temporary iPhone recording-safe mode.
// Live GPS recording remains active while the complex Ride OS/dashboard DOM is removed.
(() => {
  if (window.__motoIPhoneRecordingSafeInstalled) return;
  window.__motoIPhoneRecordingSafeInstalled = true;

  const isIPhone = /iphone|ipod/i.test(navigator.userAgent);
  if (!isIPhone) return;

  let recording = Boolean(window.MotoRide?.getState?.().active);
  let ride = window.MotoRide?.getState?.() || {};
  let gps = window.MotoGPS || {};
  let road = {};
  let updateFrame = 0;
  let wasApplied = false;

  function installStyles(){
    if (document.getElementById('motoIPhoneRecordingSafeStyles')) return;
    const style = document.createElement('style');
    style.id = 'motoIPhoneRecordingSafeStyles';
    style.textContent = `
      #rideDashOverlay[data-recording-safe="1"] .rideV3Scene,
      #rideDashOverlay[data-recording-safe="1"] .rideV3ModeRibbon,
      #rideDashOverlay[data-recording-safe="1"] #rideV3Hero,
      #rideDashOverlay[data-recording-safe="1"] #dashTabs,
      #rideDashOverlay[data-recording-safe="1"] #dashPages,
      #rideDashOverlay[data-recording-safe="1"] .rideDash>footer{display:none!important}
      #rideDashOverlay[data-recording-safe="1"] .rideDash{display:flex!important;flex-direction:column!important;min-height:100%!important;overflow-y:auto!important}
      #rideDashOverlay[data-recording-safe="1"] .dashRideControl{order:2;margin:10px 12px 0!important}
      #motoRecordingSafePanel{order:3;box-sizing:border-box;margin:12px;padding:18px;border:1px solid rgba(45,212,191,.42);border-radius:22px;background:linear-gradient(145deg,rgba(8,18,23,.98),rgba(5,8,13,.98));box-shadow:inset 0 1px rgba(255,255,255,.04);color:#f7fafc}
      #motoRecordingSafePanel header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 18px;padding:0;border:0}
      #motoRecordingSafePanel header>div{display:grid;gap:3px}
      #motoRecordingSafePanel header small{font-size:.68rem;font-weight:900;letter-spacing:.18em;color:#5eead4}
      #motoRecordingSafePanel header strong{font-size:1.1rem;line-height:1.2}
      #motoRecordingSafePanel .recordingSafeDot{width:13px;height:13px;border-radius:50%;background:#2dd4bf;box-shadow:0 0 18px rgba(45,212,191,.8)}
      #motoRecordingSafePanel .recordingSafeGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      #motoRecordingSafePanel article{box-sizing:border-box;min-width:0;min-height:112px;padding:14px;border:1px solid rgba(255,255,255,.09);border-radius:17px;background:rgba(255,255,255,.025);display:flex;flex-direction:column;justify-content:center}
      #motoRecordingSafePanel article small{font-size:.65rem;font-weight:850;letter-spacing:.16em;color:#9ca3af}
      #motoRecordingSafePanel article strong{margin-top:8px;font-size:2.45rem;line-height:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #motoRecordingSafePanel article span{margin-top:7px;font-size:.72rem;font-weight:800;letter-spacing:.1em;color:#cbd5e1}
      #motoRecordingSafePanel article.recordingSafeWide{grid-column:1/-1;min-height:88px}
      #motoRecordingSafePanel article.recordingSafeWide strong{font-size:1.25rem;line-height:1.15}
      #motoRecordingSafePanel .recordingSafeNote{margin:14px 2px 0;color:#94a3b8;font-size:.76rem;line-height:1.45}
      @media(max-width:390px){#motoRecordingSafePanel{margin:9px;padding:14px}#motoRecordingSafePanel article{min-height:100px;padding:12px}#motoRecordingSafePanel article strong{font-size:2.1rem}}
    `;
    document.head.appendChild(style);
  }

  function fmtTime(seconds){
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remaining = total % 60;
    return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${String(remaining).padStart(2,'0')}` : `${minutes}:${String(remaining).padStart(2,'0')}`;
  }

  function ensurePanel(overlay){
    let panel = overlay.querySelector('#motoRecordingSafePanel');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'motoRecordingSafePanel';
    panel.setAttribute('aria-label','Live ride recording');
    panel.innerHTML = `
      <header><div><small>GPS-ONLY SAFE MODE</small><strong id="recordingSafeBike">Recording ride</strong></div><i class="recordingSafeDot" aria-hidden="true"></i></header>
      <div class="recordingSafeGrid">
        <article><small>SPEED</small><strong id="recordingSafeSpeed">0</strong><span>MPH</span></article>
        <article><small>SPEED LIMIT</small><strong id="recordingSafeLimit">--</strong><span id="recordingSafeLimitState">SEARCHING</span></article>
        <article><small>DISTANCE</small><strong id="recordingSafeDistance">0.00</strong><span>MILES</span></article>
        <article><small>RIDE TIME</small><strong id="recordingSafeTime">0:00</strong><span>ELAPSED</span></article>
        <article class="recordingSafeWide"><small>GPS STATUS</small><strong id="recordingSafeGps">WAITING FOR GPS</strong><span id="recordingSafeRoad">ROAD CONTEXT SEARCHING</span></article>
      </div>
      <p class="recordingSafeNote">iPhone motion sensors and advanced animated cockpit updates are temporarily disabled. GPS ride recording and Stop & Save remain active.</p>`;
    const control = overlay.querySelector('#dashRideControl');
    (control || overlay.querySelector('.rideDash>header'))?.insertAdjacentElement('afterend',panel);
    return panel;
  }

  function removeHeavyRideDom(overlay){
    overlay.querySelectorAll('.rideV3Scene,.rideV3ModeRibbon,#rideV3Hero').forEach(node => node.remove());
    const tabs = overlay.querySelector('#dashTabs');
    const pages = overlay.querySelector('#dashPages');
    if (tabs && tabs.childElementCount) tabs.replaceChildren();
    if (pages && pages.childElementCount) pages.replaceChildren();
  }

  function updatePanel(){
    updateFrame = 0;
    if (!recording) return;
    const overlay = document.querySelector('#rideDashOverlay');
    if (!overlay) return;
    installStyles();
    overlay.dataset.recordingSafe = '1';
    document.documentElement.dataset.iphoneRecordingSafe = '1';
    removeHeavyRideDom(overlay);
    const panel = ensurePanel(overlay);
    const speed = Math.max(0,Number(ride.speedMph ?? gps.speed ?? 0) || 0);
    const accuracyFt = Number.isFinite(Number(ride.accuracyFt)) ? Number(ride.accuracyFt) : Number.isFinite(Number(gps.accuracy)) ? Number(gps.accuracy) * 3.28084 : null;
    const gpsLocked = Boolean(ride.gpsLocked || (Number.isFinite(Number(gps.latitude)) && Number.isFinite(Number(gps.longitude))));
    panel.querySelector('#recordingSafeBike').textContent = ride.bikeName || 'Recording ride';
    panel.querySelector('#recordingSafeSpeed').textContent = String(Math.round(speed));
    panel.querySelector('#recordingSafeLimit').textContent = Number.isFinite(Number(road.limit_mph)) ? String(Math.round(Number(road.limit_mph))) : '--';
    panel.querySelector('#recordingSafeLimitState').textContent = Number.isFinite(Number(road.limit_mph)) ? (road.cached ? 'CACHED' : 'LIVE') : 'SEARCHING';
    panel.querySelector('#recordingSafeDistance').textContent = Number(ride.distanceMiles || 0).toFixed(2);
    panel.querySelector('#recordingSafeTime').textContent = ride.elapsedText || fmtTime(ride.elapsedSeconds);
    panel.querySelector('#recordingSafeGps').textContent = gpsLocked ? `GPS LOCK${accuracyFt !== null ? ` · ±${Math.round(accuracyFt)} FT` : ''}` : 'WAITING FOR GPS';
    panel.querySelector('#recordingSafeRoad').textContent = String(road.road || 'ROAD CONTEXT SEARCHING').toUpperCase();

    const status = overlay.querySelector('#dashRideStatus');
    const bike = overlay.querySelector('#dashRideBike');
    const toggle = overlay.querySelector('#dashRideToggle');
    if (status) status.textContent = gpsLocked ? 'RECORDING' : 'RECORDING · WAITING FOR GPS';
    if (bike) bike.textContent = ride.bikeName || 'Motorcycle';
    if (toggle){toggle.disabled=false;toggle.textContent='STOP & SAVE'}
    wasApplied = true;
  }

  function scheduleUpdate(){
    if (updateFrame) return;
    updateFrame = requestAnimationFrame(updatePanel);
  }

  function restoreFullDashboard(){
    delete document.documentElement.dataset.iphoneRecordingSafe;
    const overlay = document.querySelector('#rideDashOverlay');
    if (!overlay){wasApplied=false;return}
    delete overlay.dataset.recordingSafe;
    overlay.querySelector('#motoRecordingSafePanel')?.remove();
    if (wasApplied && window.MotoRideDash?.close && window.MotoRideDash?.open){
      wasApplied=false;
      window.MotoRideDash.close(false);
      requestAnimationFrame(()=>window.MotoRideDash.open());
    }
  }

  window.addEventListener('moto-ride-state',event=>{
    ride = event.detail || {};
    const next = Boolean(ride.active);
    if (next){recording=true;scheduleUpdate()}
    else if (recording){recording=false;restoreFullDashboard()}
  });
  window.addEventListener('moto-gps-fix',event=>{gps={...gps,...(event.detail||{})};if(recording)scheduleUpdate()});
  window.addEventListener('moto-road-update',event=>{road=event.detail||{};if(recording)scheduleUpdate()});
  window.addEventListener('moto-ride-dash-rendered',()=>{if(recording)scheduleUpdate()});
  window.addEventListener('moto-ride-dash-opened',()=>{if(recording)scheduleUpdate()});
  window.addEventListener('pagehide',()=>{if(updateFrame)cancelAnimationFrame(updateFrame)});

  if (recording) scheduleUpdate();
})();
