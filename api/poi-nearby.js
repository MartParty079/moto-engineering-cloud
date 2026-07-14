const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bxqexjvwxtnlflznyqyq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_nwyH_NCP2tXE8BXf7zcDAg_dfBSm02M';

const CATEGORIES = {
  fuel: {
    label: 'fuel stations',
    googleTypes: ['gas_station'],
    osmFilters: ['[amenity=fuel]']
  },
  food: {
    label: 'food stops',
    googleTypes: ['restaurant', 'cafe', 'fast_food_restaurant'],
    osmFilters: ['[amenity~"^(restaurant|cafe|fast_food)$"]']
  },
  camp: {
    label: 'campgrounds',
    googleTypes: ['campground', 'rv_park'],
    osmFilters: ['[tourism~"^(camp_site|caravan_site)$"]']
  },
  motorcycle: {
    label: 'motorcycle shops',
    googleText: 'motorcycle repair shop or motorcycle dealer',
    osmFilters: ['[shop=motorcycle]', '[craft=motorcycle_repair]']
  },
  hospital: {
    label: 'medical facilities',
    googleTypes: ['hospital', 'general_hospital', 'medical_clinic'],
    osmFilters: ['[amenity~"^(hospital|clinic)$"]']
  },
  parking: {
    label: 'parking',
    googleTypes: ['parking', 'parking_garage', 'parking_lot'],
    osmFilters: ['[amenity=parking]']
  }
};

function toRadians(value) {
  return value * Math.PI / 180;
}

function miles(a, b) {
  const radius = 3958.7613;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(q));
}

async function timedFetch(url, options = {}, timeoutMs = 11000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function consumePlacesRequest(authorization) {
  if (!authorization) return { allowed: false, reason: 'Sign in required for Google Places' };
  const response = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/consume_road_api_request`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: authorization,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ p_provider: 'google_places' })
  }, 6000);
  if (!response.ok) return { allowed: false, reason: `Usage counter ${response.status}` };
  const rows = await response.json();
  return (Array.isArray(rows) ? rows[0] : rows) || { allowed: false, reason: 'No usage status' };
}

function normalizeGooglePlace(place, origin) {
  const lat = Number(place.location?.latitude);
  const lon = Number(place.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: place.id || `${lat},${lon}`,
    lat,
    lon,
    name: place.displayName?.text || 'Unnamed place',
    address: place.formattedAddress || null,
    type: place.primaryType || null,
    distance_miles: miles(origin, { lat, lon }),
    map_url: place.googleMapsUri || `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
  };
}

async function googlePlaces(category, lat, lon, radius) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('Google Places key not configured');

  const config = CATEGORIES[category];
  const isTextSearch = Boolean(config.googleText);
  const endpoint = isTextSearch
    ? 'https://places.googleapis.com/v1/places:searchText'
    : 'https://places.googleapis.com/v1/places:searchNearby';
  const location = {
    circle: {
      center: { latitude: lat, longitude: lon },
      radius
    }
  };
  const body = isTextSearch
    ? {
        textQuery: config.googleText,
        maxResultCount: 20,
        locationBias: location
      }
    : {
        includedTypes: config.googleTypes,
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        locationRestriction: location
      };

  // Deliberately limited to Nearby Search Pro fields. Rating and opening-hours
  // fields are omitted because they move the request into more expensive SKUs.
  const response = await timedFetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.googleMapsUri'
    },
    body: JSON.stringify(body)
  }, 10000);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `Google Places HTTP ${response.status}`);
  }

  const origin = { lat, lon };
  const places = (data.places || [])
    .map(place => normalizeGooglePlace(place, origin))
    .filter(Boolean)
    .sort((a, b) => a.distance_miles - b.distance_miles);
  if (!places.length) throw new Error(`Google returned no ${config.label}`);
  return places;
}

function osmQuery(config, lat, lon, radius) {
  const selectors = [];
  for (const filter of config.osmFilters) {
    selectors.push(`node(around:${radius},${lat},${lon})${filter};`);
    selectors.push(`way(around:${radius},${lat},${lon})${filter};`);
    selectors.push(`relation(around:${radius},${lat},${lon})${filter};`);
  }
  return `[out:json][timeout:10];(${selectors.join('')});out center tags;`;
}

function osmAddress(tags) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const locality = [tags['addr:city'], tags['addr:state']].filter(Boolean).join(', ');
  return [street, locality].filter(Boolean).join(', ') || null;
}

async function openStreetMapPlaces(category, lat, lon, radius) {
  const config = CATEGORIES[category];
  const query = osmQuery(config, lat, lon, radius);
  const errors = [];

  for (const endpoint of ENDPOINTS) {
    const source = new URL(endpoint).hostname;
    try {
      const response = await timedFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          accept: 'application/json',
          'user-agent': 'MotoEngineeringCloud/AdventurePOI'
        },
        body: new URLSearchParams({ data: query })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const origin = { lat, lon };
      const places = (data.elements || []).map(element => {
        const point = element.type === 'node' ? element : element.center;
        if (!point) return null;
        const tags = element.tags || {};
        const placeLat = Number(point.lat);
        const placeLon = Number(point.lon);
        if (!Number.isFinite(placeLat) || !Number.isFinite(placeLon)) return null;
        return {
          id: `${element.type}/${element.id}`,
          lat: placeLat,
          lon: placeLon,
          name: tags.name || tags.brand || tags.operator || config.label.replace(/^./, char => char.toUpperCase()),
          address: osmAddress(tags),
          type: tags.amenity || tags.tourism || tags.shop || tags.craft || null,
          distance_miles: miles(origin, { lat: placeLat, lon: placeLon }),
          map_url: `https://www.google.com/maps/dir/?api=1&destination=${placeLat},${placeLon}`
        };
      }).filter(Boolean)
        .sort((a, b) => a.distance_miles - b.distance_miles)
        .slice(0, 30);

      return { places, source: `OpenStreetMap · ${source}` };
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
  const radius = Math.max(1000, Math.min(50000, Number(req.query.radius) || 25000));
  const category = CATEGORIES[req.query.category] ? req.query.category : 'fuel';
  const authorization = req.headers.authorization;
  const attempts = [];

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  if (process.env.GOOGLE_PLACES_API_KEY) {
    const quota = await consumePlacesRequest(authorization);
    if (quota.allowed) {
      try {
        const places = await googlePlaces(category, lat, lon, radius);
        return res.status(200).json({
          category,
          label: CATEGORIES[category].label,
          source: 'Google Places',
          places,
          usage: {
            provider: 'google_places',
            requestCount: quota.request_count,
            monthlyCap: quota.monthly_cap,
            remaining: quota.remaining
          },
          attempts
        });
      } catch (error) {
        attempts.push(`Google Places: ${error.name === 'AbortError' ? 'timeout' : error.message}`);
      }
    } else {
      attempts.push(`Google Places: ${quota.reason || 'monthly cap reached'}`);
    }
  } else {
    attempts.push('Google Places: key not configured');
  }

  try {
    const result = await openStreetMapPlaces(category, lat, lon, radius);
    return res.status(200).json({
      category,
      label: CATEGORIES[category].label,
      source: result.source,
      places: result.places,
      usage: null,
      attempts
    });
  } catch (error) {
    attempts.push(`OpenStreetMap: ${error.message || error}`);
    return res.status(502).json({ error: 'Nearby place lookup failed', details: attempts });
  }
}
