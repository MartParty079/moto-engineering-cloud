// A single iOS geolocation broker. Ride Center owns the live watch; optional modules reuse its latest fix.
const geo = navigator.geolocation;

if (geo && !window.__motoGpsBrokerInstalled) {
  window.__motoGpsBrokerInstalled = true;
  window.__motoLatestPosition = null;

  const originalWatch = geo.watchPosition.bind(geo);
  const originalCurrent = geo.getCurrentPosition.bind(geo);

  const remember = position => {
    if (!position?.coords) return position;
    window.__motoLatestPosition = position;
    window.dispatchEvent(new CustomEvent('moto-gps-fix', {
      detail: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        altitude: position.coords.altitude,
        accuracy: position.coords.accuracy,
        speed: Number.isFinite(position.coords.speed) ? position.coords.speed * 2.236936 : null,
        speedMps: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
        timestamp: position.timestamp || Date.now()
      }
    }));
    return position;
  };

  geo.watchPosition = (success, error, options) => originalWatch(
    position => success?.(remember(position)),
    error,
    options
  );

  geo.getCurrentPosition = (success, error, options = {}) => {
    const cached = window.__motoLatestPosition;
    const age = cached ? Date.now() - (cached.timestamp || 0) : Infinity;
    const allowedAge = Number.isFinite(options.maximumAge) ? Math.max(options.maximumAge, 5000) : 15000;

    if (cached && age <= Math.max(allowedAge, 30000)) {
      queueMicrotask(() => success?.(cached));
      return;
    }

    originalCurrent(position => success?.(remember(position)), error, options);
  };
}
