// Permission-aware ride start guard. Prevents the dashboard from remaining in a loading state.
(() => {
  if (window.__motoRideStartGuardInstalled) return;
  window.__motoRideStartGuardInstalled = true;

  const STORE = 'moto-startup-permissions-v1';
  const deadline = (promise, ms, label) => Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), ms))
  ]);

  function remembered(){
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; }
    catch { return {}; }
  }

  function persist(patch){
    const next = {...remembered(), ...patch, updatedAt:Date.now()};
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch {}
    window.MotoPermissions = {...(window.MotoPermissions || {}), ...next};
    window.dispatchEvent(new CustomEvent('moto-permissions-change',{detail:{location:next.location || 'unknown',motion:next.motion || 'unknown'}}));
    return next;
  }

  function requestLocationFallback(){
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve('unsupported');
      navigator.geolocation.getCurrentPosition(
        position => { window.__motoGpsPublish?.(position); resolve('granted'); },
        error => resolve(error?.code === 1 ? 'denied' : 'unavailable'),
        {enableHighAccuracy:true,maximumAge:5000,timeout:10000}
      );
    });
  }

  async function requestMotionFallback(){
    try {
      const requests = [];
      if (typeof window.DeviceMotionEvent?.requestPermission === 'function') requests.push(window.DeviceMotionEvent.requestPermission());
      if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') requests.push(window.DeviceOrientationEvent.requestPermission());
      if (requests.length) return (await Promise.all(requests)).every(value => value === 'granted') ? 'granted' : 'denied';
      return ('DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window) ? 'granted' : 'unsupported';
    } catch { return 'denied'; }
  }

  async function ensurePermissions(){
    const known = {...remembered(), ...(window.MotoPermissions || {})};
    const controller = window.MotoPermissionController;

    // Only wait for an iOS permission decision when access has not already been granted.
    // A granted location permission does not need a fresh GPS fix before the ride session starts.
    const locationPromise = known.location === 'granted'
      ? Promise.resolve('granted')
      : (controller?.requestLocation?.() || requestLocationFallback());
    const motionPromise = known.motion === 'granted'
      ? Promise.resolve('granted')
      : (controller?.requestMotion?.() || requestMotionFallback());

    const [location, motion] = await deadline(Promise.all([locationPromise,motionPromise]),12000,'Permission check');
    persist({location,motion});
    if (location !== 'granted') throw new Error('Location permission is required to start Ride Mode. Enable Precise Location in iPhone Settings, then try again.');

    if (motion === 'granted') {
      // Sensor startup runs independently and can never hold Ride Mode in a loading state.
      deadline(
        window.MotoRideTools?.enableSensors?.({requestPermission:false,autoCalibrate:true,resetMax:true,reason:'ride-start'}) || Promise.resolve(),
        3500,
        'Sensor startup'
      ).catch(error => console.warn('Ride started without motion sensors',error));
    }
    return {location,motion};
  }

  function progress(phase,message){
    window.dispatchEvent(new CustomEvent('moto-ride-start-progress',{detail:{phase,message}}));
    const status = document.querySelector('#dashRideStatus');
    const toggle = document.querySelector('#dashRideToggle');
    if (status && message) status.textContent = message;
    if (toggle) {
      const busy = !['ready','failed'].includes(phase);
      toggle.disabled = busy;
      if (busy) toggle.textContent = phase === 'permissions' ? 'CHECKING ACCESS…' : 'STARTING…';
    }
  }

  function wrap(){
    const ride = window.MotoRide;
    if (!ride?.start || ride.start.__motoGuarded) return false;
    const original = ride.start.bind(ride);
    const guarded = async bikeId => {
      progress('permissions','CHECKING RIDE ACCESS');
      try {
        await ensurePermissions();
        progress('starting','STARTING RIDE');
        const result = await deadline(original(bikeId),18000,'Ride start');
        progress('ready','RECORDING');
        return result;
      } catch (error) {
        progress('failed','START FAILED');
        throw error;
      } finally {
        setTimeout(() => {
          const state = window.MotoRide?.getState?.() || {};
          const toggle = document.querySelector('#dashRideToggle');
          if (toggle) {
            toggle.disabled = false;
            toggle.textContent = state.active ? 'STOP & SAVE' : 'START RIDE';
          }
        },100);
      }
    };
    guarded.__motoGuarded = true;
    ride.start = guarded;
    return true;
  }

  if (!wrap()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (wrap() || attempts >= 200) clearInterval(timer);
    },100);
  }

  // Recover visual state if an interrupted navigation left the dashboard marked busy.
  window.addEventListener('moto-ride-dash-opened',() => {
    setTimeout(() => {
      const state = window.MotoRide?.getState?.() || {};
      const toggle = document.querySelector('#dashRideToggle');
      if (!state.starting && toggle) {
        toggle.disabled = false;
        toggle.textContent = state.active ? 'STOP & SAVE' : 'START RIDE';
      }
    },250);
  });
})();