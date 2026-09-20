const rad = degrees => degrees * Math.PI / 180;
const finite = value => typeof value === 'number' && Number.isFinite(value);
export const angleDifference = (a, b) => ((a - b + 540) % 360) - 180;

// W3C Z-X'-Y'' orientation matrix, projected onto the screen plane.
// Only suitable for a near-vertical screen facing the rider, not a flat mount.
export function screenTilt(beta, gamma, screenAngle = 0) {
  if (![beta, gamma, screenAngle].every(finite) || Math.abs(beta) > 180 || Math.abs(gamma) > 90) return null;
  const x = -Math.cos(rad(beta)) * Math.sin(rad(gamma));
  const y = Math.sin(rad(beta));
  const lateral = x * Math.cos(rad(screenAngle)) + y * Math.sin(rad(screenAngle));
  const vertical = -x * Math.sin(rad(screenAngle)) + y * Math.cos(rad(screenAngle));
  if (Math.hypot(lateral, vertical) < 0.5) return null;
  return Math.atan2(-lateral, vertical) * 180 / Math.PI;
}

export class LeanEstimate {
  constructor() { this.reset(); }
  reset() { this.baseline = null; this.samples = []; this.lean = null; this.left = 0; this.right = 0; this.lastAt = 0; this.screen = null; this.calibrating = true; this.status = 'Calibrate upright'; }
  invalidate(message) { this.baseline = null; this.samples = []; this.lean = null; this.calibrating = false; this.status = message; }
  sample(beta, gamma, screen, now) {
    const raw = screenTilt(beta, gamma, screen);
    if (raw === null) { this.invalidate('Sensor or mount unavailable — recalibrate'); return; }
    if (this.screen !== null && this.screen !== screen) this.invalidate('Screen rotated — recalibrate');
    this.screen = screen;
    if (this.lastAt && now - this.lastAt > 2000) this.invalidate('Sensor interrupted — recalibrate');
    this.lastAt = now;
    if (this.baseline === null) {
      if (!this.calibrating) return;
      this.samples.push({ raw, now });
      const first = this.samples[0];
      if (Math.abs(angleDifference(raw, first.raw)) > 2) { this.samples = [{ raw, now }]; }
      this.status = 'Hold the motorcycle upright and still';
      if (this.samples.length >= 15 && now - this.samples[0].now >= 750) {
        this.baseline = this.samples[0].raw + this.samples.reduce((sum, s) => sum + angleDifference(s.raw, this.samples[0].raw), 0) / this.samples.length;
        this.lean = 0; this.status = 'Phone estimate';
      }
      return;
    }
    const lean = angleDifference(raw, this.baseline);
    if (Math.abs(lean) > 75) { this.invalidate('Mount moved — recalibrate'); return; }
    this.lean = this.lean === null ? lean : this.lean + .2 * angleDifference(lean, this.lean);
    this.left = Math.max(this.left, -this.lean);
    this.right = Math.max(this.right, this.lean);
    this.status = 'Phone estimate';
  }
}

export function createLeanTracker(onChange) {
  const estimate = new LeanEstimate();
  let enabled = false, pending = false, timer = null, generation = 0;
  let waitingSince = 0;
  const publish = () => onChange({ ...estimate, enabled, pending });
  const angle = () => window.screen?.orientation?.angle ?? window.orientation ?? 0;
  const onOrientation = event => { if (!enabled || document.hidden) return; estimate.sample(event.beta, event.gamma, angle(), Date.now()); publish(); };
  function stop() {
    generation++; enabled = false; pending = false;
    window.removeEventListener('deviceorientation', onOrientation);
    clearInterval(timer); timer = null;
    estimate.reset(); estimate.status = 'Lean disabled'; publish();
  }
  async function enable() {
    if (pending || enabled) return;
    const token = ++generation;
    pending = true; estimate.status = 'Requesting sensor access'; publish();
    try {
      if (!window.isSecureContext || !window.DeviceOrientationEvent) throw new Error('Orientation sensor unavailable');
      const api = window.DeviceOrientationEvent;
      if (api.requestPermission && await api.requestPermission() !== 'granted') throw new Error('Sensor permission denied');
      if (token !== generation) return;
      enabled = true; estimate.reset();
      window.addEventListener('deviceorientation', onOrientation);
      waitingSince = Date.now();
      timer = setInterval(() => {
        if (document.hidden || Date.now() - (estimate.lastAt || waitingSince) > 2000) {
          estimate.invalidate(document.hidden ? 'Paused — recalibrate on return' : 'No sensor data — recalibrate'); publish();
        }
      }, 500);
    } catch (error) { if (token === generation) estimate.status = error.message; }
    finally { if (token === generation) { pending = false; publish(); } }
  }
  return { enable, stop, resetPeaks() { estimate.left = 0; estimate.right = 0; publish(); }, calibrate() { waitingSince = Date.now(); estimate.reset(); publish(); }, getState: () => ({ ...estimate, enabled, pending }) };
}
