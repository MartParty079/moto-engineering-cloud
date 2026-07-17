const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];

const ESTIMATED_MPH = {
  motorway: 70,
  motorway_link: 45,
  trunk: 65,
  trunk_link: 45,
  primary: 55,
  primary_link: 40,
  secondary: 45,
  secondary_link: 35,
  tertiary: 35,
  tertiary_link: 30,
  residential: 30,
  unclassified: 30,
  living_street: 15,
  service: 15
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const ALLOWED_METHODS = new Set(['GET']);
const PAID_PROVIDERS = new Set(['google', 'tomtom']);

const toRad = value => value * Math.PI / 180;
const toDeg = value => value * 180 / Math.PI;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function safeError(error) {
  if (error?.name === 'AbortError') return 'timeout';
  return String(error?.message || error || 'provider failure').slice(0, 180);
}

function parseBearer(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/i);
  return match?.[1] || null;
}

function parseLimit(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim().slice(0, 40);
  const number = Number.parseFloat(raw);
  if (!Number.isFinite(number)) return { display: raw, mph: null, raw };
  const mph = /km\/?h|kph|kmph/i.test(raw) ? number * 0.621371 : number;
  return { display: `${Math.round(mph)} mph`, mph: Math.round(mph), raw };
}

function pretty(value) {
  if (Array.isArray(value)) value = value.join(', ');
  return value ? String(value).slice(0, 120).replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) : 'Unknown';
}

function angleDifference(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(((a - b + 540) % 360) - 180);
}

function bearing(a, b) {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const deltaLon = toRad(b.lon - a.lon);
  return (toDeg(Math.atan2(
    Math.sin(deltaLon) * Math.cos(p2),
    Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(deltaLon)
  )) + 360) % 360;
}

function projectToSegment(point, a, b) {
  const mean = toRad((a.lat + b.lat + point.lat) / 3);
  const kx = 69.172 * Math.cos(mean);
  const ky = 69;
  const ax = a.lon * kx;
  const ay = a.lat * ky;
  const bx = b.lon * kx;
  const by = b.lat * ky;
  const px = point.lon * kx;
  const py = point.lat * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1) : 0;
  return {
    distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)),
    bearing: bearing(a, b)
  };
}

function bestSegment(way, point) {
  const geometry = Array.isArray(way.geometry) ? way.geometry : [];
  let best = null;
  for (let index = 1; index < geometry.length; index += 1) {
    const hit = projectToSegment(point, geometry[index - 1], geometry[index]);
    if (!best || hit.distance < best.distance) best = hit;
  }
  return best || { distance: Infinity, bearing: null };
}

function selectLimit(tags, segmentBearing, heading) {
  const forward = parseLimit(tags['maxspeed:forward']);
  const backward = parseLimit(tags['maxspeed:backward']);
  const general = parseLimit(tags.maxspeed);
  if (Number.isFinite(heading) && Number.isFinite(segmentBearing) && (forward || backward)) {
    const f = angleDifference(heading, segmentBearing);
    const b = angleDifference(heading, (segmentBearing + 180) % 360);
    if (f <= b && forward) return { limit: forward, kind: 'mapped', confidence: 'High', direction: 'forward' };
    if (backward) return { limit: backward, kind: 'mapped', confidence: 'High', direction: 'backward' };
  }
  if (general) return { limit: general, kind: 'mapped', confidence: 'High', direction: 'general' };
  const estimated = ESTIMATED_MPH[tags.highway];
  return estimated
    ? { limit: { display: `≈ ${estimated} mph`, mph: estimated, raw: null, estimated: true }, kind: 'estimated', confidence: 'Low', direction: 'road-class estimate' }
    : { limit: null, kind: 'unknown', confidence: 'Unknown', direction: 'none' };
}

async function timedFetch(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
  } finally {
    clearTimeout(timer);
  }
}

