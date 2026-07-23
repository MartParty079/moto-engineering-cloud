// Temporary iPhone motion-sensor kill switch.
// GPS/location remain enabled; DeviceMotion and DeviceOrientation are disabled until
// the Ride UI is stable enough to reintroduce them safely.
(() => {
  const IS_IPHONE = /iphone|ipod/i.test(navigator.userAgent);
  if (!IS_IPHONE || window.__motoIphoneMotionDisableInstalled) return;

  window.__motoIphoneMotionDisableInstalled = true;
  window.__motoIphoneMotionDisabled = true;
  document.documentElement.dataset.iphoneMotion = 'disabled';

  const STORE = 'moto-startup-permissions-v1';
  const disabledState = {
    motion: 'disabled',
    motionDisabledReason: 'iphone-stability',
    motionDisabledAt: Date.now()
  };

  function persistDisabledState() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch {}
    try { localStorage.setItem(STORE, JSON.stringify({ ...saved, ...disabledState, updatedAt: Date.now() })); } catch {}
    window.MotoPermissions = { ...(window.MotoPermissions || {}), ...disabledState };
  }

  function disabledSensorResult() {
    return Promise.resolve({
      enabled: false,
      disabled: true,
      platform: 'iphone',
      reason: 'iphone-stability'
    });
  }

  function cleanDisabledWidgets() {
    document.querySelectorAll('#rideDashOverlay .widget-lean,#rideDashOverlay .widget-maxLean,#rideDashOverlay .widget-cornerSpeed,#rideDashOverlay .widget-accel').forEach(widget => {
      widget.removeAttribute('role');
      widget.removeAttribute('tabindex');
      widget.title = 'iPhone motion sensors are temporarily disabled.';
      widget.setAttribute('aria-label','iPhone motion sensors temporarily disabled');
      widget.querySelectorAll('.leanCalibrationStatus,.leanCalibrationHint,.leanPermissionHint,.dashLeanHint,[data-lean-calibration-status]').forEach(node => node.remove());
      widget.querySelectorAll('*').forEach(node => {
        if(node.children.length) return;
        const text=String(node.textContent||'').trim();
        if(/tap\s+to\s+(enable|recalibrate)|sensor\s+permission\s+required|enable\s+motion\s+sensors/i.test(text)) node.remove();
      });
    });
  }

  function publishDisabledMotion() {
    window.dispatchEvent(new CustomEvent('moto-motion-update', {
      detail: {
        lean: null,
        pitch: null,
        roll: null,
        accel: null,
        calibrated: false,
        calibrating: false,
        calibrationPhase: 'disabled',
        calibrationProgress: 0,
        calibrationStatus: 'IPHONE SENSORS DISABLED',
        motionEnabled: false,
        disabled: true,
        disabledReason: 'iphone-stability',
        automaticCalibration: false,
        maxLean: 0
      }
    }));
    queueMicrotask(cleanDisabledWidgets);
  }

  function lockSensorTools() {
    const tools = window.MotoRideTools;
    if (!tools) {
      cleanDisabledWidgets();
      return false;
    }

    try { tools.disableSensors?.(); } catch {}
    tools.enableSensors = disabledSensorResult;
    tools.resumeSensors = disabledSensorResult;
    tools.recalibrate = disabledSensorResult;

    window.MotoLeanCalibration = {
      start: () => false,
      getState: () => ({
        calibrated: false,
        calibrating: false,
        phase: 'disabled',
        progress: 0,
        status: 'IPHONE SENSORS DISABLED',
        zero: 0,
        maxLean: 0,
        disabled: true,
        reason: 'iphone-stability'
      })
    };

    persistDisabledState();
    publishDisabledMotion();
    cleanDisabledWidgets();
    window.dispatchEvent(new CustomEvent('moto-iphone-motion-disabled', {
      detail: { disabled: true, reason: 'iphone-stability' }
    }));
    return true;
  }

  const style = document.createElement('style');
  style.dataset.iphoneMotionDisabled = '1';
  style.textContent = `
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="lean"] .dashValue,
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="maxLean"] .dashValue,
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="cornerSpeed"] .dashValue,
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="accel"] .dashValue{font-size:0!important}
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="lean"] .dashValue::after,
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="maxLean"] .dashValue::after,
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="cornerSpeed"] .dashValue::after,
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="accel"] .dashValue::after{content:"SENSORS OFF";display:block;font-size:.78rem;font-weight:900;letter-spacing:.14em;color:#8f9bac}
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="lean"],
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="maxLean"],
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="cornerSpeed"],
    html[data-iphone-motion="disabled"] #rideDashOverlay [data-widget="accel"]{cursor:default}
  `;
  document.head.appendChild(style);

  persistDisabledState();
  window.addEventListener('moto-ride-tools-ready', lockSensorTools);
  window.addEventListener('moto-ride-dash-opened', () => queueMicrotask(lockSensorTools));
  window.addEventListener('moto-ride-dash-rendered', () => queueMicrotask(cleanDisabledWidgets));
  window.addEventListener('moto-ride-dash-refreshed', () => queueMicrotask(cleanDisabledWidgets));
  window.addEventListener('pageshow', lockSensorTools);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lockSensorTools();
  });

  // Bounded fallbacks cover modules that were already evaluating when this file loaded.
  queueMicrotask(lockSensorTools);
  setTimeout(lockSensorTools, 750);
})();