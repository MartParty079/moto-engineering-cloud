import { supabase } from './supabase.js';
import { createGpxTools, clearGpxSession } from './gpx.js';
import { createRideRoadData } from './ride-road-data.js';
import { roadCache } from './road-cache.js';

const MAP_STORE = 'motoSimpleMapLayer';
let map = null;
let gpsWatch = null;
const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
let marker = null;
let latestFix = null;
let searchMarker = null;
let searchRequest = null;
let lastSearchAt = 0;
let gpxTools = null;
let zoneLayer = null, zonesSignature = null;
const searchCache = new Map();

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

async function open(options = {}) {
  close();
  const overlay = document.createElement('div');
  overlay.id = 'motoMapOverlay';
  overlay.innerHTML = `<main class="mapPanel" aria-label="Map">
    <section class="mapCanvas" id="simpleMap" aria-label="Interactive map"><div class="mapLoading">Loading map…</div></section>
    <button id="mapClose" class="mapExit" aria-label="Close map">← Back</button>
    <div class="mapTools">
      <button id="mapToolsToggle" aria-expanded="false" aria-controls="mapToolsPanel">⌕ Search &amp; tools</button>
      <section id="mapToolsPanel" hidden aria-label="Map tools">
        <div class="mapToolTabs"><button id="mapSearchTab" aria-pressed="true">Search</button><button id="mapGpxTab" aria-pressed="false">GPX</button><button id="mapSettings" aria-pressed="false">Settings</button></div>
        <section id="mapGpxPane" hidden></section>
        <section id="mapSearchPane"><form id="mapSearchForm"><label>Find a place<input id="mapQuery" type="search" placeholder="City, address or place" required minlength="3" maxlength="200"></label><button class="primary" id="mapSearchSubmit">Search</button></form><p id="mapSearchStatus" role="status"></p><div id="mapSearchResults"></div><small>Search by Google Maps. No routes.</small></section>
        <section id="mapSettingsPane" hidden><label>Base map<select id="mapLayer">${Object.entries(layers).map(([id, layer]) => `<option value="${id}">${layer.label}</option>`).join('')}</select></label><label class="switchRow">Follow location<input id="mapFollow" type="checkbox" checked></label><label class="switchRow">Keep screen awake<input id="mapWake" type="checkbox"></label><p>GPS accuracy: <span id="mapGps">--</span></p><p>Speed limit source: <span id="mapLimitSource">UNKNOWN</span></p><p>Road cache stays on this device. Orange markers show observed limit changes, not exact sign locations.</p><button id="clearRoadCache" type="button">Clear saved roads</button><small>Always follow posted road signs.</small></section>
      </section>
    </div>
    <section class="mapReadout" aria-label="Driving information"><article class="mapSpeedBadge"><strong id="mapSpeed">--</strong><span>MPH</span></article><article class="mapLimitBadge" aria-label="Speed limit in miles per hour"><small>SPEED<br>LIMIT</small><strong id="mapLimit">--</strong><small id="mapLimitStatus" role="status"></small></article><span id="mapRoadSource" class="mapRoadSource"></span></section>
    <div class="mapZoom" aria-label="Map zoom"><button id="mapZoomIn" aria-label="Zoom in">+</button><button id="mapZoomOut" aria-label="Zoom out">−</button></div>
    <button id="mapCenter" class="mapLocate" aria-label="Center on my location">⌖ Locate</button>
    <button id="mapFullscreen" class="mapFullscreen">Fullscreen</button>
  </main>`;
  document.body.appendChild(overlay);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#e5ecee');
  const fullscreen = overlay.querySelector('#mapFullscreen');
  fullscreen.hidden = !document.documentElement.requestFullscreen;
  fullscreen.onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); map?.invalidateSize(); }
    catch { fullscreen.textContent = 'Fullscreen unavailable'; }
  };
  overlay.querySelector('#mapClose').onclick = close;
  overlay.querySelector('#clearRoadCache').onclick = () => { roadCache.clear(); roadTracker.clear(); roadTracker.start(); renderZones(); };
  overlay.querySelector('#mapCenter').onclick = center;
  overlay.querySelector('#mapZoomIn').onclick = () => map?.zoomIn();
  overlay.querySelector('#mapZoomOut').onclick = () => map?.zoomOut();
  const toolsPanel = overlay.querySelector('#mapToolsPanel');
  const toolsToggle = overlay.querySelector('#mapToolsToggle');
  toolsToggle.onclick = () => { toolsPanel.hidden = !toolsPanel.hidden; toolsToggle.setAttribute('aria-expanded', String(!toolsPanel.hidden)); };
  const showPane = name => {
    for (const [pane, button] of [['Search', 'mapSearchTab'], ['Gpx', 'mapGpxTab'], ['Settings', 'mapSettings']]) {
      overlay.querySelector(`#map${pane}Pane`).hidden = name !== pane;
      overlay.querySelector(`#${button}`).setAttribute('aria-pressed', String(name === pane));
    }
  };
  overlay.querySelector('#mapSettings').onclick = () => showPane('Settings');
  overlay.querySelector('#mapSearchTab').onclick = () => showPane('Search');
  overlay.querySelector('#mapGpxTab').onclick = () => showPane('Gpx');
  gpxTools = createGpxTools(overlay, () => map, () => { overlay.querySelector('#mapFollow').checked = false; });
  if (options.tab === 'gpx') { showPane('Gpx'); toolsPanel.hidden = false; toolsToggle.setAttribute('aria-expanded', 'true'); }
  overlay.querySelector('#mapSearchForm').onsubmit = event => { event.preventDefault(); void searchPlaces(overlay); };
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { toolsPanel.hidden = true; toolsToggle.setAttribute('aria-expanded', 'false'); toolsToggle.focus(); } });
  const select = overlay.querySelector('#mapLayer');
  select.value = localStorage.getItem(MAP_STORE) || 'street';
  select.onchange = () => { localStorage.setItem(MAP_STORE, select.value); setLayer(select.value); };
  overlay.querySelector('#mapWake').onchange = event => toggleWakeLock(event.target.checked);
  try {
    await ensureLeaflet();
    if (!overlay.isConnected) return;
    map = window.L.map('simpleMap', { zoomControl: false, attributionControl: true }).setView([31, -99], 6);
    map.on('dragstart', () => { overlay.querySelector('#mapFollow').checked = false; });
    setLayer(select.value);
    roadTracker.start();
    gpxTools?.restore();
    gpsWatch = navigator.geolocation?.watchPosition(position => updateFix({
      latitude: position.coords.latitude, longitude: position.coords.longitude,
      accuracy: position.coords.accuracy, heading: position.coords.heading,
      speed: numeric(position.coords.speed) ? position.coords.speed * 2.236936 : null
    }), () => { const node = document.querySelector('#mapGps'); if (node) node.textContent = 'Unavailable'; }, { enableHighAccuracy: true, timeout: 12000 });
  } catch {
    overlay.querySelector('#simpleMap').innerHTML = '<div class="mapLoading">Map unavailable. Check your connection.</div>';
  }
}

