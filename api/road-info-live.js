const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const timedFetch = async (url, options = {}, timeout = 10000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
  } finally {
    clearTimeout(timer);
  }
};

const parseLimit = (value, unit = 'mph') => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const mph = /km/i.test(unit) ? number * 0.621371 : number;
  return { display: `${Math.round(mph)} mph`, mph: Math.round(mph), raw: `${value} ${unit}` };
};

function bearerToken(value) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(String(value || '').trim());
  return match?.[1] || null;
}

async function consumeUsage(provider, authorization) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { allowed: false, status: 503, reason: 'Usage counter is not configured' };
  }
  if (!bearerToken(authorization)) {
    return { allowed: false, status: 401, reason: 'Sign in required for paid providers' };
  }

  try {
    const response = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/consume_road_api_request`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: authorization,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({ p_provider: provider })
    }, 6000);

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { allowed: false, status: response.status, reason: `Usage counter rejected request (${response.status})` };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.allowed !== true) {
      return {
        allowed: false,
        status: 429,
        reason: row ? 'Monthly provider cap reached' : 'Usage counter returned no status',
        request_count: row?.request_count ?? 0,
        monthly_cap: row?.monthly_cap ?? 0,
        remaining: row?.remaining ?? 0
      };
    }

    return row;
  } catch (error) {
    return {
      allowed: false,
      status: 503,
      reason: error?.name === 'AbortError' ? 'Usage counter timed out' : 'Usage counter unavailable'
    };
  }
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
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
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
    status: 'road',
    source: 'TomTom Snap to Roads',
    road: properties.address?.roadName || 'TomTom matched road',
    limit: speed?.value !== undefined ? parseLimit(speed.value, speed.unit || 'mph') : null,
    confidence: 'High',
    type: properties.roadUse || properties.frc || 'Road',
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
  return {
    status: 'road',
    source: 'Google Roads',
    road: 'Google matched road',
    limit,
    confidence: 'High',
    type: 'Road',
    lanes: '—',
    diagnostic: 'Google matched the current GPS trail.'
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Allow', 'GET');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const heading = Number(req.query.heading);
  const prevLat = Number(req.query.prevLat);
  const prevLon = Number(req.query.prevLon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  const requested = ['auto', 'tomtom', 'google'].includes(req.query.provider) ? req.query.provider : 'auto';
  const order = requested === 'auto' ? ['tomtom', 'google'] : [requested];
  const attempts = [];

  for (const provider of order) {
    const keyPresent = provider === 'tomtom' ? Boolean(process.env.TOMTOM_API_KEY) : Boolean(process.env.GOOGLE_ROADS_API_KEY);
    if (!keyPresent) {
      attempts.push(`${provider}: key not configured`);
      continue;
    }

    const usage = await consumeUsage(provider, req.headers.authorization);
    if (!usage.allowed) {
      attempts.push(`${provider}: ${usage.reason}`);
      if (requested !== 'auto') {
        return res.status(usage.status || 503).json({
          error: usage.reason,
          provider,
          usage: {
            requestCount: usage.request_count ?? 0,
            monthlyCap: usage.monthly_cap ?? 0,
            remaining: usage.remaining ?? 0
          }
        });
      }
      continue;
    }

    try {
      const result = provider === 'tomtom'
        ? await tomtom(lat, lon, prevLat, prevLon, heading)
        : await google(lat, lon, prevLat, prevLon, heading);

      return res.status(200).json({
        ...result,
        requestedProvider: requested,
        providerUsed: provider,
        usage: {
          provider,
          requestCount: usage.request_count,
          monthlyCap: usage.monthly_cap,
          remaining: usage.remaining
        },
        attempts
      });
    } catch (error) {
      attempts.push(`${provider}: ${error?.name === 'AbortError' ? 'timeout' : String(error?.message || error).slice(0, 160)}`);
    }
  }

  return res.status(502).json({ error: 'Google and TomTom road lookups failed', details: attempts });
}
