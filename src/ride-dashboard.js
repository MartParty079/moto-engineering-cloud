const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
import { createLeanTracker } from './lean-tracker.js';
import { createRideRoadData } from './ride-road-data.js';
const roadTracker = createRideRoadData((data, status) => {
  value('rideSpeedLimit', data?.limit || '--');
  value('rideRoadName', data?.name || 'Road unavailable');
  value('rideRoadType', data?.type || '--');
  value('rideRoadSurface', data?.surface || '--');
  value('rideRoadLanes', data?.lanes || '--');
  value('rideRoadSource', data ? `${data.source} · ${data.confidence} confidence` : 'No current match');
  value('rideRoadStatus', status);
});
const leanTracker = createLeanTracker(renderLean);
let leanRideId = null;
function renderLean() {
  const lean = leanTracker.getState();
  value('sensorLean', lean.lean === null ? '--' : Math.abs(lean.lean) < .5 ? '0°' : `${Math.abs(lean.lean).toFixed(1)}° ${lean.lean < 0 ? 'L' : 'R'}`);
  value('sensorLeanMax', `L ${lean.left.toFixed(1)}° / R ${lean.right.toFixed(1)}°`);
  value('leanStatus', lean.status);
  const leanNeedle = document.querySelector('#leanNeedle');
  if (leanNeedle) { leanNeedle.style.transform = `rotate(${lean.lean ?? 0}deg)`; leanNeedle.style.opacity = lean.lean === null ? '0' : '1'; }
  const enable = document.querySelector('#leanEnable');
  if (enable) { enable.textContent = lean.enabled ? 'Disable lean' : 'Enable lean'; enable.disabled = lean.pending || (!lean.enabled && Boolean(state().recording)); }
  const calibrate = document.querySelector('#leanCalibrate');
  if (calibrate) calibrate.disabled = !lean.enabled || Boolean(state().recording);
}
let busy = false;
let latestGps = null;

function value(id, content) {
  const node = document.querySelector(`#${id}`);
  if (node && node.textContent !== content) node.textContent = content;
}

function state() { return window.MotoRide?.getState?.() || {}; }