function close() { gpxTools?.clearDrawing(); gpxTools = null; searchRequest?.abort(); searchRequest = null; if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; roadTracker.stop(); void toggleWakeLock(false); map?.remove(); map = null; zoneLayer = null; zonesSignature = null; marker = null; searchMarker = null; document.querySelector('#motoMapOverlay')?.remove(); document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#ffffff'); }
function setLayer(id) { if (!map || !window.L) return; map.eachLayer(layer => { if (layer instanceof window.L.TileLayer) map.removeLayer(layer); }); const item = layers[id] || layers.street; window.L.tileLayer(item.url, { maxZoom: item.maxZoom, attribution: id === 'satellite' ? 'Tiles © Esri' : id === 'terrain' ? '© OpenStreetMap contributors · © OpenTopoMap' : '© OpenStreetMap contributors' }).addTo(map); if (marker) marker.addTo(map); }
function center() { if (map && latestFix) { document.querySelector('#mapFollow').checked = true; map.setView([latestFix.latitude, latestFix.longitude], Math.max(map.getZoom(), 16)); } }

async function searchPlaces(overlay) {
  const query = overlay.querySelector('#mapQuery').value.trim();
  const status = overlay.querySelector('#mapSearchStatus');
  const results = overlay.querySelector('#mapSearchResults');
  if (!map) { status.textContent = 'Wait for the map to load.'; return; }
  if (query.length < 3) return;
  if (Date.now() - lastSearchAt < 1500) { status.textContent = 'Please wait a moment before searching again.'; return; }
  lastSearchAt = Date.now();
  searchRequest?.abort();
  const controller = new AbortController(); searchRequest = controller;
  const timer = setTimeout(() => controller.abort(), 18000);
  const button = overlay.querySelector('#mapSearchSubmit');
  button.disabled = true; status.textContent = 'Searching…'; results.replaceChildren();
  try {
    let items = searchCache.get(query.toLowerCase());
    if (!items) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sign in to search');
      const origin = map.getCenter();
      const params = new URLSearchParams({ q: query, lat: origin.lat, lon: origin.lng });
      const response = await fetch(`/api/poi-nearby?${params}`, { signal: controller.signal, headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error('Search unavailable');
      const data = await response.json();
      if (!Array.isArray(data.places)) throw new Error('Invalid search response');
      items = data.places.filter(item => numeric(item.lat) && numeric(item.lon) && Math.abs(Number(item.lat)) <= 90 && Math.abs(Number(item.lon)) <= 180).slice(0, 5).map(item => ({ ...item, display_name: [item.name, item.address].filter(Boolean).join(' · ') }));
      if (searchCache.size >= 30) searchCache.delete(searchCache.keys().next().value);
      searchCache.set(query.toLowerCase(), items);
    }
    if (!overlay.isConnected || controller.signal.aborted) return;
    status.textContent = items.length ? 'Choose a result to view it on the map.' : 'No places found. Try a city or full address.';
    for (const item of items) {
      const result = document.createElement('button'); result.type = 'button'; result.textContent = item.display_name || 'Place';
      result.onclick = () => {
        if (!map) return;
        overlay.querySelector('#mapFollow').checked = false;
        const point = [Number(item.lat), Number(item.lon)];
        if (searchMarker) map.removeLayer(searchMarker);
        searchMarker = window.L.circleMarker(point, { radius: 10, color: '#fff', weight: 3, fillColor: '#087e78', fillOpacity: 1 }).addTo(map);
        const label = document.createElement('span'); label.textContent = item.display_name || 'Place'; searchMarker.bindPopup(label).openPopup();
        map.setView(point, 15);
        overlay.querySelector('#mapToolsPanel').hidden = true;
        overlay.querySelector('#mapToolsToggle').setAttribute('aria-expanded', 'false');
        overlay.querySelector('#mapToolsToggle').focus();
      };
      results.appendChild(result);
    }
  } catch { if (overlay.isConnected) status.textContent = 'Search unavailable. Check your connection, sign-in or Places usage allowance.'; }
  finally { clearTimeout(timer); button.disabled = false; if (searchRequest === controller) searchRequest = null; }
}

function updateFix(detail) {
  if (!numeric(detail?.latitude) || !numeric(detail?.longitude) || Math.abs(Number(detail.latitude)) > 90 || Math.abs(Number(detail.longitude)) > 180) return;
  latestFix = detail;
  const mph = numeric(detail.speed) ? Number(detail.speed) : window.MotoRide?.getState?.().speedMph;
  const speed = document.querySelector('#mapSpeed'); if (speed) speed.textContent = numeric(mph) ? String(Math.round(Number(mph))) : '--';
  const gps = document.querySelector('#mapGps'); if (gps) gps.textContent = numeric(detail.accuracy) ? `±${Math.round(Number(detail.accuracy) * 3.28084)} FT` : '--';
  if (map && window.L) { const point = [Number(detail.latitude), Number(detail.longitude)]; if (!marker) marker = window.L.circleMarker(point, { radius: 9, color: '#fff', weight: 3, fillColor: '#222', fillOpacity: 1 }).addTo(map); else marker.setLatLng(point); if (document.querySelector('#mapFollow')?.checked) map.setView(point, Math.max(map.getZoom(), 16)); }
  if (map) roadTracker.update(detail);
}

function renderZones() {
  if (!map || !window.L) return;
  const zones = roadCache.zones.filter(z => Date.now()-z.at < 30*86400000);
  const signature = JSON.stringify(zones);
  if (signature === zonesSignature) return;
  zonesSignature = signature; zoneLayer?.remove(); zoneLayer = window.L.layerGroup().addTo(map);
  for (const zone of zones) {
    const label = document.createElement('span');
    label.textContent = `Observed change: ${zone.from} → ${zone.to} mph · heading ${Math.round(zone.heading)}° · ${new Date(zone.at).toLocaleDateString()} · OpenStreetMap. Observation area, not an exact sign location.`;
    window.L.circleMarker([zone.lat,zone.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#d97706', fillOpacity: .9 }).bindPopup(label).addTo(zoneLayer);
  }
}

const roadTracker = createRideRoadData((data, status, label) => {
  const set = (id, value) => { const node = document.getElementById(id); if (node && node.textContent !== value) node.textContent = value; };
  set('mapLimit', data?.limit || '--');
  set('mapLimitStatus', label || '');
  set('mapRoadSource', data?.source?.split(' · ')[0] || 'Source unavailable');
  renderZones();
  set('mapLimitSource', data ? `${data.source} · ${status}` : status);
}, { requestRoad: async (point, signal) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (signal.aborted) throw new Error('Lookup cancelled');
  const params = new URLSearchParams({ lat: point.latitude, lon: point.longitude, provider: 'osm' });
  if (numeric(point.heading)) params.set('heading', point.heading);
  if (numeric(point.speed)) params.set('speed', point.speed);
  const response = await fetch(`/api/road-info?${params}`, { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}, signal });
  if (!response.ok) throw new Error('Road lookup failed');
  return response.json();
} });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) roadTracker.stop();
  else if (map) roadTracker.start();
});
window.addEventListener('pagehide', () => roadTracker.stop());

let wakeLock = null;
async function toggleWakeLock(enabled) { try { if (enabled) { if (!navigator.wakeLock) throw new Error('Unavailable'); wakeLock = await navigator.wakeLock.request('screen'); } else { await wakeLock?.release(); wakeLock = null; } } catch { const input = document.querySelector('#mapWake'); if (input) input.checked = false; } }
window.addEventListener('moto-gps-fix', event => updateFix(event.detail));
window.MotoMap = { open, close };
supabase.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') { clearGpxSession(); roadTracker.clear(); latestFix = null; close(); } });
