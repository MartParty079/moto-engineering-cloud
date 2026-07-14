import { supabase } from './supabase.js';

const $ = selector => document.querySelector(selector);
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
}[character]));

let session = null;
let map = null;
let baseLayers = {};
let routeLayer = null;
let poiLayer = null;
let positionMarker = null;
let watchId = null;
let routes = [];
let activeRoute = null;
let lastPosition = null;
let pendingRoute = null;
let followPosition = true;
let lastRidePositionAt = 0;

const EARTH_RADIUS_MILES = 3958.7613;
const toRadians = value => value * Math.PI / 180;

function distance(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(q));
}

function totalDistance(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distance(points[index - 1], points[index]);
  return total;
}

function nearestOnRoute(position, points) {
  let best = { index: 0, distance: Infinity };
  points.forEach((point, index) => {
    const pointDistance = distance(position, point);
    if (pointDistance < best.distance) best = { index, distance: pointDistance };
  });
  return best;
}

async function ensureLeaflet() {
  if (window.L) return;
  await new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      stylesheet.dataset.leaflet = '1';
      document.head.appendChild(stylesheet);
    }

    const existing = document.querySelector('script[data-leaflet]');
    if (existing) {
      if (window.L) return resolve();
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.dataset.leaflet = '1';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function parseGPX(text, filename) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('Invalid GPX file');

  const readPoint = node => ({
    lat: Number(node.getAttribute('lat')),
    lon: Number(node.getAttribute('lon')),
    ele: Number(node.querySelector('ele')?.textContent),
    name: node.querySelector('name')?.textContent || null
  });

  let points = [...xml.querySelectorAll('trkpt')]
    .map(readPoint)
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  let kind = 'track';

  if (!points.length) {
    points = [...xml.querySelectorAll('rtept')]
      .map(readPoint)
      .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon));
    kind = 'route';
  }

  if (points.length < 2) throw new Error('GPX needs at least two track or route points');

  const waypoints = [...xml.querySelectorAll('wpt')]
    .map(readPoint)
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  const name = xml.querySelector('metadata > name,trk > name,rte > name')?.textContent?.trim() || filename.replace(/\.gpx$/i, '');

  let gain = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (Number.isFinite(points[index].ele) && Number.isFinite(points[index - 1].ele) && points[index].ele > points[index - 1].ele) {
      gain += (points[index].ele - points[index - 1].ele) * 3.28084;
    }
  }

  return { name, kind, points, waypoints, distance: totalDistance(points), gain };
}

function geojson(points) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map(point => [point.lon, point.lat, Number.isFinite(point.ele) ? point.ele : 0])
    }
  };
}

function simplify(points, maximum = 80) {
  if (points.length <= maximum) return points;
  const output = [];
  const step = (points.length - 1) / (maximum - 1);
  for (let index = 0; index < maximum; index += 1) output.push(points[Math.round(index * step)]);
  return output;
}