async function consume(provider, bearerToken) {
  if (!bearerToken) return { allowed: false, reason: 'Sign in required for capped providers' };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { allowed: false, reason: 'Usage service is not configured' };
  const response = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/consume_road_api_request`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({ p_provider: provider })
  }, 6000);
  if (!response.ok) return { allowed: false, reason: `Usage service ${response.status}` };
  const rows = await response.json();
  return (Array.isArray(rows) ? rows[0] : rows) || { allowed: false, reason: 'No usage status' };
}

async function googleRoad(lat, lon, prevLat, prevLon) {
  const key = process.env.GOOGLE_ROADS_API_KEY;
  if (!key) throw new Error('Google provider not configured');
  const path = Number.isFinite(prevLat) && Number.isFinite(prevLon) ? `${prevLat},${prevLon}|${lat},${lon}` : `${lat},${lon}`;
  const snapUrl = new URL('https://roads.googleapis.com/v1/snapToRoads');
  snapUrl.search = new URLSearchParams({ path, interpolate: 'false', key }).toString();
  const response = await timedFetch(snapUrl, { headers: { accept: 'application/json' } }, 9000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || `Google HTTP ${response.status}`);
  const point = data.snappedPoints?.at(-1);
  if (!point?.placeId) throw new Error('Google returned no matched road');

  let limit = null;
  const limitUrl = new URL('https://roads.googleapis.com/v1/speedLimits');
  limitUrl.search = new URLSearchParams({ placeId: point.placeId, units: 'MPH', key }).toString();
  const limitResponse = await timedFetch(limitUrl, { headers: { accept: 'application/json' } }, 7000).catch(() => null);
  if (limitResponse?.ok) {
    const limitData = await limitResponse.json().catch(() => ({}));
    if (limitData.speedLimits?.[0]) limit = parseLimit(`${limitData.speedLimits[0].speedLimit} mph`);
  }
  return { status: 'road', source: 'Google Roads', road: 'Google matched road', limit, limitKind: limit ? 'mapped' : 'unknown', confidence: 'High', direction: 'snapped path', type: 'Road', surface: 'Unknown', lanes: '—' };
}

function syntheticPrevious(lat, lon, heading) {
  const reverse = toRad((Number.isFinite(heading) ? heading : 90) + 180);
  const meters = 20;
  return {
    lat: lat + (meters / 111320) * Math.cos(reverse),
    lon: lon + (meters / (111320 * Math.max(0.2, Math.cos(toRad(lat))))) * Math.sin(reverse)
  };
}

async function tomtomRoad(lat, lon, prevLat, prevLon, heading) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) throw new Error('TomTom provider not configured');
  const previous = Number.isFinite(prevLat) && Number.isFinite(prevLon) ? { lat: prevLat, lon: prevLon } : syntheticPrevious(lat, lon, heading);
  const params = new URLSearchParams({ key, vehicleType: 'PassengerCar', measurementSystem: 'imperial', offroadMargin: '164' });
  const response = await timedFetch(`https://api.tomtom.com/snapToRoads/1?${params}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ points: [previous, { lat, lon }].map(point => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [point.lon, point.lat] }, properties: Number.isFinite(heading) ? { heading } : {} })) })
  }, 10000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detailedError?.message || data.error?.message || `TomTom HTTP ${response.status}`);
  const route = Array.isArray(data.route) ? data.route : [];
  const properties = route.at(-1)?.properties || {};
  if (!route.length) throw new Error('TomTom returned no matched route');
  const speed = properties.speedLimits?.value;
  return {
    status: 'road', source: 'TomTom Snap to Roads', road: properties.address?.roadName || 'TomTom matched road',
    limit: speed !== undefined ? parseLimit(`${speed} ${properties.speedLimits?.unit || 'mph'}`) : null,
    limitKind: speed !== undefined ? 'mapped' : 'unknown', confidence: 'High', direction: 'snapped trail',
    type: pretty(properties.roadUse || properties.frc || 'road'), surface: 'Unknown', lanes: properties.laneInfo?.numberOfLanes || '—'
  };
}

async function osmRoad(lat, lon, heading, speed) {
  const query = `[out:json][timeout:10];way(around:100,${lat},${lon})[highway];out tags geom;`;
  const errors = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const source = new URL(endpoint).hostname;
    try {
      const response = await timedFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', accept: 'application/json', 'user-agent': 'MotoMission/1.0' },
        body: new URLSearchParams({ data: query })
      }, 11000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const ways = (data.elements || []).filter(element => element.type === 'way' && element.tags?.highway);
      if (!ways.length) return { status: 'no-road', source, confidence: 'Unknown' };
      const point = { lat, lon };
      const picked = ways.map(way => {
        const segment = bestSegment(way, point);
        const difference = angleDifference(heading, segment.bearing);
        const headingPenalty = Number.isFinite(difference) && Number.isFinite(speed) && speed > 4 ? Math.min(difference, 90) / 90 * 0.035 : 0;
        return { way, segment, score: segment.distance + headingPenalty, difference };
      }).sort((a, b) => a.score - b.score)[0];
      const tags = picked.way.tags || {};
      const resolved = selectLimit(tags, picked.segment.bearing, heading);
      return { status: 'road', source: `OpenStreetMap · ${source}`, distance: picked.segment.distance, road: tags.name || tags.ref || 'Unnamed road', limit: resolved.limit, limitKind: resolved.kind, confidence: resolved.confidence, direction: resolved.direction, type: pretty(tags.highway), surface: pretty(tags.surface), lanes: tags.lanes || '—', bearing: picked.segment.bearing, headingDifference: picked.difference };
    } catch (error) {
      errors.push(`${source}: ${safeError(error)}`);
    }
  }
  throw new Error(errors.join(' · '));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!ALLOWED_METHODS.has(req.method)) {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const heading = Number(req.query.heading);
  const speed = Number(req.query.speed);
  const prevLat = Number(req.query.prevLat);
  const prevLon = Number(req.query.prevLon);
  const requested = ['auto', 'osm', 'tomtom', 'google'].includes(req.query.provider) ? req.query.provider : 'osm';
  const bearerToken = parseBearer(req.headers.authorization);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ error: 'Invalid coordinates' });
  if (req.url?.length > 2048) return res.status(414).json({ error: 'Request URI too long' });

  const order = requested === 'auto' ? ['tomtom', 'google', 'osm'] : [requested, 'osm'].filter((provider, index, array) => array.indexOf(provider) === index);
  const attempts = [];

  for (const provider of order) {
    try {
      if (provider === 'osm') return res.status(200).json({ ...(await osmRoad(lat, lon, heading, speed)), requestedProvider: requested, attempts });
      if (!PAID_PROVIDERS.has(provider)) continue;
      const configured = provider === 'google' ? Boolean(process.env.GOOGLE_ROADS_API_KEY) : Boolean(process.env.TOMTOM_API_KEY);
      if (!configured) { attempts.push(`${provider}: not configured`); continue; }
      const quota = await consume(provider, bearerToken);
      if (!quota.allowed) { attempts.push(`${provider}: ${quota.reason || 'not allowed'}`); continue; }
      const result = provider === 'google' ? await googleRoad(lat, lon, prevLat, prevLon) : await tomtomRoad(lat, lon, prevLat, prevLon, heading);
      return res.status(200).json({ ...result, requestedProvider: requested, usage: { provider, requestCount: quota.request_count, monthlyCap: quota.monthly_cap, remaining: quota.remaining }, attempts });
    } catch (error) {
      attempts.push(`${provider}: ${safeError(error)}`);
    }
  }

  return res.status(502).json({ error: 'Road lookup unavailable', details: attempts.slice(0, 4) });
}
