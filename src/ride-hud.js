const $ = selector => document.querySelector(selector);

let hudMounted = false;
let hudCollapsed = false;
let lastGps = null;

function text(selector, fallback = '--') {
  const value = $(selector)?.textContent?.trim();
  return value && !/^[-—]+$/.test(value) ? value : fallback;
}

function mountHud() {
  if (hudMounted || !$('#rideStop') || !$('#rideCenterBody')) return;

  const hud = document.createElement('section');
  hud.id = 'rideHud';
  hud.className = 'rideHud';
  hud.innerHTML = `
    <div class="rideHudPrimary">
      <strong id="rideHudSpeed">--</strong>
      <span>MPH</span>
    </div>
    <div class="rideHudData">
      <article class="rideHudRoad">
        <small>ROAD</small>
        <strong id="rideHudRoad">Locating road…</strong>
      </article>
      <article>
        <small>LIMIT</small>
        <strong id="rideHudLimit">--</strong>
      </article>
      <article>
        <small>WEATHER</small>
        <strong id="rideHudWeather">--</strong>
      </article>
      <article>
        <small>RANGE</small>
        <strong id="rideHudRange">--</strong>
      </article>
    </div>
    <button id="rideHudToggle" type="button" aria-label="Collapse Ride HUD">−</button>`;

  $('#rideCenterBody').insertAdjacentElement('afterbegin', hud);
  $('#rideHudToggle').onclick = () => {
    hudCollapsed = !hudCollapsed;
    hud.classList.toggle('collapsed', hudCollapsed);
    $('#rideHudToggle').textContent = hudCollapsed ? '+' : '−';
    $('#rideHudToggle').setAttribute('aria-label', hudCollapsed ? 'Expand Ride HUD' : 'Collapse Ride HUD');
  };

  hudMounted = true;
  updateHud();
}

function unmountHud() {
  $('#rideHud')?.remove();
  hudMounted = false;
  hudCollapsed = false;
}

function updateHud() {
  if (!hudMounted) return;

  const gps = window.MotoGPS || lastGps || {};
  const speed = Number.isFinite(gps.speed) ? Math.round(gps.speed) : null;
  const speedElement = $('#rideHudSpeed');
  if (speedElement) speedElement.textContent = speed ?? '--';

  const road = text('#safeRoadName', 'Locating road…');
  const limit = text('#safeRoadLimit');
  const temperature = text('#safeTemp');
  const rain = text('#safeRain');
  const range = text('#safeRange');

  const roadElement = $('#rideHudRoad');
  const limitElement = $('#rideHudLimit');
  const weatherElement = $('#rideHudWeather');
  const rangeElement = $('#rideHudRange');

  if (roadElement) roadElement.textContent = road;
  if (limitElement) limitElement.textContent = limit;
  if (weatherElement) weatherElement.textContent = temperature !== '--' || rain !== '--' ? `${temperature} · ${rain}` : '--';
  if (rangeElement) rangeElement.textContent = range;
}

window.addEventListener('moto-gps-fix', event => {
  lastGps = event.detail || null;
  updateHud();
});

setInterval(() => {
  const rideOpen = Boolean($('#rideCenterOverlay'));
  const rideLive = Boolean($('#rideStop'));

  if (rideOpen && rideLive) {
    mountHud();
    updateHud();
  } else if (hudMounted) {
    unmountHud();
  }
}, 1500);
