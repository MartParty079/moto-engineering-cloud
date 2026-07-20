// Resilient iPhone lean sensor bridge.
// Keeps the Ride Dash lean GUI alive when startup permission was granted before
// the enhanced ride module attached its private listeners.
(() => {
  if (window.__motoLeanBridgeInstalled) return;
  window.__motoLeanBridgeInstalled = true;

  const PERMISSION_STORE = 'moto-startup-permissions-v1';
  const MAX_LEAN_DEG = 75;
  const CALIBRATION_WINDOW = 28;
  const CALIBRATION_MIN = 18;
  const NO_DATA_TIMEOUT_MS = 2600;

  const state = {
    attached: false,
    permission: 'unknown',
    status: 'waiting',
    calibrated: false,
    calibrating: false,
    baseline: null,
    lean: null,
    pitch: null,
    roll: null,
    accel: null,
    maxLean: 0,
    samples: [],
    lastEventAt: 0,
    lastScreenAngle: null,
    noDataTimer: 0,
    originalActive: false
  };

  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const median = values => {
    const list = values.filter(Number.isFinite).sort((a,b) => a - b);
    if (!list.length) return null;
    const middle = Math.floor(list.length / 2);
    return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
  };
  const spread = values => {
    const list = values.filter(Number.isFinite);
    return list.length ? Math.max(...list) - Math.min(...list) : Infinity;
  };
  const signedAngleDiff = (a,b) => ((a - b + 540) % 360) - 180;

  function rememberedPermission(){
    try {
      return JSON.parse(localStorage.getItem(PERMISSION_STORE) || 'null')?.motion || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  function savePermission(permission){
    state.permission = permission;
    try {
      const saved = JSON.parse(localStorage.getItem(PERMISSION_STORE) || '{}') || {};
      localStorage.setItem(PERMISSION_STORE,JSON.stringify({...saved,motion:permission,updatedAt:Date.now()}));
    } catch {}
  }

  function screenAngle(){
    const raw = Number(window.screen?.orientation?.angle ?? window.orientation ?? 0);
    return ((raw % 360) + 360) % 360;
  }

  function rawLean(event){
    const gamma = finite(event.gamma);
    const beta = finite(event.beta);
    const angle = screenAngle();
    if (angle === 90) return Number.isFinite(beta) ? -beta : null;
    if (angle === 270) return Number.isFinite(beta) ? beta : null;
    if (angle === 180) return Number.isFinite(gamma) ? -gamma : null;
    return gamma;
  }

  function setOverlayState(){
    const overlay = document.querySelector('#rideDashOverlay');
    if (!overlay) return;
    overlay.dataset.leanState = state.originalActive ? 'live' : state.status;
    overlay.dataset.leanPermission = state.permission;
    overlay.querySelectorAll('.widget-lean').forEach(widget => {
      widget.setAttribute('role','button');
      widget.setAttribute('tabindex','0');
      widget.setAttribute('aria-label',state.status === 'live' ? 'Lean angle live. Tap to recalibrate.' : 'Enable or calibrate lean sensor');
      widget.title = state.status === 'live' ? 'Tap to recalibrate lean angle' : 'Tap to enable lean angle';
    });
  }

  function publish(){
    const detail = {
      lean: state.calibrated && Number.isFinite(state.lean) ? state.lean : null,
      pitch: state.pitch,
      roll: state.roll,
      accel: state.accel,
      calibrated: state.calibrated,
      calibrating: state.calibrating,
      maxLean: state.maxLean,
      motionEnabled: state.attached || state.originalActive,
      sensorStatus: state.originalActive ? 'live' : state.status,
      source: state.originalActive ? 'ride-tools' : 'lean-bridge'
    };
    window.MotoLeanState = detail;
    if (!state.originalActive) window.dispatchEvent(new CustomEvent('moto-motion-update',{detail}));
    setOverlayState();
  }

  function clearNoDataTimer(){
    clearTimeout(state.noDataTimer);
    state.noDataTimer = 0;
  }

  function armNoDataTimer(){
    clearNoDataTimer();
    state.noDataTimer = window.setTimeout(() => {
      if (!state.attached || state.originalActive) return;
      if (Date.now() - state.lastEventAt >= NO_DATA_TIMEOUT_MS) {
        state.status = 'no-data';
        state.calibrating = false;
        state.calibrated = false;
        state.lean = null;
        publish();
      }
    },NO_DATA_TIMEOUT_MS + 100);
  }

  function beginCalibration(resetMax = false){
    if (resetMax) state.maxLean = 0;
    state.samples = [];
    state.baseline = null;
    state.lean = null;
    state.calibrated = false;
    state.calibrating = true;
    state.status = 'calibrating';
    state.lastScreenAngle = screenAngle();
    armNoDataTimer();
    publish();
  }

  function finishCalibration(){
    const baseline = median(state.samples);
    if (!Number.isFinite(baseline)) return;
    state.baseline = baseline;
    state.lean = 0;
    state.calibrated = true;
    state.calibrating = false;
    state.status = 'live';
    state.samples = [];
    window.dispatchEvent(new CustomEvent('moto-lean-calibrated',{detail:{automatic:true,source:'lean-bridge',zero:baseline,screenAngle:screenAngle(),timestamp:Date.now()}}));
    publish();
  }

  function onOrientation(event){
    if (!state.attached || state.originalActive) return;
    const raw = rawLean(event);
    state.pitch = finite(event.beta);
    state.roll = finite(event.gamma);
    state.lastEventAt = Date.now();
    clearNoDataTimer();

    if (!Number.isFinite(raw)) {
      state.status = 'no-data';
      state.lean = null;
      publish();
      armNoDataTimer();
      return;
    }

    const angle = screenAngle();
    if (state.lastScreenAngle !== null && angle !== state.lastScreenAngle) beginCalibration(false);
    state.lastScreenAngle = angle;

    if (state.calibrating || !state.calibrated) {
      state.samples.push(raw);
      state.samples = state.samples.slice(-CALIBRATION_WINDOW);
      if (state.samples.length >= CALIBRATION_MIN) {
        if (spread(state.samples) <= 5.5) finishCalibration();
        else state.samples = state.samples.slice(-Math.floor(CALIBRATION_MIN / 2));
      }
      publish();
      armNoDataTimer();
      return;
    }

    let candidate = clamp(signedAngleDiff(raw,state.baseline),-MAX_LEAN_DEG,MAX_LEAN_DEG);
    if (Math.abs(candidate) < .55) candidate = 0;
    state.lean = Number.isFinite(state.lean) ? state.lean * .72 + candidate * .28 : candidate;
    if (Math.abs(state.lean) < .35) state.lean = 0;
    state.maxLean = Math.max(state.maxLean,Math.abs(state.lean));
    state.status = 'live';
    publish();
    armNoDataTimer();
  }

  function onMotion(event){
    if (!state.attached || state.originalActive) return;
    const acceleration = event.accelerationIncludingGravity || event.acceleration || {};
    const x = finite(acceleration.x), y = finite(acceleration.y), z = finite(acceleration.z);
    if ([x,y,z].every(Number.isFinite)) state.accel = Math.sqrt(x*x + y*y + z*z) / 9.80665;
    publish();
  }

  function attach(reason = 'granted'){
    if (state.attached || state.originalActive) return;
    if (!('DeviceOrientationEvent' in window) && !('DeviceMotionEvent' in window)) {
      state.permission = 'unsupported';
      state.status = 'unsupported';
      publish();
      return;
    }
    window.addEventListener('deviceorientation',onOrientation,{passive:true});
    window.addEventListener('devicemotion',onMotion,{passive:true});
    state.attached = true;
    state.permission = reason === 'granted' ? 'granted' : state.permission;
    beginCalibration(false);
  }

  function detach(){
    if (!state.attached) return;
    window.removeEventListener('deviceorientation',onOrientation);
    window.removeEventListener('devicemotion',onMotion);
    state.attached = false;
    clearNoDataTimer();
  }

  async function requestPermission(){
    let allowed = true;
    try {
      if (typeof window.DeviceMotionEvent?.requestPermission === 'function') allowed = (await window.DeviceMotionEvent.requestPermission()) === 'granted';
      if (allowed && typeof window.DeviceOrientationEvent?.requestPermission === 'function') allowed = (await window.DeviceOrientationEvent.requestPermission()) === 'granted';
    } catch (error) {
      allowed = false;
      console.warn('Lean sensor permission request failed',error);
    }
    savePermission(allowed ? 'granted' : 'denied');
    return allowed;
  }

  async function enableFromGesture(){
    if (state.originalActive) return {enabled:true,source:'ride-tools'};
    state.status = 'requesting';
    publish();
    const allowed = state.permission === 'granted' || await requestPermission();
    if (!allowed) {
      state.status = 'denied';
      publish();
      throw new Error('Motion sensor permission is required for lean angle.');
    }
    attach('granted');
    return {enabled:true,calibrating:true,source:'lean-bridge'};
  }

  function autoAttach(){
    const permission = window.MotoPermissions?.motion || rememberedPermission();
    state.permission = permission;
    if (permission === 'granted') attach('granted');
    else {
      state.status = permission === 'denied' ? 'denied' : permission === 'unsupported' ? 'unsupported' : 'waiting';
      publish();
    }
  }

  function wrapRideTools(){
    const tools = window.MotoRideTools;
    if (!tools || tools.__leanBridgeWrapped) return Boolean(tools);
    tools.__leanBridgeWrapped = true;

    const originalGetState = typeof tools.getState === 'function' ? tools.getState.bind(tools) : () => ({});
    const originalEnable = typeof tools.enableSensors === 'function' ? tools.enableSensors.bind(tools) : null;
    const originalRecalibrate = typeof tools.recalibrate === 'function' ? tools.recalibrate.bind(tools) : null;

    tools.getState = () => {
      const original = originalGetState() || {};
      const originalEnabled = Boolean(original.motionEnabled);
      state.originalActive = originalEnabled;
      return {
        ...original,
        motionEnabled: originalEnabled || state.attached,
        leanCalibrated: originalEnabled ? original.leanCalibrated : state.calibrated,
        leanCalibrating: originalEnabled ? original.leanCalibrating : state.calibrating,
        maxLean: Math.max(Number(original.maxLean || 0),state.maxLean),
        sensorStatus: originalEnabled ? 'live' : state.status,
        bridgeActive: state.attached && !originalEnabled
      };
    };

    tools.enableSensors = async () => {
      if (originalEnable) {
        try {
          const result = await originalEnable();
          const original = originalGetState() || {};
          if (original.motionEnabled) {
            state.originalActive = true;
            state.status = 'live';
            detach();
            publish();
            return result;
          }
        } catch (error) {
          console.warn('Primary lean sensor path unavailable; using compatibility bridge',error);
        }
      }
      return enableFromGesture();
    };

    tools.recalibrate = () => {
      const original = originalGetState() || {};
      if (original.motionEnabled && originalRecalibrate) return originalRecalibrate();
      if (!state.attached) return enableFromGesture();
      beginCalibration(true);
      return {enabled:true,calibrating:true,source:'lean-bridge'};
    };

    return true;
  }

  function handleLeanActivation(event){
    const widget = event.target.closest?.('#rideDashOverlay .widget-lean');
    if (!widget || event.target.closest('.widgetEdit')) return;
    event.preventDefault();
    event.stopPropagation();
    const tools = window.MotoRideTools;
    Promise.resolve(tools?.getState?.().motionEnabled ? tools?.recalibrate?.() : tools?.enableSensors?.() || enableFromGesture())
      .catch(error => {
        state.status = 'denied';
        publish();
        console.warn(error);
      });
  }

  document.addEventListener('click',handleLeanActivation,true);
  document.addEventListener('keydown',event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('#rideDashOverlay .widget-lean')) handleLeanActivation(event);
  },true);

  window.addEventListener('moto-permissions-change',event => {
    state.permission = event.detail?.motion || state.permission;
    if (state.permission === 'granted' && !state.originalActive) attach('granted');
    else publish();
  });

  window.addEventListener('moto-ride-state',event => {
    if (event.detail?.active && !state.originalActive && !state.attached) autoAttach();
    setOverlayState();
  });
  window.addEventListener('moto-ride-dash-opened',setOverlayState);
  window.addEventListener('moto-ride-dash-rendered',setOverlayState);
  window.addEventListener('moto-ride-dash-refreshed',setOverlayState);
  window.addEventListener('pagehide',detach);

  let attempts = 0;
  const toolTimer = window.setInterval(() => {
    attempts += 1;
    if (wrapRideTools() || attempts > 80) clearInterval(toolTimer);
  },100);

  window.MotoLeanBridge = {
    enable: enableFromGesture,
    recalibrate: () => state.attached ? beginCalibration(true) : enableFromGesture(),
    getState: () => ({...state,samples:[...state.samples]}),
    attach: autoAttach
  };

  autoAttach();
})();