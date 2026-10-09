export const MAX_GPX_BYTES = 10 * 1024 * 1024;
export const MAX_GPX_POINTS = 100000;
const xmlEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const number = value => typeof value === 'string' && value.trim() ? Number(value) : NaN;
const children = (node, name) => [...node.children].filter(child => child.localName === name && child.namespaceURI === node.namespaceURI);
const text = (node, name) => children(node, name)[0]?.textContent?.trim() || '';

export function validTrackPoint(point) {
  return Number.isFinite(point?.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point?.lon) && Math.abs(point.lon) <= 180;
}
export function segmentMiles(points) {
  const rad = n => n * Math.PI / 180;
  return points.slice(1).reduce((sum, b, i) => {
    const a = points[i], q = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;
    return sum + 2 * 3958.7613 * Math.asin(Math.min(1,Math.sqrt(q)));
  }, 0);
}

export function parseGPX(source, filename = 'route.gpx') {
  if (typeof source !== 'string' || !source.trim() || new TextEncoder().encode(source).length > MAX_GPX_BYTES) throw new Error('GPX must be nonempty and at most 10 MB.');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('GPX document types and entities are not supported.');
  const document = new DOMParser().parseFromString(source, 'application/xml');
  const root = document.documentElement;
  if (document.getElementsByTagName('parsererror').length || root.localName !== 'gpx' || !['',null,'http://www.topografix.com/GPX/1/0','http://www.topografix.com/GPX/1/1'].includes(root.namespaceURI)) throw new Error('Invalid GPX document.');
  let pointCount = 0;
  const read = node => {
    if (++pointCount > MAX_GPX_POINTS) throw new Error('GPX exceeds 100,000 points.');
    const point = {lat:number(node.getAttribute('lat')),lon:number(node.getAttribute('lon')),name:text(node,'name')};
    if (!validTrackPoint(point)) throw new Error('GPX contains a missing or invalid coordinate.');
    const elevation = text(node,'ele'), time = text(node,'time');
    if (elevation) { point.ele = number(elevation); if (!Number.isFinite(point.ele)) throw new Error('GPX contains an invalid elevation.'); }
    if (time) { if (!Number.isFinite(Date.parse(time)) || !/(Z|[+-]\d\d:\d\d)$/i.test(time)) throw new Error('GPX timestamps must include a valid timezone.'); point.time = time; }
    return point;
  };
  const tracks = children(root,'trk'), routeNodes = children(root,'rte');
  // Validate both forms even when tracks are the selected geometry; keep every original byte separately.
  const trackSegments = tracks.flatMap(track => children(track,'trkseg').map(segment => children(segment,'trkpt').map(read))).filter(segment => segment.length);
  const routeSegments = routeNodes.map(route => children(route,'rtept').map(read)).filter(segment => segment.length);
  const waypoints = children(root,'wpt').map(read);
  const segments = trackSegments.length ? trackSegments : routeSegments;
  if (segments.flat().length < 2) throw new Error('GPX needs at least two track or route points.');
  let gainFeet = 0;
  for (const segment of segments) for (let i=1;i<segment.length;i++) if (Number.isFinite(segment[i].ele) && Number.isFinite(segment[i-1].ele)) gainFeet += Math.max(0,segment[i].ele-segment[i-1].ele)*3.28084;
  return {name:text(children(root,'metadata')[0] || root,'name') || text(tracks[0] || routeNodes[0] || root,'name') || filename.replace(/\.gpx$/i,''),
    kind:trackSegments.length?'track':'route',segments,waypoints,pointCount:segments.reduce((n,s)=>n+s.length,0),distanceMiles:segments.reduce((n,s)=>n+segmentMiles(s),0),gainFeet};
}

export function serializeGPX({name='Moto Mission ride',segments,waypoints=[]}) {
  if (!Array.isArray(segments) || !segments.length || segments.flat().length < 2) throw new Error('At least two valid GPS points are required for GPX export.');
  const pointXML = (point, tag) => {
    if (!validTrackPoint(point)) throw new Error('Cannot export invalid GPS coordinates.');
    if (point.time && !Number.isFinite(Date.parse(point.time))) throw new Error('Cannot export an invalid GPS timestamp.');
    return `<${tag} lat="${point.lat}" lon="${point.lon}">${Number.isFinite(point.ele)?`<ele>${point.ele}</ele>`:''}${point.time?`<time>${xmlEscape(point.time)}</time>`:''}${point.name?`<name>${xmlEscape(point.name)}</name>`:''}</${tag}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Moto Mission" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xmlEscape(name)}</name></metadata>${waypoints.map(p=>pointXML(p,'wpt')).join('')}<trk><name>${xmlEscape(name)}</name>${segments.filter(s=>s.length).map(s=>`<trkseg>${s.map(p=>pointXML(p,'trkpt')).join('')}</trkseg>`).join('')}</trk></gpx>`;
}

export function recordedRideGPX(name, rows, interruptions=[]) {
  const segments = []; let current = [], lastTime = null;
  for (const row of rows) {
    // Motion-only rows have no position; they are not fabricated GPS fixes.
    if (row.latitude == null && row.longitude == null) continue;
    const point = {lat:row.latitude,lon:row.longitude,ele:row.altitude_m,time:row.recorded_at};
    const time = Date.parse(point.time);
    if (!validTrackPoint(point) || !Number.isFinite(time) || lastTime !== null && time < lastTime) throw new Error('Recorded GPS data is invalid or out of order.');
    const resumed = lastTime !== null && interruptions.some(gap=>lastTime<=gap.from && time>=gap.to);
    // A new segment exposes a capture gap instead of drawing an invented connecting leg.
    if (lastTime !== null && (time-lastTime>30000 || resumed)) { if(current.length)segments.push(current);current=[]; }
    current.push(point);lastTime=time;
  }
  if(current.length)segments.push(current);
  return serializeGPX({name,segments});
}

export function downloadGPX(content, filename) {
  const blob = content instanceof Blob ? content : new Blob([content],{type:'application/gpx+xml'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=String(filename || 'route.gpx').replace(/[\\/:*?"<>|]/g,'-');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
