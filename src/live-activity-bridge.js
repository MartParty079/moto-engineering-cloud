import { supabase } from './supabase.js';

const STORAGE_KEY = 'motoLiveActivityPreferences';
const METRICS = [
  ['speed', 'Speed'],
  ['speedLimit', 'Speed limit'],
  ['direction', 'Direction'],
  ['tripTime', 'Trip time'],
  ['mileage', 'Mileage']
];
const DEFAULT_PREFERENCES = {
  enabled: true,
  speed: true,
  speedLimit: true,
  direction: true,
  tripTime: true,
  mileage: true,
  primaryMetric: 'speed'
};

let rideVisible = false;
let nativeRideStarted = false;
let syncTimer = null;
let observer = null;

function nativeHandler() {
  return window.webkit?.messageHandlers?.motoLiveActivity || null;
}

function postNative(payload) {
  const handler = nativeHandler();
  if (!handler) return false;
  try {
    handler.postMessage(payload);
    return true;
  } catch (error) {
    console.warn('Moto Live Activity bridge failed', error);
    return false;
  }
}

function readPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const preferences = { ...DEFAULT_PREFERENCES, ...stored };
    if (!METRICS.some(([key]) => preferences[key])) preferences.speed = true;
    if (!METRICS.some(([key]) => key === preferences.primaryMetric && preferences[key])) {
      preferences.primaryMetric = METRICS.find(([key]) => preferences[key])?.[0] || 'speed';
    }
    return preferences;
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function savePreferences(preferences) {
  const normalized = { ...DEFAULT_PREFERENCES, ...preferences };
  if (!METRICS.some(([key]) => normalized[key])) normalized.speed = true;
  if (!normalized[normalized.primaryMetric]) {
    normalized.primaryMetric = METRICS.find(([key]) => normalized[key])?.[0] || 'speed';
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  postNative({ command: 'settings', preferences: normalized });
  if (!normalized.enabled) endNativeRide();
  else if (rideVisible) void startNativeRide();
  return normalized;
}

function numberFrom(selector) {
  const value = Number.parseFloat(document.querySelector(selector)?.textContent || '');
  return Number.isFinite(value) ? value : null;
}

function headingText(degrees) {
  if (!Number.isFinite(degrees)) return '—';
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
}

function activeRideRecord() {
  try {
    return JSON.parse(localStorage.getItem('motoActiveRide') || '{}');
  } catch {
    return {};
  }
}

function currentRideSnapshot() {
  const headingDegrees = numberFrom('#rideHeading');
  return {
    speedMph: numberFrom('#rideSpeed'),
    speedLimitMph: numberFrom('#rideSpeedLimitValue'),
    headingDegrees,
    headingText: headingText(headingDegrees),
    distanceMiles: numberFrom('#rideDistance'),
    elapsedText: document.querySelector('#rideClock')?.textContent?.trim() || '00:00:00',
    roadName: document.querySelector('#rideRoadName')?.textContent?.trim() || null,
    preferences: readPreferences(),
    updatedAt: new Date().toISOString()
  };
}

async function startNativeRide() {
  if (nativeRideStarted || !document.querySelector('#rideStop')) return;
  const preferences = readPreferences();
  if (!preferences.enabled) return;

  const record = activeRideRecord();
  const { data: { session } } = await supabase.auth.getSession();
  const startedAt = Number(record.startedAt) || Date.now();
  const sent = postNative({
    command: 'start',
    rideId: record.id || `local-${startedAt}`,
    bikeName: record.bikeName || document.querySelector('.liveBikeHero h3')?.textContent?.trim() || 'Motorcycle',
    startedAt: new Date(startedAt).toISOString(),
    apiBaseURL: window.location.origin,
    accessToken: session?.access_token || null,
    preferences,
    snapshot: currentRideSnapshot()
  });
  nativeRideStarted = sent;
}

function updateNativeRide() {
  if (!document.querySelector('#rideStop')) return;
  if (!nativeRideStarted) {
    void startNativeRide();
    return;
  }
  postNative({ command: 'update', snapshot: currentRideSnapshot() });
}

function endNativeRide() {
  if (!nativeRideStarted) return;
  postNative({ command: 'end', snapshot: currentRideSnapshot() });
  nativeRideStarted = false;
}

function attachSettings() {
  const modal = document.querySelector('#rideSettingsModal section');
  if (!modal || modal.querySelector('[data-live-activity-settings]')) return;

  const preferences = readPreferences();
  const saveButton = modal.querySelector('#saveRideSettings');
  if (!saveButton) return;

  const block = document.createElement('div');
  block.className = 'liveActivitySettings';
  block.dataset.liveActivitySettings = 'true';
  block.innerHTML = `
    <div class="liveActivitySettingsHead">
      <div><small>CARPLAY LIVE ACTIVITY</small><strong>Ride display</strong></div>
      <span class="liveActivityNativeStatus ${nativeHandler() ? 'connected' : ''}">${nativeHandler() ? 'iPhone wrapper connected' : 'Native wrapper required'}</span>
    </div>
    <label class="toggleRow"><input id="liveActivityEnabled" type="checkbox" ${preferences.enabled ? 'checked' : ''}> Enable Live Activity when a ride starts</label>
    <div class="liveActivityMetricGrid">
      ${METRICS.map(([key, label]) => `<label><input type="checkbox" data-live-metric="${key}" ${preferences[key] ? 'checked' : ''}> ${label}</label>`).join('')}
    </div>
    <label>Large CarPlay value
      <select id="liveActivityPrimary">
        ${METRICS.map(([key, label]) => `<option value="${key}" ${preferences.primaryMetric === key ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </label>
    <p class="liveActivityHelp">The primary value is largest. Other selected values appear when the available CarPlay or Lock Screen layout has room.</p>`;

  saveButton.before(block);
  saveButton.addEventListener('click', event => {
    const next = {
      enabled: block.querySelector('#liveActivityEnabled')?.checked ?? true,
      primaryMetric: block.querySelector('#liveActivityPrimary')?.value || 'speed'
    };
    block.querySelectorAll('[data-live-metric]').forEach(input => {
      next[input.dataset.liveMetric] = input.checked;
    });
    if (!METRICS.some(([key]) => next[key])) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('Select at least one Live Activity value.');
      return;
    }
    savePreferences(next);
  }, true);
}

function watchRideState() {
  const visible = Boolean(document.querySelector('#rideStop'));
  if (visible && !rideVisible) {
    rideVisible = true;
    void startNativeRide();
  } else if (!visible && rideVisible) {
    rideVisible = false;
    endNativeRide();
  }
  attachSettings();
}

function startMonitoring() {
  if (!observer) {
    observer = new MutationObserver(() => queueMicrotask(watchRideState));
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (!syncTimer) syncTimer = window.setInterval(updateNativeRide, 1000);
  watchRideState();
}

window.addEventListener('moto-native-ready', () => {
  nativeRideStarted = false;
  postNative({ command: 'settings', preferences: readPreferences() });
  void startNativeRide();
  attachSettings();
});

window.MotoLiveActivityBridge = {
  preferences: readPreferences,
  savePreferences,
  start: startNativeRide,
  update: updateNativeRide,
  end: endNativeRide,
  isNative: () => Boolean(nativeHandler())
};

startMonitoring();
