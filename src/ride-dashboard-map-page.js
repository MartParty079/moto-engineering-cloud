import { supabase } from './supabase.js';

const MAP_STORE = 'motoSimpleMapLayer';
let map = null;
let marker = null;
let latestFix = null;
let road = null;
let lookupTimer = 0;
let lastLookupAt = 0;

const layers = {
  street: { label: 'Street', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19 },
  terrain: { label: 'Terrain', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', maxZoom: 17 },
  satellite: { label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 19 }
};

function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; link.dataset.leaflet = '1'; document.head.appendChild(link);
    }
    const existing = document.querySelector('script[data-leaflet]');
    if (existing) { existing.addEventListener('load', () => resolve(window.L), { once: true }); return; }
    const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.dataset.leaflet = '1'; script.onload = () => resolve(window.L); script.onerror = reject; document.head.appendChild(script);
  });
}

async function open() {
  close();
  const overlay = document.createElement('div');
  overlay.id = 'motoMapOverlay';
  overlay.innerHTML = `<main class="mapPanel"><header><h1>Map</h1><button id="mapClose" aria-label="Close">Close</button></header><section class="mapToolbar"><label>Base map<select id="mapLayer">${Object.entries(layers).map(([id, layer]) => `<option value="${id}">${layer.label}</option>`).join('')}</select></label><button id="mapCenter">Center</button><button id="mapSettings">Settings</button></section><section class="mapCanvas" id="simpleMap"><div class="mapLoading">Loading map…</div></section><section class="mapReadout"><article><small>Speed</small><strong id="mapSpeed">--</strong><span>MPH</span></article><article><small>Limit</small><strong id="mapLimit">--</strong><span id="mapLimitSource">UNKNOWN</span></article><article><small>GPS</small><strong id="mapGps">--</strong><span>ACCURACY</span></article></section><dialog id="mapSettingsDialog"><form method="dialog"><div class="dialogHead"><h2>Map settings</h2><button value="cancel">×</button></div><label class="switchRow">Follow location<input id="mapFollow" type="checkbox" checked></label><label class="switchRow">Keep screen awake<input id="mapWake" type="checkbox"></label><button class="primary" value="default">Done</button></form></dialog></main>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#mapClose').onclick = close;
  overlay.querySelector('#mapCenter').onclick = center;
  overlay.querySelector('#mapSettings').onclick = () => overlay.querySelector('#mapSettingsDialog').showModal();
  const select = overlay.querySelector('#mapLayer');
  select.value = localStorage.getItem(MAP_STORE) || 'street';
  select.onchange = () => { localStorage.setItem(MAP_STORE, select.value); setLayer(select.value); };
  overlay.querySelector('#mapWake').onchange = event => toggleWakeLock(event.target.checked);
  try {
    await ensureLeaflet();
    if (!overlay.isConnected) return;
    map = window.L.map('simpleMap', { zoomControl: true, attributionControl: false }).setView([31, -99], 6);
    setLayer(select.value);
    if (latestFix) updateFix(latestFix);
    else navigator.geolocation?.getCurrentPosition(position => updateFix({ ...position.coords, timestamp: position.timestamp }), () => {}, { enableHighAccuracy: true, timeout: 12000 });
  } catch {
    overlay.querySelector('#simpleMap').innerHTML = '<div class="mapLoading">Map unavailable. Check your connection.</div>';
  }
}

function close() { map?.remove(); map = null; marker = null; document.querySelector('#motoMapOverlay')?.remove(); }
function setLayer(id) { if (!map || !window.L) return; map.eachLayer(layer => { if (layer !== marker) map.removeLayer(layer); }); const item = layers[id] || layers.street; window.L.tileLayer(item.url, { maxZoom: item.maxZoom }).addTo(map); if (marker) marker.addTo(map); }
function center() { if (map && latestFix) map.setView([latestFix.latitude, latestFix.longitude], Math.max(map.getZoom(), 16)); }

function updateFix(detail) {
  if (!Number.isFinite(Number(detail?.latitude)) || !Number.isFinite(Number(detail?.longitude))) return;
  latestFix = detail;
  const mph = Number.isFinite(Number(detail.speed)) ? Number(detail.speed) * 2.23694 : window.MotoRide?.getState?.().speedMph;
  const speed = document.querySelector('#mapSpeed'); if (speed) speed.textContent = Number.isFinite(Number(mph)) ? String(Math.round(Number(mph))) : '--';
  const gps = document.querySelector('#mapGps'); if (gps) gps.textContent = Number.isFinite(Number(detail.accuracy)) ? `±${Math.round(Number(detail.accuracy) * 3.28084)} FT` : '--';
  if (map && window.L) { const point = [Number(detail.latitude), Number(detail.longitude)]; if (!marker) marker = window.L.circleMarker(point, { radius: 9, color: '#fff', weight: 3, fillColor: '#f4512c', fillOpacity: 1 }).addTo(map); else marker.setLatLng(point); if (document.querySelector('#mapFollow')?.checked) map.setView(point, Math.max(map.getZoom(), 16)); }
  scheduleRoadLookup();
}

function scheduleRoadLookup() {
  if (!latestFix || Date.now() - lastLookupAt < 15000) return;
  clearTimeout(lookupTimer);
  lookupTimer = setTimeout(lookupRoad, 300);
}

async function lookupRoad() {
  if (!latestFix) return;
  lastLookupAt = Date.now();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const params = new URLSearchParams({ lat: latestFix.latitude, lon: latestFix.longitude, provider: 'auto' });
    const response = await fetch(`/api/road-info?${params}`, { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}, signal: AbortSignal.timeout(6500) });
    if (!response.ok) throw new Error('Road lookup failed');
    road = await response.json();
  } catch { road = null; }
  const raw = road?.limit?.mph ?? road?.limit_mph ?? road?.speedLimit;
  const limit = Number(raw);
  const node = document.querySelector('#mapLimit'); if (node) node.textContent = Number.isFinite(limit) ? String(Math.round(limit)) : '--';
  const source = document.querySelector('#mapLimitSource'); if (source) source.textContent = Number.isFinite(limit) ? String(road.source || 'LIVE').toUpperCase() : 'UNKNOWN';
}

let wakeLock = null;
async function toggleWakeLock(enabled) { try { if (enabled) wakeLock = await navigator.wakeLock?.request('screen'); else { await wakeLock?.release(); wakeLock = null; } } catch { const input = document.querySelector('#mapWake'); if (input) input.checked = false; } }
window.addEventListener('moto-gps-fix', event => updateFix(event.detail));
window.MotoMap = { open, close };
