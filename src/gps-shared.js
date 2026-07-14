// Single iOS geolocation broker. Ride Center owns the live watch; optional modules reuse its latest fix.
const geo = navigator.geolocation;

if (geo && !window.__motoGpsBrokerInstalled) {
  window.__motoGpsBrokerInstalled = true;
  window.__motoLatestPosition = null;

  const originalWatch = geo.watchPosition.bind(geo);
  const originalCurrent = geo.getCurrentPosition.bind(geo);
  const watchers = new Map();
  let nextWatcherId = 100000;

  const remember = position => {
    if (!position?.coords) return position;
    window.__motoLatestPosition = position;
    const detail = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: position.coords.altitude,
      accuracy: position.coords.accuracy,
      speed: Number.isFinite(position.coords.speed) ? position.coords.speed * 2.236936 : null,
      speedMps: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
      heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
      timestamp: position.timestamp || Date.now()
    };
    window.__motoLatestGpsFix = detail;
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

  // Prime one fix without starting another persistent watcher.
  originalCurrent(remember, () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
}