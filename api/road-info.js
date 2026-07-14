const ENDPOINTS = [
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bxqexjvwxtnlflznyqyq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_nwyH_NCP2tXE8BXf7zcDAg_dfBSm02M';

const toRad = value => value * Math.PI / 180;
const toDeg = value => value * 180 / Math.PI;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function miles(a, b) {
  const radius = 3958.7613;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(q));
}

function pretty(value) {
  if (Array.isArray(value)) value = value.join(', ');
  return value ? String(value).replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) : 'Unknown';
}

function parseLimit(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  const number = Number.parseFloat(raw);
  if (!Number.isFinite(number)) return { display: raw, mph: null, raw };
  const mph = /km\/?h|kph|kmph/i.test(raw) ? number * 0.621371 : number;
  return { display: `${Math.round(mph)} mph`, mph: Math.round(mph), raw };
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
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { distance: Math.hypot(px - x, py - y), bearing: bearing(a, b) };
}

function bestSegment(way, point) {
  const geometry = Array.isArray(way.geometry) ? way.geometry : [];
  let best = null;
  for (let index = 1; index < geometry.length; index += 1) {
    const hit = projectToSegment(point, geometry[index - 1], geometry[index]);
    if (!best || hit.distance < best.distance) best = hit;
  }
  if (best) return best;
  const center = way.center;
  return { distance: center ? miles(point, { lat: center.lat, lon: center.lon }) : Infinity, bearing: null };
}

function estimateLimit(type) {
  const mph = ESTIMATED_MPH[type];
  return mph ? { display: `≈ ${mph} mph`, mph, raw: null, estimated: true } : null;
}

function selectLimit(tags, segmentBearing, heading, relations = []) {
  const forward = parseLimit(tags['maxspeed:forward']);
  const backward = parseLimit(tags['maxspeed:backward']);
  const general = parseLimit(tags.maxspeed);
  let chosen = null;
  let direction = 'general';

  if (Number.isFinite(heading) && Number.isFinite(segmentBearing) && (forward || backward)) {
    const forwardDifference = angleDifference(heading, segmentBearing);
    const backwardDifference = angleDifference(heading, (segmentBearing + 180) % 360);
    if (forwardDifference <= backwardDifference && forward) {
      chosen = forward;
      direction = 'forward';
    } else if (backward) {
      chosen = backward;
      direction = 'backward';
    } else if (forward) {
      chosen = forward;
      direction = 'forward';
    }
  }

  if (!chosen && general) chosen = general;
  if (chosen) return { limit: chosen, kind: 'mapped', confidence: 'High', direction };

  for (const relation of relations) {
    const parsed = parseLimit(relation.tags?.maxspeed || relation.tags?.['maxspeed:forward'] || relation.tags?.['maxspeed:backward']);
    if (parsed) return { limit: parsed, kind: 'relation', confidence: 'Medium', direction: 'route relation' };
  }

  const estimated = estimateLimit(tags.highway);
  return estimated
    ? { limit: estimated, kind: 'estimated', confidence: 'Low', direction: 'road-class estimate' }
    : { limit: null, kind: 'unknown', confidence: 'Unknown', direction: 'none' };
}

