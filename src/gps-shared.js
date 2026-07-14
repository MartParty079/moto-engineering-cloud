// Single iOS geolocation broker. Ride Center owns the live watch; optional modules reuse its latest fix.
const geo = navigator.geolocation;

if (geo && !window.__motoGpsBrokerInstalled) {
  window.__motoGpsBrokerInstalled = true;
  window.__motoLatestPosition = null;

  const originalWatch = geo.watchPosition.bind(geo);
  const originalCurrent = geo.getCurrentPosition.bind(geo);
  const watchers = new Map();
  let previousFix = null;

  const bearingBetween = (a, b) => {
    if (!a || !b) return null;
    const toRad = value => value * Math.PI / 180;
    const toDeg = value => value * 180 / Math.PI;
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  };

  const distanceFeet = (a, b) => {
    if (!a || !b) return 0;
    const r = 20902231;
    const toRad = value => value * Math.PI / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(q));
  };

  const ensureDiagnostics = () => {
    const metrics = document.querySelector('.rideMetrics');
    if (!metrics) return;
    if (!document.querySelector('#rideLatitude')) {
      metrics.insertAdjacentHTML('beforeend', '<article><small>LATITUDE</small><strong id="rideLatitude">--</strong></article><article><small>LONGITUDE</small><strong id="rideLongitude">--</strong></article><article><small>GPS FIX AGE</small><strong id="rideFixAge">--</strong></article><article><small>HEADING SOURCE</small><strong id="rideHeadingSource">Waiting</strong></article>');
    }
  };

  const updateDiagnostics = detail => {
    ensureDiagnostics();
    const values = {
      rideLatitude: Number.isFinite(detail.latitude) ? detail.latitude.toFixed(6) : '--',
      rideLongitude: Number.isFinite(detail.longitude) ? detail.longitude.toFixed(6) : '--',
      rideFixAge: '0 sec',
      rideHeadingSource: detail.headingSource || 'Unavailable'
    };
    for (const [id, value] of Object.entries(values)) {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    }
    const heading = document.getElementById('rideHeading');
    if (heading && Number.isFinite(detail.heading)) heading.textContent = `${Math.round(detail.heading)}°`;
  };

  const remember = position => {
    if (!position?.coords) return position;
    window.__motoLatestPosition = position;
    const current = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    let heading = Number.isFinite(position.coords.heading) ? position.coords.heading : null;
    let headingSource = Number.isFinite(heading) ? 'iPhone GPS' : 'Stationary';
    const movedFeet = distanceFeet(previousFix, current);
    if (!Number.isFinite(heading) && previousFix && movedFeet >= 12) {
      heading = bearingBetween(previousFix, current);
      headingSource = 'Calculated course';
    }
    if (!previousFix || movedFeet >= 5) previousFix = current;

    const detail = {
      latitude: current.latitude,
      longitude: current.longitude,
      altitude: position.coords.altitude,
      accuracy: position.coords.accuracy,
      speed: Number.isFinite(position.coords.speed) ? position.coords.speed * 2.236936 : null,
      speedMps: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
      heading,
      headingSource,
      timestamp: position.timestamp || Date.now()
    };
    window.MotoGPS = detail;
    window.__motoLatestGpsFix = detail;
    updateDiagnostics(detail);
    window.dispatchEvent(new CustomEvent('moto-gps-fix', { detail }));
    return position;
  };

  window.__motoGpsPublish = remember;
  window.__motoGpsGetLatest = () => window.__motoLatestPosition;
  window.__motoGpsWaitForFix = (timeoutMs = 20000) => new Promise((resolve, reject) => {
    const cached = window.__motoLatestPosition;
    if (cached) return resolve(cached);
    const timer = setTimeout(() => {
      window.removeEventListener('moto-gps-fix', onFix);
      reject(new Error('Waiting for Ride Center GPS fix'));
    }, timeoutMs);
    const onFix = () => {
      clearTimeout(timer);
      window.removeEventListener('moto-gps-fix', onFix);
      resolve(window.__motoLatestPosition);
    };
    window.addEventListener('moto-gps-fix', onFix, { once: true });
  });

  const wrappedWatch = (success, error, options) => {
    const id = originalWatch(position => success?.(remember(position)), error, options);
    watchers.set(id, true);
    return id;
  };

  const wrappedCurrent = (success, error, options = {}) => {
    const cached = window.__motoLatestPosition;
    const age = cached ? Date.now() - Number(cached.timestamp || 0) : Infinity;
    const requestedAge = Number.isFinite(options.maximumAge) ? options.maximumAge : 15000;
    if (cached && age <= Math.max(requestedAge, 60000)) {
      queueMicrotask(() => success?.(cached));
      return;
    }
    originalCurrent(position => success?.(remember(position)), error, options);
  };

  try {
    Object.defineProperty(geo, 'watchPosition', { configurable: true, value: wrappedWatch });
    Object.defineProperty(geo, 'getCurrentPosition', { configurable: true, value: wrappedCurrent });
  } catch (error) {
    console.warn('GPS broker method wrapping unavailable', error);
  }

  setInterval(() => {
    const age = window.MotoGPS?.timestamp ? Math.max(0, Math.round((Date.now() - window.MotoGPS.timestamp) / 1000)) : null;
    const element = document.getElementById('rideFixAge');
    if (element) element.textContent = age === null ? '--' : `${age} sec`;
    ensureDiagnostics();
  }, 1000);

  originalCurrent(remember, () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
}