// Permission-aware ride start guard. Permission decisions may gate a ride; a weak or
// unavailable GPS fix must not. iPhone motion sensors are temporarily disabled.
(() => {
  if (window.__motoRideStartGuardInstalled) return;
  window.__motoRideStartGuardInstalled = true;

  const STORE = 'moto-startup-permissions-v1';
  const IPHONE_MOTION_DISABLED = Boolean(window.__motoIphoneMotionDisabled) || /iphone|ipod/i.test(navigator.userAgent);
  const deadline = (promise, ms, label) => Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), ms))
  ]);

  function remembered(){
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; }
    catch { return {}; }
  }

  function persist(patch){
    const next = {
      ...remembered(),
      ...patch,
      ...(IPHONE_MOTION_DISABLED ? {motion:'disabled',motionDisabledReason:'iphone-stability'} : {}),
      updatedAt:Date.now()
    };
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch {}
    window.MotoPermissions = {...(window.MotoPermissions || {}), ...next};
    window.dispatchEvent(new CustomEvent('moto-permissions-change',{
      detail:{location:next.location || 'unknown',motion:next.motion || 'unknown'}
    }));
    return next;
  }

  function requestLocationFallback(){
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve({permission:'unsupported',fix:'unsupported'});
      navigator.geolocation.getCurrentPosition(
        position => {
          window.__motoGpsPublish?.(position);
          resolve({permission:'granted',fix:'ready'});
        },
        error => {
          if (error?.code === 1) resolve({permission:'denied',fix:'denied'});
          else resolve({permission:'granted',fix:'pending',errorCode:error?.code || null});
        },
        {enableHighAccuracy:true,maximumAge:15000,timeout:8000}
      );
    });
  }

  async function requestLocation(controller){
    if (!controller?.requestLocation) return requestLocationFallback();
    try {
      const result = await controller.requestLocation();
      if (result === 'denied') return {permission:'denied',fix:'denied'};
      if (result === 'unsupported') return {permission:'unsupported',fix:'unsupported'};
      if (result === 'unavailable') return {permission:'granted',fix:'pending'};
      return {permission:'granted',fix:window.MotoGPS ? 'ready' : 'pending'};
    } catch (error) {
      console.warn('Location preflight failed; starting with a pending GPS fix.',error);
      return {permission:'granted',fix:'pending'};
    }
  }

  async function requestMotionFallback(){
    if (IPHONE_MOTION_DISABLED) return 'disabled';
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

    const locationPromise = known.location === 'granted'
      ? Promise.resolve({permission:'granted',fix:window.MotoGPS ? 'ready' : 'pending'})
      : requestLocation(controller);

    const motionPromise = IPHONE_MOTION_DISABLED
      ? Promise.resolve('disabled')
      : known.motion === 'granted'
        ? Promise.resolve('granted')
        : (controller?.requestMotion?.() || requestMotionFallback());

    const [locationResult,motion] = await Promise.all([locationPromise,motionPromise]);
    persist({location:locationResult.permission,motion,gpsFix:locationResult.fix});

    if (locationResult.permission === 'denied') {
      throw new Error('Location access is denied. Enable Location and Precise Location for Moto Mission in iPhone Settings, then try again.');
    }
    if (locationResult.permission === 'unsupported') {
      throw new Error('Location services are unavailable on this device.');
    }

    if (locationResult.fix !== 'ready') {
      window.dispatchEvent(new CustomEvent('moto-gps-waiting',{
        detail:{reason:'ride-start',message:'Ride started; waiting for GPS signal.'}
      }));
    }

    if (!IPHONE_MOTION_DISABLED && motion === 'granted') {
      // Motion setup is detached from ride-session startup on supported platforms.
      deadline(
        window.MotoRideTools?.enableSensors?.({requestPermission:false,autoCalibrate:true,resetMax:true,reason:'ride-start'}) || Promise.resolve(),
        4000,
        'Sensor startup'
      ).catch(error => console.warn('Ride started without motion sensors',error));
    } else if (IPHONE_MOTION_DISABLED) {
      try { window.MotoRideTools?.disableSensors?.(); } catch {}
    }

    return {location:locationResult.permission,motion,gpsFix:locationResult.fix};
  }

  function progress(phase,message){
    window.MotoRideStartState = {phase,message,updatedAt:Date.now()};
    window.dispatchEvent(new CustomEvent('moto-ride-start-progress',{detail:window.MotoRideStartState}));
    const status = document.querySelector('#dashRideStatus');
    const toggle = document.querySelector('#dashRideToggle');
    if (status && message) status.textContent = message;
    if (toggle) {
      const busy = !['ready','failed'].includes(phase);
      toggle.disabled = busy;
      if (busy) toggle.textContent = phase === 'permissions' ? 'CHECKING LOCATION…' : 'STARTING…';
    }
  }

  function wrap(){
    const ride = window.MotoRide;
    if (!ride?.start || ride.start.__motoGuarded) return false;
    const original = ride.start.bind(ride);
    const guarded = async bikeId => {
      progress('permissions','CHECKING RIDE LOCATION');
      try {
        await ensurePermissions();
        progress('starting','STARTING RIDE');
        const result = await deadline(original(bikeId),22000,'Ride session');
        progress('ready',result?.gpsLocked ? 'RECORDING' : 'RECORDING · WAITING FOR GPS');
        return result;
      } catch (error) {
        progress('failed','START FAILED');
        console.error('Guarded ride start failed',error);
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