async function timedFetch(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function consume(provider, authorization) {
  if (!authorization) return { allowed: false, reason: 'Sign in required for capped providers' };
  const response = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/consume_road_api_request`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: authorization,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ p_provider: provider })
  }, 6000);
  if (!response.ok) return { allowed: false, reason: `Usage counter ${response.status}` };
  const rows = await response.json();
  return (Array.isArray(rows) ? rows[0] : rows) || { allowed: false, reason: 'No usage status' };
}

async function googleRoad(lat, lon, prevLat, prevLon) {
  const key = process.env.GOOGLE_ROADS_API_KEY;
  if (!key) throw new Error('Google key not configured');
  const path = Number.isFinite(prevLat) && Number.isFinite(prevLon)
    ? `${prevLat},${prevLon}|${lat},${lon}`
    : `${lat},${lon}`;
  const snapResponse = await timedFetch(`https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(path)}&interpolate=false&key=${encodeURIComponent(key)}`, {}, 9000);
  const snapData = await snapResponse.json();
  if (!snapResponse.ok || snapData.error) throw new Error(snapData.error?.message || `Google HTTP ${snapResponse.status}`);
  const point = snapData.snappedPoints?.at(-1);
  if (!point?.placeId) throw new Error('Google returned no matched road');

  let limit = null;
  try {
    const limitResponse = await timedFetch(`https://roads.googleapis.com/v1/speedLimits?placeId=${encodeURIComponent(point.placeId)}&units=MPH&key=${encodeURIComponent(key)}`, {}, 7000);
    const limitData = await limitResponse.json();
    if (limitResponse.ok && limitData.speedLimits?.[0]) {
      limit = {
        display: `${Math.round(limitData.speedLimits[0].speedLimit)} mph`,
        mph: Math.round(limitData.speedLimits[0].speedLimit),
        raw: String(limitData.speedLimits[0].speedLimit)
      };
    }
  } catch {}

  return {
    status: 'road',
    source: 'Google Roads',
    road: 'Google matched road',
    limit,
    limitKind: limit ? 'mapped' : 'unknown',
    confidence: 'High',
    direction: 'snapped path',
    type: 'Road',
    surface: 'Unknown',
    lanes: '—',
    diagnostic: `Google snapped the GPS trail to place ID ${point.placeId}.${limit ? ' Speed limit returned.' : ' Speed-limit access returned no value.'}`
  };
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
  if (!key) throw new Error('TomTom key not configured');

  const previous = Number.isFinite(prevLat) && Number.isFinite(prevLon)
    ? { lat: prevLat, lon: prevLon }
    : syntheticPrevious(lat, lon, heading);

  const fields = '{projectedPoints{type,geometry{type,coordinates},properties{routeIndex,snapResult}},route{properties{id,speedLimits{value,unit,type},address{roadName,municipality,countrySubdivision},frc,roadUse,laneInfo{numberOfLanes}}}}';
  const params = new URLSearchParams({
    key,
    fields,
    vehicleType: 'PassengerCar',
    measurementSystem: 'imperial',
    offroadMargin: '164'
  });

  const makePoint = (pointLat, pointLon, pointHeading) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [pointLon, pointLat] },
    properties: Number.isFinite(pointHeading) ? { heading: pointHeading } : {}
  });

  const response = await timedFetch(`https://api.tomtom.com/snapToRoads/1?${params}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      points: [
        makePoint(previous.lat, previous.lon, heading),
        makePoint(lat, lon, heading)
      ]
    })
  }, 10000);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detailedError?.message || data.error?.message || `TomTom HTTP ${response.status}`);

  const route = Array.isArray(data.route) ? data.route : [];
  if (!route.length) throw new Error('TomTom returned no matched route');
  const projected = Array.isArray(data.projectedPoints) ? data.projectedPoints.at(-1) : null;
  const routeIndex = Number(projected?.properties?.routeIndex);
  const segment = route[Number.isFinite(routeIndex) ? Math.min(routeIndex, route.length - 1) : route.length - 1] || route.at(-1);
  const properties = segment?.properties || {};
  const speedLimit = properties.speedLimits;
  const limit = speedLimit?.value !== undefined
    ? parseLimit(`${speedLimit.value} ${speedLimit.unit || 'mph'}`)
    : null;
  const address = properties.address || {};

  return {
    status: 'road',
    source: 'TomTom Snap to Roads',
    road: address.roadName || 'TomTom matched road',
    limit,
    limitKind: limit ? 'mapped' : 'unknown',
    confidence: 'High',
    direction: 'snapped trail',
    type: pretty(properties.roadUse || properties.frc || 'road'),
    surface: 'Unknown',
    lanes: properties.laneInfo?.numberOfLanes || '—',
    diagnostic: `TomTom matched ${route.length} road segment${route.length === 1 ? '' : 's'}.${projected?.properties?.snapResult ? ` Final point: ${projected.properties.snapResult}.` : ''}${limit ? ' Speed limit returned.' : ' No speed limit was returned for this segment.'}`
  };
}

async function osmRoad(lat, lon, heading, speed) {
  const query = `[out:json][timeout:10];way(around:100,${lat},${lon})[highway]->.roads;.roads out tags center geom;rel(bw.roads)[route=road];out tags;`;
  const errors = [];

  for (const endpoint of ENDPOINTS) {
    const source = new URL(endpoint).hostname;
    try {
      const response = await timedFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          accept: 'application/json',
          'user-agent': 'MotoEngineeringCloud/1.3'
        },
        body: new URLSearchParams({ data: query })
      }, 11000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const elements = data.elements || [];
      const ways = elements.filter(element => element.type === 'way' && element.tags?.highway);
      const relations = elements.filter(element => element.type === 'relation');
      if (!ways.length) {
        return { status: 'no-road', source, confidence: 'Unknown', diagnostic: 'No mapped highway was returned within 100 meters.' };
      }

      const point = { lat, lon };
      const ranked = ways.map(way => {
        const segment = bestSegment(way, point);
        const difference = angleDifference(heading, segment.bearing);
        const headingPenalty = Number.isFinite(difference) && Number.isFinite(speed) && speed > 4
          ? Math.min(difference, 90) / 90 * 0.035
          : 0;
        const classPenalty = ['service', 'track', 'path', 'footway', 'cycleway'].includes(way.tags.highway) ? 0.012 : 0;
        return { way, segment, score: segment.distance + headingPenalty + classPenalty, difference };
      }).sort((a, b) => a.score - b.score);

      const picked = ranked[0];
      const tags = picked.way.tags || {};
      const matchingRelations = relations.filter(relation =>
        (tags.ref && relation.tags?.ref === tags.ref) ||
        (tags.name && relation.tags?.name === tags.name)
      );
      const resolved = selectLimit(tags, picked.segment.bearing, heading, matchingRelations);
      const feet = Math.round(picked.segment.distance * 5280);

      return {
        status: 'road',
        source: `OpenStreetMap · ${source}`,
        distance: picked.segment.distance,
        road: tags.name || tags.ref || tags.destination || 'Unnamed road',
        limit: resolved.limit,
        limitKind: resolved.kind,
        confidence: resolved.confidence,
        direction: resolved.direction,
        type: pretty(tags.highway),
        surface: pretty(tags.surface),
        lanes: tags.lanes || '—',
        bearing: picked.segment.bearing,
        headingDifference: picked.difference,
        diagnostic: `Matched ${tags.highway} about ${feet} ft away · ${Number.isFinite(picked.difference) ? `heading difference ${Math.round(picked.difference)}°` : 'heading unavailable'} · ${resolved.kind === 'estimated' ? 'road-class estimate' : `${resolved.kind} limit`}.`
      };
    } catch (error) {
      errors.push(`${source}: ${error.name === 'AbortError' ? 'timeout' : error.message}`);
    }
  }

  throw new Error(errors.join(' · '));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const heading = Number(req.query.heading);
  const speed = Number(req.query.speed);
  const prevLat = Number(req.query.prevLat);
  const prevLon = Number(req.query.prevLon);
  const requested = ['auto', 'osm', 'tomtom', 'google'].includes(req.query.provider) ? req.query.provider : 'osm';
  const authorization = req.headers.authorization;

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  const order = requested === 'auto'
    ? ['tomtom', 'google', 'osm']
    : [requested, 'osm'].filter((provider, index, array) => array.indexOf(provider) === index);
  const attempts = [];

  for (const provider of order) {
    try {
      if (provider === 'osm') {
        const result = await osmRoad(lat, lon, heading, speed);
        return res.status(200).json({ ...result, requestedProvider: requested, attempts });
      }

      const keyPresent = provider === 'google'
        ? Boolean(process.env.GOOGLE_ROADS_API_KEY)
        : Boolean(process.env.TOMTOM_API_KEY);
      if (!keyPresent) {
        attempts.push(`${provider}: key not configured`);
        continue;
      }

      const quota = await consume(provider, authorization);
      if (!quota.allowed) {
        attempts.push(`${provider}: ${quota.reason || 'monthly cap reached or counter unavailable'}`);
        continue;
      }

      const result = provider === 'google'
        ? await googleRoad(lat, lon, prevLat, prevLon)
        : await tomtomRoad(lat, lon, prevLat, prevLon, heading);

      return res.status(200).json({
        ...result,
        requestedProvider: requested,
        usage: {
          provider,
          requestCount: quota.request_count,
          monthlyCap: quota.monthly_cap,
          remaining: quota.remaining
        },
        attempts
      });
    } catch (error) {
      attempts.push(`${provider}: ${error.name === 'AbortError' ? 'timeout' : error.message || error}`);
    }
  }

  return res.status(502).json({ error: 'All road providers failed', details: attempts });
}
