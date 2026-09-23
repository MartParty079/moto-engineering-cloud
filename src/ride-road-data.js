import { roadCache, headingDifference } from './road-cache.js';
const number = value => value !== null && value !== '' && Number.isFinite(Number(value));
const text = value => typeof value === 'string' && value.trim() ? value : 'Unknown';

export function roadReadout(data) {
  if (data?.status !== 'road') return null;
  // Road-class estimates are not posted limits.
  const mph = data.limit?.mph;
  const mapped = ['mapped', 'relation'].includes(data.limitKind);
  return {
    name: text(data.road), type: text(data.type), surface: text(data.surface),
    lanes: number(data.lanes) && Number(data.lanes) > 0 ? String(data.lanes) : 'Unknown',
    limit: mapped && number(mph) && Number(mph) > 0 ? String(Math.round(Number(mph))) : '--',
    source: text(data.source), confidence: text(data.confidence),
    note: data.limitKind === 'estimated' ? 'Estimated limit withheld · follow posted signs' : 'Mapped data · follow posted signs'
  };
}

// The match belongs to the request location/time, never to its eventual arrival time.
const distance = (a, b) => !a || !b ? 0 : Math.hypot(
  (Number(a.latitude) - Number(b.latitude)) * 111320,
  (Number(a.longitude) - Number(b.longitude)) * 111320 * Math.cos(Number(a.latitude) * Math.PI / 180));
export class RoadDisplay {
  constructor() { this.match = null; }
  accept(data, point, at) { this.match = data ? { data, point: { ...point }, at } : this.match; }
  read(point, now, phase = 'ready') {
    const match = this.match;
    if (match && (now - match.at > 120000 || distance(point, match.point) > 3000)) this.match = null;
    const data = this.match?.data || null;
    const stale = Boolean(data && (phase === 'error' || phase === 'gps' || phase === 'unmatched' || now - match.at > 45000 || distance(point, match.point) > 150));
    const label = data ? stale ? 'Last known' : phase === 'loading' ? 'Updating' : data.cachedAt ? 'Cached' : '' : '';
    const status = data ? `${label ? label + ' · ' : ''}${data.note}`
      : phase === 'loading' ? 'Looking up road…' : phase === 'gps' ? 'Waiting for fresh GPS' : 'Road data unavailable';
    return { data, status, label };
  }
}

export function createRideRoadData(onChange, { requestRoad } = {}) {
  let active = false, request = null, lastLookup = -Infinity, fix = null, timer = null, receivedAt = 0;
  let lastPoint = null, cacheVersion = roadCache.version;
  let generation = 0, phase = 'gps';
  const display = new RoadDisplay();
  const publish = () => {
    const result = display.read(fix, Date.now(), phase);
    onChange(result.data, result.status, result.label);
  };
  async function lookup() {
    const cached = fix && roadCache.match(fix);
    const turned = lastPoint && number(fix?.heading) && number(lastPoint.heading) && headingDifference(Number(fix.heading), Number(lastPoint.heading)) > 40;
    const interval = turned || (fix && roadCache.nearZone(fix)) ? 5000 : cached ? 60000 : 15000;
    if (!active || !fix || request || Date.now() - receivedAt > 15000 || Date.now() - lastLookup < interval) return;
    lastLookup = Date.now();
    const requestedAt = lastLookup, version = generation, ownerVersion = roadCache.version, point = { ...fix };
    lastPoint = point;
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    phase = 'loading'; publish();
    try {
      let payload;
      if (requestRoad) payload = await requestRoad(point, controller.signal);
      else {
        const params = new URLSearchParams({ lat: point.latitude, lon: point.longitude, provider: 'osm' });
        if (number(point.heading)) params.set('heading', point.heading);
        if (number(point.speed)) params.set('speed', point.speed);
        const response = await fetch(`/api/road-info?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Road lookup unavailable');
        payload = await response.json();
      }
      if (!active || version !== generation || ownerVersion !== roadCache.version || controller.signal.aborted) return;
      const result = roadReadout(payload);
      // Commit the whole road at once. Never carry an old limit onto a newly matched road.
      roadCache.remember(payload, result, point, requestedAt);
      display.accept(result, point, requestedAt);
      phase = Date.now() - receivedAt > 15000 ? 'gps' : result ? 'ready' : 'unmatched';
      publish();
    } catch { if (active && version === generation && ownerVersion === roadCache.version) { phase = 'error'; publish(); } }
    finally { clearTimeout(timeout); if (request === controller) request = null; }
  }
  return {
    start() {
      if (cacheVersion !== roadCache.version) { display.match = null; cacheVersion = roadCache.version; }
      this.stop(); active = true; phase = 'gps'; publish();
      timer = setInterval(() => {
        if (!fix || Date.now() - receivedAt > 15000) { phase = 'gps'; publish(); return; }
        publish(); void lookup();
      }, 1000);
    },
    update(detail) {
      if (!active || !number(detail?.latitude) || !number(detail?.longitude)
        || Math.abs(Number(detail.latitude)) > 90 || Math.abs(Number(detail.longitude)) > 180) return;
      if (cacheVersion !== roadCache.version) { this.clear(); this.start(); cacheVersion = roadCache.version; }
      fix = { ...detail }; receivedAt = Date.now();
      const cached = roadCache.match(fix);
      if (cached && (!display.match || display.match.data.cachedAt || Date.now()-display.match.at>10000 || distance(fix,display.match.point)>50)) {
        display.accept({ ...cached.data, cachedAt: cached.at, note: `Cached ${new Date(cached.at).toLocaleDateString()} · follow posted signs` }, fix, Date.now());
        phase = 'ready';
      }
      publish(); void lookup();
    },
    stop() { active = false; generation++; clearInterval(timer); timer = null; request?.abort(); request = null; fix = null; lastLookup = -Infinity; },
    clear() { this.stop(); display.match = null; }
  };
}
