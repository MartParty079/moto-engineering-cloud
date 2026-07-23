// First-launch permission flow for GPS plus iPhone motion/orientation sensors.
// iOS requires motion permission requests to originate from a direct user gesture.
(() => {
  if (window.__motoStartupPermissionsInstalled) return;
  window.__motoStartupPermissionsInstalled = true;

  const STORAGE_KEY = 'moto-startup-permissions-v1';
  const state = { location: 'unknown', motion: 'unknown', gpsFix: 'unknown' };
  let sensorActivationPending = false;

  const publish = () => {
    window.MotoPermissions = { ...state };
    window.dispatchEvent(new CustomEvent('moto-permissions-change', { detail: { ...state } }));
  };

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: Date.now() }));
    } catch (_) {}
  };

  const requestLocation = () => new Promise(resolve => {
    if (!navigator.geolocation) {
      state.location = 'unsupported';
      state.gpsFix = 'unsupported';
      resolve(state.location);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        state.location = 'granted';
        state.gpsFix = 'ready';
        window.__motoGpsPublish?.(position);
        resolve(state.location);
      },
      error => {
        if (error?.code === 1) {
          state.location = 'denied';
          state.gpsFix = 'denied';
        } else {
          // TIMEOUT and POSITION_UNAVAILABLE indicate a missing fix, not a denied
          // permission. Keep permission granted and let watchPosition continue later.
          state.location = 'granted';
          state.gpsFix = 'pending';
          window.dispatchEvent(new CustomEvent('moto-gps-waiting',{
            detail:{reason:'permission-check',errorCode:error?.code || null}
          }));
        }
        resolve(state.location);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 }
    );
  });

  const requestMotion = async () => {
    const requests = [];
    try {
      if (typeof window.DeviceMotionEvent?.requestPermission === 'function') {
        requests.push(Promise.resolve(window.DeviceMotionEvent.requestPermission()));
      }
      if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') {
        requests.push(Promise.resolve(window.DeviceOrientationEvent.requestPermission()));
      }
      if (requests.length) {
        const results = await Promise.all(requests);
        state.motion = results.every(result => result === 'granted') ? 'granted' : 'denied';
      } else if ('DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window) {
        state.motion = 'granted';
      } else {
        state.motion = 'unsupported';
      }
    } catch (_) {
      state.motion = 'denied';
    }
    return state.motion;
  };

  const activateSensors = async (reason = 'startup-permission') => {
    if (state.motion !== 'granted' || sensorActivationPending) return;
    const tools = window.MotoRideTools;
    if (!tools?.enableSensors) {
      sensorActivationPending = true;
      const retry = () => {
        if (!sensorActivationPending) return;
        sensorActivationPending = false;
        void activateSensors(reason);
      };
      window.addEventListener('moto-ride-tools-ready', retry, { once: true });
      setTimeout(retry, 1500);
      return;
    }
    try {
      await tools.enableSensors({ requestPermission: false, autoCalibrate: true, reason });
    } catch (error) {
      console.warn('Sensor activation is waiting for a new permission gesture.', error);
    }
  };

  const removePrompt = () => document.getElementById('motoPermissionPrompt')?.remove();

  const showPrompt = () => {
    if (document.getElementById('motoPermissionPrompt')) return;

    if (!document.getElementById('motoPermissionPromptStyles')) {
      const style = document.createElement('style');
      style.id = 'motoPermissionPromptStyles';
      style.textContent = `
        #motoPermissionPrompt{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:end center;padding:18px;background:rgba(4,8,12,.62);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
        #motoPermissionPrompt .moto-permission-card{width:min(100%,460px);box-sizing:border-box;padding:22px;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:#111820;color:#fff;box-shadow:0 24px 70px rgba(0,0,0,.48);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        #motoPermissionPrompt h2{margin:0 0 8px;font-size:1.35rem;line-height:1.2}
        #motoPermissionPrompt p{margin:0 0 18px;color:#c7d0d9;line-height:1.45}
        #motoPermissionPrompt ul{margin:0 0 20px;padding:0;display:grid;gap:10px;list-style:none}
        #motoPermissionPrompt li{display:flex;gap:10px;align-items:flex-start;color:#edf3f8}
        #motoPermissionPrompt .moto-permission-actions{display:grid;gap:10px}
        #motoPermissionPrompt button{min-height:50px;border:0;border-radius:15px;font:inherit;font-weight:750;cursor:pointer}
        #motoPermissionPrompt [data-enable]{background:#f4512c;color:#fff}
        #motoPermissionPrompt [data-skip]{background:rgba(255,255,255,.08);color:#d6dde4}
        #motoPermissionPrompt .moto-permission-status{min-height:20px;margin:2px 0 0;font-size:.9rem;color:#aeb9c3}
      `;
      document.head.appendChild(style);
    }

    const prompt = document.createElement('section');
    prompt.id = 'motoPermissionPrompt';
    prompt.setAttribute('role', 'dialog');
    prompt.setAttribute('aria-modal', 'true');
    prompt.setAttribute('aria-labelledby', 'motoPermissionTitle');
    prompt.innerHTML = `
      <div class="moto-permission-card">
        <h2 id="motoPermissionTitle">Enable live ride sensors</h2>
        <p>Grant access once when Moto Mission opens. Lean data will automatically zero itself while you ride straight.</p>
        <ul>
          <li><span>📍</span><span><strong>Location</strong><br>Speed, road context, routes and heading.</span></li>
          <li><span>📱</span><span><strong>Motion sensors</strong><br>Lean, pitch, acceleration and braking data.</span></li>
          <li><span>◎</span><span><strong>Automatic calibration</strong><br>Starts after a stable straight section above 8 mph.</span></li>
        </ul>
        <div class="moto-permission-actions">
          <button type="button" data-enable>Enable ride data</button>
          <button type="button" data-skip>Not now</button>
          <div class="moto-permission-status" aria-live="polite"></div>
        </div>
      </div>`;

    const enable = prompt.querySelector('[data-enable]');
    const skip = prompt.querySelector('[data-skip]');
    const status = prompt.querySelector('.moto-permission-status');

    enable.addEventListener('click', async () => {
      enable.disabled = true;
      skip.disabled = true;
      status.textContent = 'Requesting location and motion access…';

      // Both calls begin inside this click handler so iOS accepts them.
      const locationPromise = requestLocation();
      const motionPromise = requestMotion();
      const [location, motion] = await Promise.all([locationPromise, motionPromise]);

      save();
      publish();
      if (motion === 'granted') await activateSensors('initial-app-open');
      const gpsText = state.gpsFix === 'pending' ? ' GPS signal will connect when available.' : '';
      status.textContent = motion === 'granted'
        ? `Location: ${location}. Sensors ready.${gpsText}`
        : `Location: ${location}. Sensors: ${motion}.${gpsText}`;
      setTimeout(removePrompt, 900);
    });

    skip.addEventListener('click', () => {
      if (state.location === 'unknown') state.location = 'skipped';
      if (state.motion === 'unknown') state.motion = 'skipped';
      save();
      publish();
      removePrompt();
    });

    document.body.appendChild(prompt);
  };

  const initialize = () => {
    let remembered = null;
    try { remembered = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) {}

    if (remembered?.location) state.location = remembered.location;
    if (remembered?.motion) state.motion = remembered.motion;
    if (remembered?.gpsFix) state.gpsFix = remembered.gpsFix;
    publish();

    if (state.location === 'granted') {
      requestLocation().then(() => { save(); publish(); });
    }
    if (state.motion === 'granted') void activateSensors('remembered-permission');

    if (state.location !== 'granted' || state.motion !== 'granted') showPrompt();
  };

  window.MotoPermissionController = {
    show: showPrompt,
    requestLocation,
    requestMotion,
    activateSensors,
    getState: () => ({ ...state })
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();