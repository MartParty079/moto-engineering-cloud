// Startup permission flow for location + iPhone motion/orientation sensors.
// iOS requires motion permission to be requested from a direct user gesture.
(() => {
  if (window.__motoStartupPermissionsInstalled) return;
  window.__motoStartupPermissionsInstalled = true;

  const STORAGE_KEY = 'moto-startup-permissions-v1';
  const state = {
    location: 'unknown',
    motion: 'unknown'
  };

  const publish = () => {
    window.MotoPermissions = { ...state };
    window.dispatchEvent(new CustomEvent('moto-permissions-change', {
      detail: { ...state }
    }));
  };

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        location: state.location,
        motion: state.motion,
        updatedAt: Date.now()
      }));
    } catch (_) {}
  };

  const requestLocation = () => new Promise(resolve => {
    if (!navigator.geolocation) {
      state.location = 'unsupported';
      resolve(state.location);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        state.location = 'granted';
        window.__motoGpsPublish?.(position);
        resolve(state.location);
      },
      error => {
        state.location = error?.code === 1 ? 'denied' : 'unavailable';
        resolve(state.location);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  });

  const requestMotion = async () => {
    const requesters = [
      window.DeviceMotionEvent?.requestPermission,
      window.DeviceOrientationEvent?.requestPermission
    ].filter(fn => typeof fn === 'function');

    if (requesters.length) {
      try {
        const results = [];
        for (const request of requesters) {
          results.push(await request.call(
            request === window.DeviceMotionEvent?.requestPermission
              ? window.DeviceMotionEvent
              : window.DeviceOrientationEvent
          ));
        }
        state.motion = results.every(result => result === 'granted') ? 'granted' : 'denied';
      } catch (_) {
        state.motion = 'denied';
      }
      return state.motion;
    }

    if ('DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window) {
      state.motion = 'granted';
    } else {
      state.motion = 'unsupported';
    }
    return state.motion;
  };

  const removePrompt = () => document.getElementById('motoPermissionPrompt')?.remove();

  const showPrompt = () => {
    if (document.getElementById('motoPermissionPrompt')) return;

    const style = document.createElement('style');
    style.id = 'motoPermissionPromptStyles';
    style.textContent = `
      #motoPermissionPrompt{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:end center;padding:18px;background:rgba(4,8,12,.58);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
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

    const prompt = document.createElement('section');
    prompt.id = 'motoPermissionPrompt';
    prompt.setAttribute('role', 'dialog');
    prompt.setAttribute('aria-modal', 'true');
    prompt.setAttribute('aria-labelledby', 'motoPermissionTitle');
    prompt.innerHTML = `
      <div class="moto-permission-card">
        <h2 id="motoPermissionTitle">Enable live ride data</h2>
        <p>Location and phone sensors make maps, heading, speed, and ride tracking update more smoothly.</p>
        <ul>
          <li><span>📍</span><span><strong>Location</strong><br>GPS position, speed, route, and heading.</span></li>
          <li><span>📱</span><span><strong>Motion sensors</strong><br>Phone orientation and smoother heading behavior.</span></li>
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
      status.textContent = 'Requesting location and sensor access…';

      const [location, motion] = await Promise.all([
        requestLocation(),
        requestMotion()
      ]);

      save();
      publish();
      status.textContent = `Location: ${location}. Sensors: ${motion}.`;
      setTimeout(removePrompt, 650);
    });

    skip.addEventListener('click', () => {
      state.location = 'skipped';
      state.motion = 'skipped';
      save();
      publish();
      removePrompt();
    });

    document.body.appendChild(prompt);
  };

  const initialize = async () => {
    publish();

    // Show on each fresh app launch until both permissions have been granted.
    let remembered = null;
    try { remembered = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) {}

    if (remembered?.location === 'granted' && remembered?.motion === 'granted') {
      state.location = 'granted';
      state.motion = 'granted';
      publish();
      // Refresh GPS immediately; this normally does not re-prompt once granted.
      requestLocation().then(() => { save(); publish(); });
      return;
    }

    showPrompt();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
