const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export function distanceMiles(points) {
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], rad = Math.PI / 180;
    const q = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
    distance += 3958.7613 * 2 * Math.asin(Math.min(1, Math.sqrt(q)));
  }
  return distance;
}
export function parseGpx(source, filename = 'Imported GPX') {
  if (source.length > 5 * 1024 * 1024) throw new Error('Choose a GPX file smaller than 5 MB.');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('GPX document types and entities are not supported.');
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'gpx') throw new Error('This is not a valid GPX file.');
  const children = (node, tag) => [...node.children].filter(child => child.localName === tag);
  const content = (node, tag) => children(node, tag)[0]?.textContent.trim() || '';
  let count = 0;
  const point = node => {
    if (++count > 50000) throw new Error('This file exceeds the 50,000-point limit.');
    const latText = node.getAttribute('lat'), lonText = node.getAttribute('lon');
    const lat = Number(latText), lon = Number(lonText);
    if (!latText?.trim() || !lonText?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('The GPX contains an invalid coordinate.');
    const raw = content(node, 'ele'), elevation = Number(raw);
    return { lat, lon, ele: raw && Number.isFinite(elevation) ? elevation : null, name: content(node, 'name').slice(0, 300) };
  };
  const root = doc.documentElement, routes = [];
  const base = filename.replace(/\.gpx$/i, '').slice(0, 200);
  for (const track of children(root, 'trk')) {
    const segments = children(track, 'trkseg');
    segments.forEach((segment, index) => {
      const points = children(segment, 'trkpt').map(point);
      if (points.length >= 2) routes.push({ name: `${content(track, 'name') || base}${segments.length > 1 ? ` · segment ${index + 1}` : ''}`.slice(0, 240), kind: 'track', points });
    });
  }
  for (const route of children(root, 'rte')) {
    const points = children(route, 'rtept').map(point);
    if (points.length >= 2) routes.push({ name: (content(route, 'name') || base).slice(0, 240), kind: 'route', points });
  }
  const waypoints = children(root, 'wpt').map(point);
  if (!routes.length && !waypoints.length) throw new Error('No tracks, routes or waypoints found. Tracks need at least two points.');
  return { routes, waypoints, filename };
}
export function routeStats(route) {
  let gain = 0, elevationPairs = 0;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1].ele, b = route.points[i].ele;
    if (Number.isFinite(a) && Number.isFinite(b)) { gain += Math.max(0, b - a); elevationPairs++; }
  }
  return { miles: distanceMiles(route.points), gainFt: elevationPairs ? Math.round(gain * 3.28084) : null, points: route.points.length };
}
export function exportGpx(route, waypoints = []) {
  const point = (p, tag) => `<${tag} lat="${p.lat}" lon="${p.lon}">${Number.isFinite(p.ele) ? `<ele>${p.ele}</ele>` : ''}${p.name ? `<name>${xml(p.name)}</name>` : ''}</${tag}>`;
  const points = route.points.map(p => point(p, route.kind === 'route' ? 'rtept' : 'trkpt')).join('');
  const body = route.kind === 'route' ? `<rte><name>${xml(route.name)}</name>${points}</rte>` : `<trk><name>${xml(route.name)}</name><trkseg>${points}</trkseg></trk>`;
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Moto Mission" xmlns="http://www.topografix.com/GPX/1/1">${waypoints.map(p => point(p, 'wpt')).join('')}${body}</gpx>`;
}

