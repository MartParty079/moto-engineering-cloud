// Lightweight Ride Dash bridge for the primary MotoRideTools sensor pipeline.
// Sensor permission, listeners and moving calibration are owned by ride-safe-enhancements.js.
(() => {
  if(window.__motoLeanBridgeInstalled) return;
  window.__motoLeanBridgeInstalled = true;

  if(!document.getElementById('motoLeanBridgeStyles')){
    const style=document.createElement('style');
    style.id='motoLeanBridgeStyles';
    style.textContent='.leanCalibrationStatus{display:inline-flex;margin-top:8px;padding:5px 8px;border:1px solid color-mix(in srgb,var(--dash-accent,#22d3ee) 42%,transparent);border-radius:999px;font-size:.62rem;font-weight:800;letter-spacing:.09em;color:var(--dash-accent,#22d3ee);background:color-mix(in srgb,var(--dash-accent,#22d3ee) 9%,transparent)}.leanCalibrationStatus.live{color:#4ade80;border-color:rgba(74,222,128,.35);background:rgba(74,222,128,.08)}';
    document.head.appendChild(style);
  }

  let state = {
    lean:null,pitch:null,roll:null,accel:null,maxLean:0,
    calibrated:false,calibrating:false,motionEnabled:false,
    calibrationPhase:'permission',calibrationProgress:0,
    calibrationStatus:'SENSOR PERMISSION REQUIRED',source:'ride-tools'
  };

  function sensorStatus(){
    if(!state.motionEnabled) return 'permission';
    if(state.calibrated) return 'live';
    if(state.calibrating) return state.calibrationPhase || 'calibrating';
    return 'waiting';
  }

  function syncOverlay(){
    const overlay = document.querySelector('#rideDashOverlay');
    if(!overlay) return;
    const status = sensorStatus();
    overlay.dataset.leanState = status;
    overlay.dataset.leanPermission = window.MotoPermissions?.motion || (state.motionEnabled ? 'granted' : 'unknown');
    overlay.dataset.leanCalibration = state.calibrationPhase || status;
    overlay.querySelectorAll('.widget-lean').forEach(widget => {
      widget.setAttribute('role','button');
      widget.setAttribute('tabindex','0');
      const label = state.calibrated
        ? 'Lean angle live. Tap to recalibrate while moving straight.'
        : state.motionEnabled
          ? `${state.calibrationStatus || 'Waiting for automatic calibration'}. Tap to restart calibration.`
          : 'Enable motion sensors for lean angle.';
      widget.setAttribute('aria-label',label);
      widget.title = label;
      let badge=widget.querySelector('.leanCalibrationStatus');
      if(!badge){badge=document.createElement('span');badge.className='leanCalibrationStatus';widget.querySelector('.dashValue')?.appendChild(badge);}
      if(badge){badge.textContent=state.calibrated?'AUTO ZERO READY':(state.calibrationStatus || 'WAITING FOR SENSORS');badge.classList.toggle('live',Boolean(state.calibrated));}
    });
  }

  function publish(detail = {}){
    state = {...state,...detail,source:'ride-tools'};
    window.MotoLeanState = {...state,sensorStatus:sensorStatus()};
    syncOverlay();
  }

  async function activate(){
    const tools = window.MotoRideTools;
    if(!tools?.enableSensors){
      window.MotoPermissionController?.show?.();
      return;
    }
    if(tools.getState?.().motionEnabled){
      tools.recalibrate?.();
      return;
    }
    try{
      await tools.enableSensors({requestPermission:true,autoCalibrate:true,resetMax:true,reason:'lean-widget'});
    }catch(error){
      console.warn('Lean sensor activation failed',error);
      window.MotoPermissionController?.show?.();
    }
  }

  function handleActivation(event){
    const widget = event.target.closest?.('#rideDashOverlay .widget-lean');
    if(!widget || event.target.closest('.widgetEdit')) return;
    event.preventDefault();
    event.stopPropagation();
    void activate();
  }

  document.addEventListener('click',handleActivation,true);
  document.addEventListener('keydown',event => {
    if((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('#rideDashOverlay .widget-lean')) handleActivation(event);
  },true);

  window.addEventListener('moto-motion-update',event => publish(event.detail || {}));
  window.addEventListener('moto-ride-dash-opened',syncOverlay);
  window.addEventListener('moto-ride-dash-rendered',syncOverlay);
  window.addEventListener('moto-permissions-change',syncOverlay);
  window.addEventListener('moto-lean-calibration-started',syncOverlay);
  window.addEventListener('moto-lean-calibrated',syncOverlay);
  window.addEventListener('moto-ride-tools-ready',() => publish(window.MotoRideTools?.getState?.() || {}));

  publish(window.MotoRideTools?.getState?.() || {});
})();