function routeGPX(route) {
  const points = simplify(route.points, 100);
  const body = points.map((point, index) => `<rtept lat="${point.lat}" lon="${point.lon}"><name>${index === 0 ? 'Start' : index === points.length - 1 ? 'Finish' : `Via ${index}`}</name>${Number.isFinite(point.ele) ? `<ele>${point.ele}</ele>` : ''}</rtept>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="MotoCloud" xmlns="http://www.topografix.com/GPX/1/1"><rte><name>${esc(route.name)} Route</name>${body}</rte></gpx>`;
}

function download(name, text) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function injectNav() {
  const nav = $('#nav');
  if (!nav || $('#adventureNav')) return;
  const button = document.createElement('button');
  button.id = 'adventureNav';
  button.innerHTML = '<span class="navIcon">△</span><span>Adventure Ride</span><em>GPX</em>';
  button.onclick = openAdventure;
  const operations = [...nav.querySelectorAll('.navGroup')].find(group => group.querySelector('.navLabel')?.textContent.trim() === 'Operations');
  (operations || nav).appendChild(button);
}

async function loadRoutes() {
  const { data } = await supabase.from('adventure_routes').select('*').order('created_at', { ascending: false });
  routes = (data || []).map(route => ({
    ...route,
    points: (route.geojson?.geometry?.coordinates || []).map(coordinate => ({ lon: coordinate[0], lat: coordinate[1], ele: coordinate[2] }))
  }));
  renderRouteList();
}

function stopTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

function destroyAdventure() {
  stopTracking();
  if (map) {
    map.off();
    map.remove();
  }
  map = null;
  baseLayers = {};
  routeLayer = null;
  poiLayer = null;
  positionMarker = null;
  pendingRoute = null;
  document.body.classList.remove('adventure-open', 'adventure-map-fullscreen');
  document.querySelector('#adventureOverlay')?.remove();
}

function openAdventure() {
  destroyAdventure();
  const overlay = document.createElement('div');
  overlay.id = 'adventureOverlay';
  overlay.innerHTML = `<section class="adventureShell"><header><div><small>ADVENTURE BIKE MODE</small><h2>Tracks, routes & stops</h2></div><button id="closeAdventure" aria-label="Close">×</button></header><div class="adventureToolbar"><label class="gpxImport">LOAD GPX<input id="gpxInput" type="file" accept=".gpx,application/gpx+xml"></label><button id="locateAdventure">◎ LOCATE</button><select id="adventurePoiType" aria-label="Nearby place type"><option value="fuel">⛽ Fuel</option><option value="food">🍔 Food</option><option value="camp">⛺ Camp</option><option value="motorcycle">🏍 Moto shops</option><option value="hospital">✚ Hospital</option><option value="parking">Ⓟ Parking</option></select><button id="findAdventurePoi">⌕ FIND</button><select id="adventureMapStyle" aria-label="Map style"><option value="street">Simple map</option><option value="satellite">Satellite</option></select><button id="advFullscreen">⛶ FULL</button></div><div class="adventureLayout"><aside id="adventureDrawer"><div id="adventureStatus">Tracking your location. Load a GPX track or find a nearby stop.</div><div id="adventureRouteList"></div></aside><button id="adventureDrawerToggle" class="adventureDrawerToggle" aria-label="Routes and status">▲</button><main><div id="adventureMap"></div><div class="adventureMapButtons"><button id="advCenter" aria-label="Center on rider">◎</button><button id="advFollow" class="active" aria-label="Follow rider">➤</button><button id="advFit" aria-label="Fit route">⌗</button></div><div id="adventureNavPanel" class="hidden"><div><small>ROUTE PROGRESS</small><strong id="advProgress">0%</strong></div><div><small>REMAINING</small><strong id="advRemaining">—</strong></div><div><small>OFF ROUTE</small><strong id="advOffRoute">—</strong></div><button id="stopAdvNav">HIDE STATS</button></div></main></div></section>`;

  document.body.appendChild(overlay);
  document.body.classList.add('adventure-open');

  $('#closeAdventure').onclick = destroyAdventure;
  $('#gpxInput').onchange = event => importGPX(event.target.files?.[0]);
  $('#locateAdventure').onclick = locate;
  $('#findAdventurePoi').onclick = findNearbyPlaces;
  $('#adventureMapStyle').onchange = event => setBase(event.target.value);
  $('#stopAdvNav').onclick = () => $('#adventureNavPanel')?.classList.add('hidden');
  $('#advCenter').onclick = () => {
    followPosition = true;
    $('#advFollow')?.classList.add('active');
    if (lastPosition) map?.setView([lastPosition.lat, lastPosition.lon], 16);
    else locate();
  };
  $('#advFollow').onclick = () => {
    followPosition = !followPosition;
    $('#advFollow').classList.toggle('active', followPosition);
  };
  $('#advFit').onclick = fitActiveRoute;
  $('#advFullscreen').onclick = toggleFullscreen;
  $('#adventureDrawerToggle').onclick = () => {
    const drawer = $('#adventureDrawer');
    const open = drawer.classList.toggle('open');
    $('#adventureDrawerToggle').textContent = open ? '▼' : '▲';
  };

  ensureLeaflet().then(initMap).catch(() => {
    $('#adventureStatus').textContent = 'Map library failed to load.';
  });
  loadRoutes();
}

function initMap() {
  const element = $('#adventureMap');
  if (!element) return;
  if (map) {
    map.off();
    map.remove();
  }

  map = L.map(element, { zoomControl: true, preferCanvas: true }).setView([31, -99], 6);
  baseLayers.street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  });
  baseLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles © Esri'
  });
  baseLayers.street.addTo(map);
  poiLayer = L.layerGroup().addTo(map);

  map.on('dragstart zoomstart', () => {
    followPosition = false;
    $('#advFollow')?.classList.remove('active');
  });

  requestAnimationFrame(() => {
    map.invalidateSize(true);
    setTimeout(() => map?.invalidateSize(true), 250);
  });

  startTracking();
  if (pendingRoute) {
    const route = pendingRoute;
    pendingRoute = null;
    selectRoute(route);
  }
}

function startTracking() {
  stopTracking();
  watchId = navigator.geolocation.watchPosition(position => {
    if (Date.now() - lastRidePositionAt < 3000) return;
    handlePosition({
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      heading: position.coords.heading,
      speed: position.coords.speed,
      accuracy: position.coords.accuracy
    });
  }, error => {
    if ($('#adventureStatus')) $('#adventureStatus').textContent = `GPS: ${error.message}`;
  }, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 20000
  });
}

