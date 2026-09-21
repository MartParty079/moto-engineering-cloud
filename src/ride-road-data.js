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

export function createRideRoadData(onChange) {
  let active = false, request = null, lastLookup = 0, fix = null, timer = null, receivedAt = 0;
  let generation = 0;
  const clear = message => onChange(null, message);
  async function lookup() {
    if (!active || !fix || request || Date.now() - receivedAt > 15000 || Date.now() - lastLookup < 15000) return;
    lastLookup = Date.now();
    const version = generation;
    const point = { ...fix };
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    clear('Looking up road…');
    try {
      const params = new URLSearchParams({ lat: point.latitude, lon: point.longitude, provider: 'osm' });
      if (number(point.heading)) params.set('heading', point.heading);
      if (number(point.speed)) params.set('speed', point.speed);
      const response = await fetch(`/api/road-info?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Road lookup unavailable');
      const result = roadReadout(await response.json());
      if (!active || version !== generation) return;
      // Discard a result if the bike moved substantially while it was loading.
      const moved = Math.hypot((Number(fix.latitude) - Number(point.latitude)) * 111320,
        (Number(fix.longitude) - Number(point.longitude)) * 111320 * Math.cos(Number(point.latitude) * Math.PI / 180));
      if (Date.now() - receivedAt > 15000 || moved > 150) { clear('Road data needs a fresh match'); return; }
      onChange(result, result ? result.note : 'No mapped road found');
    } catch { if (active && version === generation) clear('Road data unavailable'); }
    finally { clearTimeout(timeout); if (request === controller) request = null; }
  }
  return {
    start() {
      this.stop(); active = true; clear('Waiting for GPS');
      timer = setInterval(() => {
        if (!fix || Date.now() - receivedAt > 15000) { clear('Waiting for fresh GPS'); return; }
        void lookup();
      }, 1000);
    },
    update(detail) {
      if (!active || !number(detail?.latitude) || !number(detail?.longitude)
        || Math.abs(Number(detail.latitude)) > 90 || Math.abs(Number(detail.longitude)) > 180) return;
      fix = detail; receivedAt = Date.now(); void lookup();
    },
    stop() { active = false; generation++; clearInterval(timer); timer = null; request?.abort(); request = null; fix = null; lastLookup = 0; }
  };
}