function open() {
  close();
  const ride = state();
  const overlay = document.createElement('div');
  overlay.id = 'rideDashOverlay';
  overlay.innerHTML = `<main class="ridePanel">
    <header><div><span class="rideEyebrow">MOTO MISSION / INSTRUMENTS</span><h1>Ride center</h1></div><button id="rideClose" aria-label="Close ride center">Close</button></header>
    <section class="rideStatus"><div><strong id="rideStatus">Ready</strong><small id="rideBike">Choose a motorcycle</small></div><button id="rideToggle">Start ride</button></section>
    <label class="rideBikeField">Motorcycle<select id="rideBikeSelect"><option value="">Choose a motorcycle</option>${(window.MotoRide?.getBikes?.() || []).map(bike => `<option value="${esc(bike.id)}">${esc(bike.name)}</option>`).join('')}</select></label>
    <section id="rideRecovery" class="rideRecovery" hidden><p id="recoveryStatus"></p><button data-recover="resume">Resume</button><button data-recover="retry">Retry upload</button><button data-recover="export">Export backup</button><button data-recover="discard">Discard</button></section>
    <section class="sensorGrid" aria-label="Live ride sensors">
      <article class="speedSensor"><small>GPS SPEED</small><div class="instrumentDial"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="dialTrack" cx="100" cy="100" r="76" pathLength="100" stroke-dasharray="75 25" transform="rotate(135 100 100)"/><circle class="dialTicks" cx="100" cy="100" r="67" pathLength="100" stroke-dasharray=".5 5.75"/><text x="47" y="160">0</text><text x="100" y="43">60</text><text x="153" y="160">120</text><g id="speedNeedle" class="dialNeedle"><path d="M97 92 L100 49 L103 92 Z"/></g></svg><div class="dialValue"><strong id="sensorSpeed">--</strong><span>MPH</span></div></div></article>
      <article><small>Distance</small><strong id="sensorDistance">0.00</strong><span>MI</span></article>
      <article><small>Time</small><strong id="sensorTime">00:00:00</strong><span>H:M:S</span></article>
      <article><small>Heading</small><strong id="sensorHeading">--</strong><span>DEGREES</span></article>
      <article><small>Altitude</small><strong id="sensorAltitude">--</strong><span>FT</span></article>
      <article><small>GPS accuracy</small><strong id="sensorAccuracy">--</strong><span>FT</span></article>
      <article class="leanSensor"><small>LEAN ESTIMATE</small><div class="leanInstrument" aria-hidden="true"><span class="leanAxis">L <i></i> R</span><div id="leanNeedle"><span></span></div></div><strong id="sensorLean">--</strong><span>PHONE · EXPERIMENTAL</span></article>
      <article class="rideLimitSensor"><small>SPEED LIMIT</small><strong id="rideSpeedLimit">--</strong><span>MPH · MAPPED</span></article>
    </section>
    <section class="rideRoadData" aria-label="Road data"><div class="leanSectionHead"><h2 id="rideRoadName">Road unavailable</h2><span class="rideChip">ROAD DATA</span></div><dl><div><dt>Road type</dt><dd id="rideRoadType">--</dd></div><div><dt>Surface</dt><dd id="rideRoadSurface">--</dd></div><div><dt>Lanes</dt><dd id="rideRoadLanes">--</dd></div></dl><p id="rideRoadSource">No current match</p><p id="rideRoadStatus" role="status">Waiting for GPS</p></section>
    <section aria-label="Lean tracking">
      <div class="leanSectionHead"><h2>Lean tracking</h2><span class="rideChip">Experimental</span></div>
      <p class="leanPeaks">Session peaks <span id="sensorLeanMax">--</span></p>
      <p id="leanStatus" role="status">Lean disabled</p>
      <button id="leanEnable" type="button">Enable lean</button>
      <button id="leanCalibrate" type="button">Calibrate upright</button>
      <p class="leanHint">Calibrate while stopped and upright. Phone estimate only—not verified motorcycle lean.</p>
      <details class="leanHelp"><summary>Mounting &amp; accuracy</summary><p>Mount the phone securely, screen facing you and nearly vertical. Hold the bike upright and still. Check left/right while stationary. Vibration and cornering can distort readings. Peaks stay in this session, not ride history.</p></details>
    </section>
    <div id="rideError" class="rideError" hidden></div>
    <footer><button id="rideMap">Open map</button><button id="rideDone">Done</button></footer>
  </main>`;
  document.body.appendChild(overlay);
  roadTracker.start();
  overlay.querySelector('#rideClose').onclick = close;
  overlay.querySelector('#rideDone').onclick = close;
  overlay.querySelector('#rideMap').onclick = () => { close(); window.MotoMap?.open?.(); };
  overlay.querySelector('#rideToggle').onclick = toggle;
  overlay.querySelector('#leanEnable').onclick = () => leanTracker.getState().enabled ? leanTracker.stop() : leanTracker.enable();
  overlay.querySelector('#leanCalibrate').onclick = () => leanTracker.calibrate();
  overlay.querySelectorAll('[data-recover]').forEach(button => button.onclick = async () => {
    if (busy) return;
    const action = button.dataset.recover;
    if (action === 'discard' && !confirm('Discard this local ride? Export a backup first if needed.')) return;
    busy = true; update();
    try { await window.MotoRide[action](); }
    catch (error) { const node = overlay.querySelector('#rideError'); node.hidden = false; node.textContent = error.message; }
    finally { busy = false; update(); }
  });
  update(ride);
  renderLean();
}

function close() { roadTracker.stop(); if (!state().recording) leanTracker.stop(); document.querySelector('#rideDashOverlay')?.remove(); }

async function chooseBike() {
  const bikes = window.MotoRide?.getBikes?.() || [];
  if (!bikes.length) throw new Error('Add a motorcycle in Garage first.');
  const id = document.querySelector('#rideBikeSelect')?.value;
  if (!id) throw new Error('Choose a motorcycle first.');
  return id;
}

