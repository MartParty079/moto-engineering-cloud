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
  }

  function lockSensorTools() {
    const tools = window.MotoRideTools;
    if (!tools) return false;

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
  window.addEventListener('pageshow', lockSensorTools);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lockSensorTools();
  });

  // Bounded fallbacks cover modules that were already evaluating when this file loaded.
  queueMicrotask(lockSensorTools);
  setTimeout(lockSensorTools, 750);
})();
