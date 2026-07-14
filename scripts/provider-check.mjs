import { mkdir, writeFile } from 'node:fs/promises';

const lat = 32.7357;
const lon = -97.1081;
const previousLon = lon - 0.0003;

function cleanMessage(value) {
  const text = String(value || 'Unknown error');
  return text
    .replaceAll(process.env.GOOGLE_ROADS_API_KEY || '__none__', '[redacted]')
    .replaceAll(process.env.GOOGLE_PLACES_API_KEY || '__none__', '[redacted]')
    .replaceAll(process.env.TOMTOM_API_KEY || '__none__', '[redacted]')
    .slice(0, 300);
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function checkGoogleRoads() {
  const key = process.env.GOOGLE_ROADS_API_KEY;
  if (!key) return { configured: false, snap: 'not_configured', speedLimits: 'not_tested' };
  try {
    const path = `${lat},${previousLon}|${lat},${lon}`;
    const response = await fetch(`https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(path)}&interpolate=false&key=${encodeURIComponent(key)}`);
    const data = await readJson(response);
    if (!response.ok || data.error) {
      return { configured: true, snap: 'failed', httpStatus: response.status, error: cleanMessage(data.error?.message || `HTTP ${response.status}`), speedLimits: 'not_tested' };
    }
    const point = data.snappedPoints?.at(-1);
    if (!point?.placeId) return { configured: true, snap: 'accepted_no_match', speedLimits: 'not_tested' };

    const speedResponse = await fetch(`https://roads.googleapis.com/v1/speedLimits?placeId=${encodeURIComponent(point.placeId)}&units=MPH&key=${encodeURIComponent(key)}`);
    const speedData = await readJson(speedResponse);
    return {
      configured: true,
      snap: 'working',
      matchedPoints: data.snappedPoints?.length || 0,
      speedLimits: speedResponse.ok && !speedData.error ? (speedData.speedLimits?.length ? 'working' : 'accepted_no_data') : 'unavailable',
      speedHttpStatus: speedResponse.status,
      speedError: speedResponse.ok ? undefined : cleanMessage(speedData.error?.message || `HTTP ${speedResponse.status}`)
    };
  } catch (error) {
    return { configured: true, snap: 'failed', error: cleanMessage(error.message), speedLimits: 'not_tested' };
  }
}

async function checkGooglePlaces() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { configured: false, status: 'not_configured' };
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.location'
      },
      body: JSON.stringify({
        includedTypes: ['gas_station'],
        maxResultCount: 1,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lon },
            radius: 1500
          }
        }
      })
    });
    const data = await readJson(response);
    return response.ok && !data.error
      ? { configured: true, status: 'working', resultCount: data.places?.length || 0 }
      : { configured: true, status: 'failed', httpStatus: response.status, error: cleanMessage(data.error?.message || `HTTP ${response.status}`) };
  } catch (error) {
    return { configured: true, status: 'failed', error: cleanMessage(error.message) };
  }
}

async function checkTomTom() {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return { configured: false, status: 'not_configured' };
  try {
    const fields = '{projectedPoints{type,geometry{type,coordinates},properties{routeIndex,snapResult}},route{properties{id,speedLimits{value,unit,type},address{roadName},frc,roadUse,laneInfo{numberOfLanes}}}}';
    const params = new URLSearchParams({
      key,
      fields,
      vehicleType: 'PassengerCar',
      measurementSystem: 'imperial',
      offroadMargin: '164'
    });
    const point = (pointLon, heading = 90) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pointLon, lat] },
      properties: { heading }
    });
    const response = await fetch(`https://api.tomtom.com/snapToRoads/1?${params}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ points: [point(previousLon), point(lon)] })
    });
    const data = await readJson(response);
    return response.ok
      ? { configured: true, status: 'working', routeSegments: data.route?.length || 0, projectedPoints: data.projectedPoints?.length || 0, speedLimitReturned: Boolean(data.route?.some(segment => segment.properties?.speedLimits?.value !== undefined)) }
      : { configured: true, status: 'failed', httpStatus: response.status, error: cleanMessage(data.detailedError?.message || data.error?.message || `HTTP ${response.status}`) };
  } catch (error) {
    return { configured: true, status: 'failed', error: cleanMessage(error.message) };
  }
}

const status = {
  checkedAt: new Date().toISOString(),
  googleRoads: await checkGoogleRoads(),
  googlePlaces: await checkGooglePlaces(),
  tomTom: await checkTomTom()
};

await mkdir('public', { recursive: true });
await writeFile('public/provider-status.json', `${JSON.stringify(status, null, 2)}\n`, 'utf8');
console.log('Provider verification:', JSON.stringify(status));