function handleRidePosition(event) {
  const position = event.detail || {};
  if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) return;
  lastRidePositionAt = Date.now();
  handlePosition({
    lat: position.latitude,
    lon: position.longitude,
    heading: position.heading,
    speed: position.speed,
    accuracy: position.accuracy
  });
}

function handlePosition(position) {
  showPosition(position);
  if (followPosition && map) map.panTo([position.lat, position.lon], { animate: true, duration: 0.4 });
  updateRouteStats(position);
}

function updateRouteStats(position) {
  if (!activeRoute) return;
  const hit = nearestOnRoute(position, activeRoute.points);
  const covered = totalDistance(activeRoute.points.slice(0, hit.index + 1));
  const total = Number(activeRoute.distance_miles) || totalDistance(activeRoute.points);
  const remaining = Math.max(0, total - covered);

  $('#adventureNavPanel')?.classList.remove('hidden');
  if ($('#advProgress')) $('#advProgress').textContent = `${Math.min(100, Math.round(covered / Math.max(total, 0.001) * 100))}%`;
  if ($('#advRemaining')) $('#advRemaining').textContent = `${remaining.toFixed(1)} mi`;
  if ($('#advOffRoute')) {
    $('#advOffRoute').textContent = hit.distance < 0.05 ? 'ON TRACK' : `${Math.round(hit.distance * 5280)} ft`;
    $('#advOffRoute').classList.toggle('warn', hit.distance >= 0.1);
  }
}

function toggleFullscreen() {
  const overlay = $('#adventureOverlay');
  if (!overlay) return;
  const fallback = () => {
    document.body.classList.toggle('adventure-map-fullscreen');
    setTimeout(() => map?.invalidateSize(true), 120);
  };

  if (document.fullscreenElement) document.exitFullscreen?.().catch(fallback);
  else if (overlay.requestFullscreen) overlay.requestFullscreen().then(() => setTimeout(() => map?.invalidateSize(true), 120)).catch(fallback);
  else fallback();
}

document.addEventListener('fullscreenchange', () => setTimeout(() => map?.invalidateSize(true), 100));

function setBase(kind) {
  if (!map) return;
  Object.values(baseLayers).forEach(layer => map.removeLayer(layer));
  baseLayers[kind]?.addTo(map);
  setTimeout(() => map.invalidateSize(true), 50);
}

async function importGPX(file) {
  if (!file) return;
  try {
    const parsed = parseGPX(await file.text(), file.name);
    const payload = {
      user_id: session.user.id,
      name: parsed.name,
      source_filename: file.name,
      route_kind: parsed.kind,
      geojson: geojson(parsed.points),
      waypoints: parsed.waypoints,
      distance_miles: parsed.distance,
      elevation_gain_ft: parsed.gain
    };
    const { data, error } = await supabase.from('adventure_routes').insert(payload).select().single();
    if (error) throw error;
    routes.unshift({ ...data, points: parsed.points });
    selectRoute(routes[0]);
    renderRouteList();
  } catch (error) {
    alert(error.message || error);
  }
}

function renderRouteList() {
  const box = $('#adventureRouteList');
  if (!box) return;
  box.innerHTML = routes.length
    ? routes.map(route => `<article data-route="${route.id}" class="${activeRoute?.id === route.id ? 'active' : ''}"><div><strong>${esc(route.name)}</strong><small>${Number(route.distance_miles || 0).toFixed(1)} mi · ${route.route_kind}</small></div><div><button data-convert="${route.id}">ROUTE</button><button data-delete-route="${route.id}">×</button></div></article>`).join('')
    : '<p class="empty">No GPX tracks loaded.</p>';

  box.querySelectorAll('[data-route]').forEach(element => {
    element.onclick = event => {
      if (event.target.closest('button')) return;
      selectRoute(routes.find(route => route.id === element.dataset.route));
      $('#adventureDrawer')?.classList.remove('open');
    };
  });
  box.querySelectorAll('[data-convert]').forEach(element => {
    element.onclick = () => {
      const route = routes.find(item => item.id === element.dataset.convert);
      download(`${route.name.replace(/[^a-z0-9]+/gi, '-')}-route.gpx`, routeGPX(route));
    };
  });
  box.querySelectorAll('[data-delete-route]').forEach(element => {
    element.onclick = async () => {
      if (!confirm('Delete this saved route?')) return;
      await supabase.from('adventure_routes').delete().eq('id', element.dataset.deleteRoute);
      routes = routes.filter(route => route.id !== element.dataset.deleteRoute);
      if (activeRoute?.id === element.dataset.deleteRoute) {
        activeRoute = null;
        if (routeLayer && map) map.removeLayer(routeLayer);
        routeLayer = null;
        $('#adventureNavPanel')?.classList.add('hidden');
      }
      renderRouteList();
    };
  });
}

