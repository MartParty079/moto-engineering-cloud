const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
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
    <header><div><p>RIDE CENTER</p><h1>Sensors</h1></div><button id="rideClose" aria-label="Close">×</button></header>
    <section class="rideStatus"><span id="rideDot"></span><div><strong id="rideStatus">Ready</strong><small id="rideBike">Choose a motorcycle</small></div><button id="rideToggle">Start ride</button></section>
    <section class="sensorGrid" aria-label="Live ride sensors">
      <article class="speedSensor"><small>SPEED</small><strong id="sensorSpeed">--</strong><span>MPH</span></article>
      <article><small>DISTANCE</small><strong id="sensorDistance">0.00</strong><span>MI</span></article>
      <article><small>RIDE TIME</small><strong id="sensorTime">00:00:00</strong><span>H:M:S</span></article>
      <article><small>HEADING</small><strong id="sensorHeading">--</strong><span>DEGREES</span></article>
      <article><small>ALTITUDE</small><strong id="sensorAltitude">--</strong><span>FT</span></article>
      <article><small>GPS ACCURACY</small><strong id="sensorAccuracy">--</strong><span>FT</span></article>
    </section>
    <div id="rideError" class="rideError" hidden></div>
    <footer><button id="rideMap">Open map</button><button id="rideDone">Done</button></footer>
  </main>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#rideClose').onclick = close;
  overlay.querySelector('#rideDone').onclick = close;
  overlay.querySelector('#rideMap').onclick = () => { close(); window.MotoMap?.open?.(); };
  overlay.querySelector('#rideToggle').onclick = toggle;
  update(ride);
}

function close() { document.querySelector('#rideDashOverlay')?.remove(); }

async function chooseBike() {
  const bikes = window.MotoRide?.getBikes?.() || [];
  if (!bikes.length) throw new Error('Add a motorcycle in Garage first.');
  if (bikes.length === 1) return bikes[0].id;
  const options = bikes.map((bike, index) => `${index + 1}. ${bike.name}`).join('\n');
  const choice = Number(prompt(`Choose a motorcycle:\n${options}`, '1')) - 1;
  if (!bikes[choice]) throw new Error('No motorcycle selected.');
  return bikes[choice].id;
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
  value('rideStatus', busy ? 'Working…' : ride.recording ? 'Recording' : 'Ready');
  value('rideBike', ride.bikeName || 'Choose a motorcycle');
  value('rideToggle', busy ? 'Please wait' : ride.recording ? 'Stop ride' : 'Start ride');
  value('sensorSpeed', Number.isFinite(Number(ride.speedMph)) ? String(Math.round(Number(ride.speedMph))) : '--');
  value('sensorDistance', Number(ride.distanceMiles || 0).toFixed(2));
  value('sensorTime', ride.elapsedText || '00:00:00');
  value('sensorHeading', Number.isFinite(Number(latestGps?.heading ?? ride.heading)) ? `${Math.round(Number(latestGps?.heading ?? ride.heading))}°` : '--');
  value('sensorAltitude', Number.isFinite(Number(latestGps?.altitude)) ? String(Math.round(Number(latestGps.altitude) * 3.28084)) : Number.isFinite(Number(ride.altitudeFt)) ? String(Math.round(Number(ride.altitudeFt))) : '--');
  value('sensorAccuracy', Number.isFinite(Number(latestGps?.accuracy)) ? String(Math.round(Number(latestGps.accuracy) * 3.28084)) : Number.isFinite(Number(ride.accuracyFt)) ? String(Math.round(Number(ride.accuracyFt))) : '--');
  document.querySelector('#rideDot')?.classList.toggle('active', Boolean(ride.recording));
}

window.addEventListener('moto-gps-fix', event => { latestGps = event.detail; update(); });
window.addEventListener('moto-ride-state', event => update(event.detail));
window.addEventListener('moto-ride-open-request', open);
window.MotoRideDash = { open, close };
