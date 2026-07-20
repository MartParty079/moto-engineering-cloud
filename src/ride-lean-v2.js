// Lean runtime v2.
// Requests iPhone motion + orientation permission in one user gesture and falls back
// to the gravity vector when DeviceOrientation does not emit usable data.
(() => {
  if (window.__motoLeanRuntimeV2Installed) return;
  window.__motoLeanRuntimeV2Installed = true;

  const PERMISSION_STORE = 'moto-startup-permissions-v1';
  const MAX_LEAN = 75;
  const CALIBRATION_SAMPLES = 20;
  const CALIBRATION_MIN_MS = 450;
  const NO_EVENT_MS = 1800;

  const state = {
    attached:false,
    activating:false,
    explicitActivation:false,
    permission:'unknown',
    status:'waiting',
    calibrated:false,
    calibrating:false,
    baseline:null,
    lean:null,
    pitch:null,
    roll:null,
    accel:null,
    maxLean:0,
    samples:[],
    sampleStartedAt:0,
    lastEventAt:0,
    lastOrientationAt:0,
    lastMotionAt:0,
    lastScreenAngle:null,
    noEventTimer:0
  };

  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const signedAngleDiff = (a,b) => ((a - b + 540) % 360) - 180;
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

  function rememberedPermission(){
    try { return JSON.parse(localStorage.getItem(PERMISSION_STORE) || 'null')?.motion || 'unknown'; }
    catch { return 'unknown'; }
  }

  function savePermission(value){
    state.permission = value;
    try {
      const saved = JSON.parse(localStorage.getItem(PERMISSION_STORE) || '{}') || {};
      localStorage.setItem(PERMISSION_STORE,JSON.stringify({...saved,motion:value,updatedAt:Date.now()}));
    } catch {}
  }

  function screenAngle(){
    const value = Number(window.screen?.orientation?.angle ?? window.orientation ?? 0);
    return ((value % 360) + 360) % 360;
  }

  function rawFromOrientation(event){
    const gamma = finite(event.gamma);
    const beta = finite(event.beta);
    const angle = screenAngle();
    if (angle === 90) return Number.isFinite(beta) ? -beta : null;
    if (angle === 270) return Number.isFinite(beta) ? beta : null;
    if (angle === 180) return Number.isFinite(gamma) ? -gamma : null;
    return gamma;
  }

  function rawFromGravity(acceleration){
    const x = finite(acceleration?.x);
    const y = finite(acceleration?.y);
    const z = finite(acceleration?.z);
    if (![x,y,z].every(Number.isFinite)) return null;
    const magnitude = Math.sqrt(x*x + y*y + z*z);
    if (!Number.isFinite(magnitude) || magnitude < 4) return null;
    const angle = screenAngle();
    const lateral = angle === 90 ? y : angle === 180 ? -x : angle === 270 ? -y : x;
    const remaining = Math.sqrt(Math.max(0,magnitude*magnitude - lateral*lateral));
    return Math.atan2(lateral,remaining) * 180 / Math.PI;
  }

  function clearNoEventTimer(){
    clearTimeout(state.noEventTimer);
    state.noEventTimer = 0;
  }

  function armNoEventTimer(){
    clearNoEventTimer();
    state.noEventTimer = window.setTimeout(() => {
      if (!state.attached || Date.now() - state.lastEventAt < NO_EVENT_MS) return;
      state.calibrated = false;
      state.calibrating = false;
      state.lean = null;
      state.status = state.explicitActivation ? 'no-data' : 'waiting';
      publish();
    },NO_EVENT_MS + 120);
  }

  function renderState(){
    const overlay = document.querySelector('#rideDashOverlay');
    if (!overlay) return;
    overlay.dataset.leanState = state.status;
    overlay.dataset.leanPermission = state.permission;
    overlay.dataset.leanRuntime = 'v2';
    overlay.querySelectorAll('.widget-lean').forEach(widget => {
      widget.setAttribute('role','button');
      widget.setAttribute('tabindex','0');
      const label = state.status === 'live'
        ? `Lean angle ${Math.round(Math.abs(state.lean || 0))} degrees. Tap to recalibrate.`
        : state.status === 'calibrating'
          ? 'Lean sensor calibrating. Hold the phone upright and still.'
          : 'Tap to enable the lean sensor.';
      widget.setAttribute('aria-label',label);
      widget.title = label;
    });
  }

  function publish(){
    const detail = {
      lean:state.calibrated && Number.isFinite(state.lean) ? state.lean : null,
      pitch:state.pitch,
      roll:state.roll,
      accel:state.accel,
      calibrated:state.calibrated,
      calibrating:state.calibrating,
      maxLean:state.maxLean,
      motionEnabled:state.attached,
      sensorStatus:state.status,
      source:'lean-v2'
    };
    window.MotoLeanState = detail;
    window.dispatchEvent(new CustomEvent('moto-motion-update',{detail}));
    renderState();
  }

  function beginCalibration(resetMax = false){
    if (resetMax) state.maxLean = 0;
    state.samples = [];
    state.sampleStartedAt = 0;
    state.baseline = null;
    state.lean = null;
    state.calibrated = false;
    state.calibrating = true;
    state.status = 'calibrating';
    state.lastScreenAngle = screenAngle();
    armNoEventTimer();
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
    state.sampleStartedAt = 0;
    window.dispatchEvent(new CustomEvent('moto-lean-calibrated',{detail:{automatic:true,source:'lean-v2',zero:baseline,screenAngle:screenAngle(),timestamp:Date.now()}}));
    publish();
  }

  function ingest(raw,source){
    if (!state.attached || !Number.isFinite(raw)) return;
    const now = Date.now();
    state.lastEventAt = now;
    clearNoEventTimer();

    const angle = screenAngle();
    if (state.lastScreenAngle !== null && angle !== state.lastScreenAngle) beginCalibration(false);
    state.lastScreenAngle = angle;

    if (state.calibrating || !state.calibrated) {
      if (!state.sampleStartedAt) state.sampleStartedAt = now;
      state.samples.push(raw);
      state.samples = state.samples.slice(-32);
      const duration = now - state.sampleStartedAt;
      if (state.samples.length >= CALIBRATION_SAMPLES && duration >= CALIBRATION_MIN_MS) {
        if (spread(state.samples) <= 6.5) finishCalibration();
        else {
          state.samples = state.samples.slice(-10);
          state.sampleStartedAt = now - 180;
        }
      }
      publish();
      armNoEventTimer();
      return;
    }

    let candidate = clamp(signedAngleDiff(raw,state.baseline),-MAX_LEAN,MAX_LEAN);
    if (Math.abs(candidate) < .6) candidate = 0;
    const weight = source === 'orientation' ? .28 : .18;
    state.lean = Number.isFinite(state.lean) ? state.lean * (1 - weight) + candidate * weight : candidate;
    if (Math.abs(state.lean) < .35) state.lean = 0;
    state.maxLean = Math.max(state.maxLean,Math.abs(state.lean));
    state.status = 'live';
    publish();
    armNoEventTimer();
  }

  function onOrientation(event){
    if (!state.attached) return;
    const raw = rawFromOrientation(event);
    state.pitch = finite(event.beta);
    state.roll = finite(event.gamma);
    if (!Number.isFinite(raw)) return;
    state.lastOrientationAt = Date.now();
    ingest(raw,'orientation');
  }

  function onMotion(event){
    if (!state.attached) return;
    const acceleration = event.accelerationIncludingGravity || event.acceleration || {};
    const x = finite(acceleration.x), y = finite(acceleration.y), z = finite(acceleration.z);
    if ([x,y,z].every(Number.isFinite)) state.accel = Math.sqrt(x*x + y*y + z*z) / 9.80665;
    state.lastMotionAt = Date.now();
    if (Date.now() - state.lastOrientationAt > 450) {
      const raw = rawFromGravity(acceleration);
      if (Number.isFinite(raw)) ingest(raw,'motion');
      else publish();
    } else {
      publish();
    }
  }

  function detach(){
    if (!state.attached) return;
    window.removeEventListener('deviceorientation',onOrientation);
    window.removeEventListener('deviceorientationabsolute',onOrientation);
    window.removeEventListener('devicemotion',onMotion);
    state.attached = false;
    clearNoEventTimer();
  }

  function attach({explicit = false} = {}){
    if (!('DeviceOrientationEvent' in window) && !('DeviceMotionEvent' in window)) {
      state.permission = 'unsupported';
      state.status = 'unsupported';
      publish();
      return false;
    }
    detach();
    state.explicitActivation = explicit || state.explicitActivation;
    window.addEventListener('deviceorientation',onOrientation,{passive:true});
    window.addEventListener('deviceorientationabsolute',onOrientation,{passive:true});
    window.addEventListener('devicemotion',onMotion,{passive:true});
    state.attached = true;
    state.lastEventAt = 0;
    state.lastOrientationAt = 0;
    state.lastMotionAt = 0;
    beginCalibration(false);
    return true;
  }

  async function requestPermissionsFromGesture(){
    const requests = [];
    try {
      if (typeof window.DeviceMotionEvent?.requestPermission === 'function') requests.push(window.DeviceMotionEvent.requestPermission());
      if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') requests.push(window.DeviceOrientationEvent.requestPermission());
      const results = requests.length ? await Promise.all(requests) : ['granted'];
      const granted = results.every(result => result === 'granted');
      savePermission(granted ? 'granted' : 'denied');
      return granted;
    } catch (error) {
      console.warn('Lean v2 permission request failed',error);
      savePermission('denied');
      return false;
    }
  }

  async function activate(){
    if (state.activating) return false;
    state.activating = true;
    state.explicitActivation = true;
    state.status = 'requesting';
    publish();
    try {
      const granted = await requestPermissionsFromGesture();
      if (!granted) {
        state.status = 'denied';
        state.calibrating = false;
        publish();
        return false;
      }
      attach({explicit:true});
      return true;
    } finally {
      state.activating = false;
    }
  }

  function recalibrate(){
    if (!state.attached || state.status === 'no-data' || state.status === 'waiting' || state.status === 'denied') return activate();
    beginCalibration(true);
    return true;
  }

  function installToolsBridge(){
    const tools = window.MotoRideTools;
    if (!tools || tools.__leanRuntimeV2) return Boolean(tools);
    tools.__leanRuntimeV2 = true;
    const previousGetState = typeof tools.getState === 'function' ? tools.getState.bind(tools) : () => ({});
    tools.getState = () => ({
      ...previousGetState(),
      motionEnabled:state.attached,
      leanCalibrated:state.calibrated,
      leanCalibrating:state.calibrating,
      maxLean:Math.max(Number(previousGetState()?.maxLean || 0),state.maxLean),
      sensorStatus:state.status,
      leanSource:'lean-v2'
    });
    tools.enableSensors = activate;
    tools.recalibrate = recalibrate;
    return true;
  }

  function handleWidgetActivation(event){
    const widget = event.target.closest?.('#rideDashOverlay .widget-lean');
    if (!widget || event.target.closest('.widgetEdit')) return;
    event.preventDefault();
    event.stopPropagation();
    void recalibrate();
  }

  document.addEventListener('click',handleWidgetActivation,true);
  document.addEventListener('keydown',event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('#rideDashOverlay .widget-lean')) handleWidgetActivation(event);
  },true);

  window.addEventListener('moto-permissions-change',event => {
    state.permission = event.detail?.motion || state.permission;
    if (state.permission === 'granted' && !state.attached) attach({explicit:false});
    else publish();
  });
  window.addEventListener('moto-ride-dash-opened',renderState);
  window.addEventListener('moto-ride-dash-rendered',renderState);
  window.addEventListener('moto-ride-dash-refreshed',renderState);
  window.addEventListener('orientationchange',() => { if (state.attached) beginCalibration(false); });
  window.addEventListener('pagehide',detach);

  let attempts = 0;
  const toolsTimer = setInterval(() => {
    attempts += 1;
    if (installToolsBridge() || attempts > 100) clearInterval(toolsTimer);
  },100);

  state.permission = window.MotoPermissions?.motion || rememberedPermission();
  if (state.permission === 'granted') attach({explicit:false});
  else if (state.permission === 'denied') state.status = 'denied';
  else if (state.permission === 'unsupported') state.status = 'unsupported';
  else state.status = 'waiting';

  window.MotoLeanRuntimeV2 = {activate,recalibrate,attach:() => attach({explicit:false}),getState:() => ({...state,samples:[...state.samples]})};
  setInterval(renderState,900);
  publish();
})();