function selectRoute(route) {
  if (!route) return;
  if (!map) {
    pendingRoute = route;
    activeRoute = route;
    renderRouteList();
    return;
  }

  activeRoute = route;
  if (routeLayer) map.removeLayer(routeLayer);
  routeLayer = L.polyline(route.points.map(point => [point.lat, point.lon]), { weight: 6, opacity: 0.92 }).addTo(map);
  fitActiveRoute();
  $('#adventureStatus').textContent = `${route.name} · ${Number(route.distance_miles).toFixed(1)} mi · ${Math.round(Number(route.elevation_gain_ft || 0))} ft gain`;
  renderRouteList();
  if (lastPosition) updateRouteStats(lastPosition);
}

function fitActiveRoute() {
  followPosition = false;
  $('#advFollow')?.classList.remove('active');
  if (routeLayer && map) {
    map.invalidateSize(true);
    map.fitBounds(routeLayer.getBounds(), { padding: [32, 32], maxZoom: 16 });
  } else if (lastPosition && map) {
    map.setView([lastPosition.lat, lastPosition.lon], 15);
  }
}

function locate() {
  navigator.geolocation.getCurrentPosition(position => {
    followPosition = true;
    $('#advFollow')?.classList.add('active');
    handlePosition({
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      heading: position.coords.heading,
      speed: position.coords.speed,
      accuracy: position.coords.accuracy
    });
    map?.setView([position.coords.latitude, position.coords.longitude], 16);
  }, error => alert(error.message), {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 3000
  });
}

function showPosition(position) {
  lastPosition = position;
  if (!map) return;
  if (positionMarker) positionMarker.setLatLng([position.lat, position.lon]);
  else positionMarker = L.circleMarker([position.lat, position.lon], { radius: 9, weight: 3, fillOpacity: 1 }).addTo(map);
}

function currentPosition() {
  if (lastPosition) return Promise.resolve(lastPosition);
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(position => resolve({
    lat: position.coords.latitude,
    lon: position.coords.longitude
  }), reject, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 3000
  }));
}

async function findNearbyPlaces() {
  const status = $('#adventureStatus');
  const category = $('#adventurePoiType')?.value || 'fuel';
  const label = $('#adventurePoiType')?.selectedOptions?.[0]?.textContent?.replace(/^\S+\s*/, '') || 'places';

  try {
    const position = await currentPosition();
    if (status) status.textContent = `Finding nearby ${label.toLowerCase()}…`;

    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const headers = { Accept: 'application/json' };
    if (currentSession?.access_token) headers.Authorization = `Bearer ${currentSession.access_token}`;

    const params = new URLSearchParams({
      lat: String(position.lat),
      lon: String(position.lon),
      radius: '25000',
      category
    });
    const response = await fetch(`/api/poi-nearby?${params}`, { headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((data.details || []).join(' · ') || data.error || `HTTP ${response.status}`);
    if (!map || !poiLayer) throw new Error('Map is still loading');

    poiLayer.clearLayers();
    const points = [];
    for (const place of data.places || []) {
      points.push([place.lat, place.lon]);
      const details = [
        `<b>${esc(place.name)}</b>`,
        `${Number(place.distance_miles || 0).toFixed(1)} mi away`,
        place.address ? esc(place.address) : null,
        place.type ? esc(String(place.type).replaceAll('_', ' ')) : null,
        `<a href="${esc(place.map_url || `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`)}" target="_blank" rel="noopener">Route to this stop</a>`
      ].filter(Boolean).join('<br>');
      L.marker([place.lat, place.lon], { title: place.name }).bindPopup(details).addTo(poiLayer);
    }

    const usage = data.usage
      ? ` · Google ${data.usage.requestCount}/${data.usage.monthlyCap} (${data.usage.remaining} left)`
      : '';
    const fallback = data.attempts?.length ? ` · fallback: ${data.attempts.join(' / ')}` : '';
    if (status) status.textContent = `${data.places?.length || 0} ${data.label || label} · ${data.source}${usage}${fallback}`;

    if (points.length) {
      followPosition = false;
      $('#advFollow')?.classList.remove('active');
      map.fitBounds(L.latLngBounds([[position.lat, position.lon], ...points.slice(0, 12)]), { padding: [32, 32], maxZoom: 15 });
    }
  } catch (error) {
    if (status) status.textContent = `Nearby search unavailable: ${error.message || error}`;
  }
}

async function init() {
  const { data: { session: currentSession } } = await supabase.auth.getSession();
  session = currentSession;
  if (!currentSession) return;
  window.addEventListener('moto-position', handleRidePosition);
  new MutationObserver(() => queueMicrotask(injectNav)).observe(document.body, { childList: true, subtree: true });
  injectNav();
}

init();