async function toggle() {
  if (busy) return;
  busy = true;
  update(state());
  try {
    if (state().recording) await window.MotoRide.stop();
    else await window.MotoRide.start(await chooseBike());
  } catch (error) {
    const node = document.querySelector('#rideError');
    if (node) { node.hidden = false; node.textContent = error.message; }
  } finally {
    busy = false;
    update(state());
  }
}

function update(ride = state()) {
  if (!document.querySelector('#rideDashOverlay')) return;
  document.querySelector('.ridePanel').dataset.recording = String(Boolean(ride.recording));
  const selection = document.querySelector('#rideBikeSelect');
  selection.disabled = busy || ride.recording;
  if (ride.bikeId) selection.value = ride.bikeId;
  else if (!selection.value && selection.options.length === 2) selection.selectedIndex = 1;
  const recovery = document.querySelector('#rideRecovery');
  const interrupted = ride.status === 'interrupted';
  const pending = ride.status === 'pending' || ride.status === 'stopped';
  recovery.hidden = !(interrupted || pending);
  value('recoveryStatus', interrupted ? 'An interrupted ride is saved on this device.' : 'This ride is saved locally and waiting for upload.');
  recovery.querySelector('[data-recover="resume"]').hidden = !interrupted;
  recovery.querySelector('[data-recover="retry"]').hidden = !pending;
  document.querySelectorAll('#rideDashOverlay button').forEach(button => { if (button.id === 'rideToggle' || button.dataset.recover) button.disabled = busy; });
  value('rideStatus', busy ? 'Working…' : ride.recording ? 'Recording' : 'Ready');
  value('rideBike', ride.bikeName || 'Choose a motorcycle');
  value('rideToggle', busy ? 'Please wait' : ride.recording ? 'Stop ride' : 'Start ride');
  value('sensorSpeed', numeric(ride.speedMph) ? String(Math.round(Number(ride.speedMph))) : '--');
  const speedNeedle = document.querySelector('#speedNeedle');
  if (speedNeedle) { speedNeedle.style.transform = `rotate(${-135 + Math.min(120, Math.max(0, Number(ride.speedMph) || 0)) / 120 * 270}deg)`; speedNeedle.style.opacity = numeric(ride.speedMph) ? '1' : '0'; }
  value('sensorDistance', Number(ride.distanceMiles || 0).toFixed(2));
  value('sensorTime', ride.elapsedText || '00:00:00');
  value('sensorHeading', numeric(latestGps?.heading ?? ride.heading) ? `${Math.round(Number(latestGps?.heading ?? ride.heading))}°` : '--');
  value('sensorAltitude', numeric(latestGps?.altitude) ? String(Math.round(Number(latestGps.altitude) * 3.28084)) : numeric(ride.altitudeFt) ? String(Math.round(Number(ride.altitudeFt))) : '--');
  value('sensorAccuracy', numeric(latestGps?.accuracy) ? String(Math.round(Number(latestGps.accuracy) * 3.28084)) : numeric(ride.accuracyFt) ? String(Math.round(Number(ride.accuracyFt))) : '--');
  document.querySelector('#rideDot')?.classList.toggle('active', Boolean(ride.recording));
}

window.addEventListener('moto-gps-fix', event => { latestGps = event.detail; update(); roadTracker.update(event.detail); });
window.addEventListener('moto-ride-state', event => {
  const ride = event.detail;
  if (ride.recording && ride.sessionId !== leanRideId) {
    leanRideId = ride.sessionId;
    leanTracker.resetPeaks();
  }
  if (!ride.recording && !document.querySelector('#rideDashOverlay')) leanTracker.stop();
  update(ride); renderLean();
});
window.addEventListener('pagehide', () => { leanTracker.stop(); roadTracker.stop(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) roadTracker.stop();
  else if (document.querySelector('#rideDashOverlay')) roadTracker.start();
});
window.addEventListener('moto-ride-open-request', open);
window.MotoRideDash = { open, close };