let sessionFile = null, sessionSelection = 0;
export function clearGpxSession() { sessionFile = null; sessionSelection = 0; }
export function createGpxTools(root, getMap, pauseFollow) {
  let file = sessionFile, selected = sessionSelection, drawing = null;
  const pane = root.querySelector('#mapGpxPane');
  pane.innerHTML = `<label>Import GPX<input id="gpxFile" type="file" accept=".gpx,application/gpx+xml,application/xml"></label><p class="gpxNote">Tracks, routes and waypoints · up to 5 MB. Files stay in this map session; export to keep changes.</p><p id="gpxMessage" role="status"></p><div id="gpxEditor" hidden><label>Track / route<select id="gpxSelection"></select></label><label>Name<input id="gpxName" maxlength="240"></label><p id="gpxStats"></p><div class="gpxActions"><button id="gpxView">Show on map</button><button id="gpxReverse">Reverse</button><button id="gpxConvert">Make route</button><button id="gpxExport">Export GPX</button><button id="gpxClear">Clear file</button></div><p class="gpxNote">Make route converts the selected segment to GPX route points. It preserves the line—no road snapping, turn instructions or offline map download.</p></div>`;
  const $ = id => pane.querySelector(`#${id}`);
  const message = text => { $('gpxMessage').textContent = text; };
  const current = () => file?.routes[selected];
  function clearDrawing() { if (drawing) drawing.remove(); drawing = null; }
  function show() {
    const map = getMap(); if (!map || !file) { message('Wait for the map to load.'); return; }
    clearDrawing(); pauseFollow();
    drawing = window.L.featureGroup().addTo(map);
    const route = current();
    if (route) {
      window.L.polyline(route.points.map(p => [p.lat, p.lon]), { color: route.kind === 'route' ? '#087e78' : '#e26a18', weight: 5 }).addTo(drawing);
      for (const [point, label, color] of [[route.points[0], 'Start', '#087e78'], [route.points.at(-1), 'Finish', '#b22c38']]) {
        const node = document.createElement('span'); node.textContent = label;
        window.L.circleMarker([point.lat, point.lon], { radius: 7, color: '#fff', fillColor: color, fillOpacity: 1, weight: 2 }).bindPopup(node).addTo(drawing);
      }
    }
    for (const p of file.waypoints) {
      const node = document.createElement('span'); node.textContent = p.name || 'Waypoint';
      window.L.circleMarker([p.lat, p.lon], { radius: 5, color: '#fff', fillColor: '#7451b8', fillOpacity: 1, weight: 2 }).bindPopup(node).addTo(drawing);
    }
    if (drawing.getLayers().length) map.fitBounds(drawing.getBounds(), { padding: [35, 110], maxZoom: 16 });
  }
  function render() {
    sessionFile = file; sessionSelection = selected;
    $('gpxEditor').hidden = !file;
    if (!file) return;
    const route = current();
    $('gpxSelection').replaceChildren(...file.routes.map((r, index) => new Option(`${r.name} (${r.kind})`, index)));
    $('gpxSelection').value = String(selected);
    $('gpxSelection').disabled = !route;
    $('gpxName').value = route?.name || ''; $('gpxName').disabled = !route;
    ['gpxReverse', 'gpxConvert', 'gpxExport'].forEach(id => { $(id).disabled = !route; });
    if (route) {
      const s = routeStats(route);
      $('gpxStats').textContent = `${s.miles.toFixed(2)} mi · ${s.points.toLocaleString()} points · ${s.gainFt === null ? 'elevation unavailable' : `${s.gainFt.toLocaleString()} ft ascent`} · ${file.waypoints.length} waypoints`;
      $('gpxConvert').disabled = route.kind === 'route';
    } else $('gpxStats').textContent = `${file.waypoints.length} waypoints; no track or route.`;
  }
  $('gpxFile').onchange = async event => {
    const upload = event.target.files?.[0]; if (!upload) return;
    try {
      if (upload.size > 5 * 1024 * 1024) throw new Error('Choose a GPX file smaller than 5 MB.');
      const parsed = parseGpx(await upload.text(), upload.name);
      if (!root.isConnected) return;
      file = parsed; selected = 0; render(); show(); message(`Imported ${file.routes.length} track/route segments and ${file.waypoints.length} waypoints. Segment gaps are kept separate.`);
    } catch (error) { message(error.message); }
    finally { event.target.value = ''; }
  };
  $('gpxSelection').onchange = event => { selected = Number(event.target.value); render(); show(); };
  $('gpxName').onchange = event => { if (current()) { current().name = event.target.value.trim() || 'Route'; render(); } };
  $('gpxView').onclick = () => { show(); root.querySelector('#mapToolsPanel').hidden = true; root.querySelector('#mapToolsToggle').setAttribute('aria-expanded', 'false'); };
  $('gpxReverse').onclick = () => { current().points.reverse(); render(); show(); message('Direction reversed.'); };
  $('gpxConvert').onclick = () => { const r = current(); file.routes.push({ name: `${r.name} route`, kind: 'route', points: r.points.map(p => ({ ...p })) }); selected = file.routes.length - 1; render(); show(); message('Route created. Original track kept. Export GPX to save it.'); };
  $('gpxExport').onclick = () => {
    const r = current(), url = URL.createObjectURL(new Blob([exportGpx(r, file.waypoints)], { type: 'application/gpx+xml' }));
    const link = document.createElement('a'); link.href = url; link.download = `${r.name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 100) || 'route'}.gpx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('gpxClear').onclick = () => { if (confirm('Clear this imported file? Export first to keep changes.')) { file = null; clearDrawing(); render(); message('File cleared.'); } };
  render();
  return { clearDrawing, restore: () => { if (file) show(); } };
}
