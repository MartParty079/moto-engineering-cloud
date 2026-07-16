const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bxqexjvwxtnlflznyqyq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_nwyH_NCP2tXE8BXf7zcDAg_dfBSm02M';

const timedFetch = async (url, options = {}, timeout = 10000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
};

const parseLimit = (value, unit = 'mph') => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const mph = /km/i.test(unit) ? number * 0.621371 : number;
  return { display: `${Math.round(mph)} mph`, mph: Math.round(mph), raw: `${value} ${unit}` };
};

async function countUsage(provider, authorization) {
  if (!authorization) return null;
  try {
    const response = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/consume_road_api_request`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ p_provider: provider })
    }, 6000);
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data) ? data[0] : data;
  } catch { return null; }
}

function syntheticPrevious(lat, lon, heading) {
  const angle = ((Number.isFinite(heading) ? heading : 90) + 180) * Math.PI / 180;
  const meters = 20;
  return {
    lat: lat + (meters / 111320) * Math.cos(angle),
    lon: lon + (meters / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)))) * Math.sin(angle)
  };
}

async function tomtom(lat, lon, prevLat, prevLon, heading) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) throw new Error('TomTom key not configured');
  const previous = Number.isFinite(prevLat) && Number.isFinite(prevLon) ? { lat: prevLat, lon: prevLon } : syntheticPrevious(lat, lon, heading);
  const fields = '{projectedPoints{type,geometry{type,coordinates},properties{routeIndex,snapResult}},route{properties{id,speedLimits{value,unit,type},address{roadName,municipality,countrySubdivision},frc,roadUse,laneInfo{numberOfLanes}}}}';
  const query = new URLSearchParams({ key, fields, vehicleType: 'PassengerCar', measurementSystem: 'imperial', offroadMargin: '164' });
  const point = (a, b) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [b, a] }, properties: Number.isFinite(heading) ? { heading } : {} });
  const response = await timedFetch(`https://api.tomtom.com/snapToRoads/1?${query}`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ points: [point(previous.lat, previous.lon), point(lat, lon)] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detailedError?.message || data.error?.message || `TomTom HTTP ${response.status}`);
  const route = Array.isArray(data.route) ? data.route : [];
  if (!route.length) throw new Error('TomTom returned no matched route');
  const projected = Array.isArray(data.projectedPoints) ? data.projectedPoints.at(-1) : null;
  const routeIndex = Number(projected?.properties?.routeIndex);
  const segment = route[Number.isFinite(routeIndex) ? Math.min(routeIndex, route.length - 1) : route.length - 1] || route.at(-1);
  const properties = segment?.properties || {};
  const speed = properties.speedLimits;
  return {
    status: 'road', source: 'TomTom Snap to Roads',
    road: properties.address?.roadName || 'TomTom matched road',
    limit: speed?.value !== undefined ? parseLimit(speed.value, speed.unit || 'mph') : null,
    confidence: 'High', type: properties.roadUse || properties.frc || 'Road',
    lanes: properties.laneInfo?.numberOfLanes || '—',
    diagnostic: `TomTom matched ${route.length} road segment${route.length === 1 ? '' : 's'}.`
  };
}

async function google(lat, lon, prevLat, prevLon, heading) {
  const key = process.env.GOOGLE_ROADS_API_KEY;
  if (!key) throw new Error('Google key not configured');
  const previous = Number.isFinite(prevLat) && Number.isFinite(prevLon) ? { lat: prevLat, lon: prevLon } : syntheticPrevious(lat, lon, heading);
  const path = `${previous.lat},${previous.lon}|${lat},${lon}`;
  const snapResponse = await timedFetch(`https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(path)}&interpolate=false&key=${encodeURIComponent(key)}`);
  const snapData = await snapResponse.json().catch(() => ({}));
  if (!snapResponse.ok || snapData.error) throw new Error(snapData.error?.message || `Google HTTP ${snapResponse.status}`);
  const point = snapData.snappedPoints?.at(-1);
  if (!point?.placeId) throw new Error('Google returned no matched road');
  let limit = null;
  try {
    const response = await timedFetch(`https://roads.googleapis.com/v1/speedLimits?placeId=${encodeURIComponent(point.placeId)}&units=MPH&key=${encodeURIComponent(key)}`, {}, 7000);
    const data = await response.json();
    if (response.ok && data.speedLimits?.[0]) limit = parseLimit(data.speedLimits[0].speedLimit, 'mph');
  } catch {}
  return { status: 'road', source: 'Google Roads', road: 'Google matched road', limit, confidence: 'High', type: 'Road', lanes: '—', diagnostic: `Google snapped a two-point GPS trail to place ID ${point.placeId}.` };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const lat = Number(req.query.lat), lon = Number(req.query.lon), heading = Number(req.query.heading), prevLat = Number(req.query.prevLat), prevLon = Number(req.query.prevLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'Invalid coordinates' });
  const requested = ['auto', 'tomtom', 'google'].includes(req.query.provider) ? req.query.provider : 'auto';
  const order = requested === 'auto' ? ['tomtom', 'google'] : [requested];
  const attempts = [];
  for (const provider of order) {
    try {
      const result = provider === 'tomtom' ? await tomtom(lat, lon, prevLat, prevLon, heading) : await google(lat, lon, prevLat, prevLon, heading);
      const usage = await countUsage(provider, req.headers.authorization);
      return res.status(200).json({ ...result, requestedProvider: requested, providerUsed: provider, usage, attempts });
    } catch (error) { attempts.push(`${provider}: ${error.name === 'AbortError' ? 'timeout' : error.message}`); }
  }
  return res.status(502).json({ error: 'Google and TomTom road lookups failed', details: attempts });
}