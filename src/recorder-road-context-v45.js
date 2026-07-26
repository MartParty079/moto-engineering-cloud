import { supabase } from './supabase.js';

// Road context for the isolated recorder. This module deliberately loads before
// recording-isolation.js so its bounded road updates reach the recorder UI before
// the isolation boundary stops downstream event fan-out.
(() => {
  if (window.__motoRecorderRoadContextV45Installed) return;
  window.__motoRecorderRoadContextV45Installed = true;

  const CACHE_KEY = 'moto-road-context-cache-v45';
  const MAX_CACHE_ROWS = 180;
  const FRESH_MS = 24 * 60 * 60 * 1000;
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;
  const MIN_LOOKUP_MS = 15_000;
  const TIMED_REFRESH_MS = 180_000;
  const MOVE_REFRESH_MI = 0.08;
  const TURN_REFRESH_DEG = 30;

  const state = {
    active: false,
    busy: false,
    lastLookupAt: 0,
    lastPoint: null,
    lastHeading: null,
    latestGps: null,
    context: null,
    timer: 0,
    requestCount: 0,
    cacheHits: 0,
    errors: 0,
    online: navigator.onLine
  };

  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const rad = value => value * Math.PI / 180;
  const haversineMiles = (a, b) => {
    if (!a || !b) return Infinity;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 3958.7613 * 2 * Math.asin(Math.sqrt(q));
  };
  const angleDiff = (a, b) => !Number.isFinite(a) || !Number.isFinite(b) ? Infinity : Math.abs(((a - b + 540) % 360) - 180);
  const pointFrom = detail => {
    const lat = finite(detail?.latitude ?? detail?.lat);
    const lon = finite(detail?.longitude ?? detail?.lon);
    if (lat === null || lon === null) return null;
    return {
      lat,
      lon,
      heading: finite(detail?.heading),
      speed: finite(detail?.speed ?? detail?.speedMph),
      accuracy: finite(detail?.accuracy),
      timestamp: finite(detail?.timestamp) || Date.now()
    };
  };
  const cacheKey = point => `${point.lat.toFixed(3)}:${point.lon.toFixed(3)}:${Math.round((point.heading || 0) / 45) % 8}`;
  const loadCache = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; }
    catch { return {}; }
  };
  const saveCache = cache => {
    try {
      const rows = Object.entries(cache).sort((a, b) => Number(b[1]?.savedAt || 0) - Number(a[1]?.savedAt || 0)).slice(0, MAX_CACHE_ROWS);
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(rows)));
    } catch {}
  };

  function normalize(data, meta = {}) {
    const limit = finite(data?.limit?.mph ?? data?.limit?.display ?? data?.limit_mph ?? data?.speedLimit);
    return {
      road: data?.road || data?.name || data?.street || null,
      limit_mph: limit,
      source: data?.source || meta.source || 'MotoCloud',
      roadClass: data?.roadClass || data?.road_class || data?.classification || null,
      surface: data?.surface || null,
      lanes: finite(data?.lanes),
      confidence: finite(data?.confidence),
      cached: Boolean(meta.cached),
      stale: Boolean(meta.stale),
      offline: !navigator.onLine,
      reason: meta.reason || 'update',
      recordedAt: new Date().toISOString(),
      savedAt: Date.now()
    };
  }

  function publish(context) {
    state.context = context;
    window.MotoRoadContext = { ...context };
    window.dispatchEvent(new CustomEvent('moto-road-update', { detail: context }));
    render();
  }

  function cachedFor(point, allowStale = false) {
    const row = loadCache()[cacheKey(point)];
    if (!row) return null;
    const age = Date.now() - Number(row.savedAt || 0);
    if (age > (allowStale ? STALE_MS : FRESH_MS)) return null;
    state.cacheHits += 1;
    return normalize(row, { cached: true, stale: age > FRESH_MS, source: row.source || 'CACHE', reason: allowStale ? 'offline cache' : 'cache' });
  }

  async function lookup(point, reason = 'manual') {
    if (!state.active || state.busy || !point) return state.context;
    const now = Date.now();
    if (now - state.lastLookupAt < MIN_LOOKUP_MS && reason !== 'initial') return state.context;

    const fresh = cachedFor(point, false);
    if (fresh && reason !== 'turned') {
      state.lastLookupAt = now;
      state.lastPoint = point;
      state.lastHeading = point.heading;
      publish(fresh);
      return fresh;
    }

    if (!navigator.onLine) {
      const stale = cachedFor(point, true);
      if (stale) publish(stale);
      else publish(normalize({}, { cached: false, stale: true, source: 'OFFLINE', reason: 'offline unavailable' }));
      return state.context;
    }

    state.busy = true;
    state.requestCount += 1;
    state.lastLookupAt = now;
    try {
      const provider = localStorage.getItem('motoRoadProvider') || 'auto';
      const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon), provider });
      if (Number.isFinite(point.heading)) params.set('heading', String(point.heading));
      if (Number.isFinite(point.speed)) params.set('speed', String(point.speed));
      if (state.lastPoint) {
        params.set('prevLat', String(state.lastPoint.lat));
        params.set('prevLon', String(state.lastPoint.lon));
      }
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { Accept: 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);
      const response = await fetch(`/api/road-info?${params}`, { headers, signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeout);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Road HTTP ${response.status}`);
      const context = normalize(data, { source: data.source || 'MotoCloud', reason });
      const cache = loadCache();
      cache[cacheKey(point)] = context;
      saveCache(cache);
      state.lastPoint = point;
      state.lastHeading = point.heading;
      publish(context);
      return context;
    } catch (error) {
      state.errors += 1;
      const fallback = cachedFor(point, true);
      if (fallback) publish({ ...fallback, reason: 'network fallback' });
      else publish(normalize({}, { source: 'UNAVAILABLE', stale: true, reason: error?.name === 'AbortError' ? 'timeout' : 'lookup error' }));
      return state.context;
    } finally {
      state.busy = false;
    }
  }

  function evaluate(point) {
    if (!state.active || !point) return;
    const moved = haversineMiles(state.lastPoint, point);
    const turned = angleDiff(state.lastHeading, point.heading);
    const age = Date.now() - state.lastLookupAt;
    if (!state.lastLookupAt) void lookup(point, 'initial');
    else if (moved >= MOVE_REFRESH_MI) void lookup(point, 'moved');
    else if (turned >= TURN_REFRESH_DEG) void lookup(point, 'turned');
    else if (age >= TIMED_REFRESH_MS) void lookup(point, 'timed');
    render();
  }

  function addStyles() {
    if (document.querySelector('style[data-road-context-v45]')) return;
    const style = document.createElement('style');
    style.dataset.roadContextV45 = '1';
    style.textContent = `
      #motoRecordingIsolation .recRoadContext{display:grid;grid-template-columns:1.35fr .65fr;gap:10px;padding:14px;border:1px solid rgba(56,189,248,.24);border-radius:17px;background:#07111a}
      #motoRecordingIsolation .recRoadContext article{min-width:0}
      #motoRecordingIsolation .recRoadContext small{display:block;color:#7dd3fc;font-size:8px;font-weight:900;letter-spacing:.14em}
      #motoRecordingIsolation .recRoadContext strong{display:block;margin-top:7px;font-size:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #motoRecordingIsolation .recRoadContext span{display:block;margin-top:7px;color:#8fa1b5;font-size:9px;font-weight:900;letter-spacing:.09em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #motoRecordingIsolation .recRoadLimit{text-align:center;border-left:1px solid rgba(148,163,184,.14);padding-left:10px}
      #motoRecordingIsolation .recRoadLimit strong{font-size:34px}
      #motoRecordingIsolation .recRoadLimit.over strong,#motoRecordingIsolation .recRoadLimit.over span{color:#fb7185}
      @media(max-width:390px){#motoRecordingIsolation .recRoadContext{grid-template-columns:1fr .72fr;padding:12px}#motoRecordingIsolation .recRoadContext strong{font-size:18px}}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    const shell = document.querySelector('#motoRecordingIsolation .recShell');
    if (!shell || document.getElementById('recRoadContext')) return false;
    addStyles();
    const section = document.createElement('section');
    section.id = 'recRoadContext';
    section.className = 'recRoadContext';
    section.innerHTML = `<article><small>ROAD CONTEXT</small><strong id="recRoadName">SEARCHING</strong><span id="recRoadMeta">LIVE LOOKUP · ONLINE</span></article><article id="recRoadLimitCard" class="recRoadLimit"><small>SPEED LIMIT</small><strong id="recRoadLimitValue">--</strong><span id="recRoadLimitMeta">SEARCHING</span></article>`;
    const grid = shell.querySelector('.recGrid');
    grid?.insertAdjacentElement('afterend', section);
    render();
    return true;
  }

  function render() {
    const context = state.context || {};
    const ride = window.MotoRide?.getState?.() || {};
    const speed = finite(ride.speedMph ?? state.latestGps?.speed) || 0;
    const limit = finite(context.limit_mph);
    const roadName = context.road || (state.busy ? 'SEARCHING' : 'ROAD UNKNOWN');
    const source = context.cached ? (context.stale ? 'STALE CACHE' : 'CACHED') : (context.source || (state.online ? 'LIVE' : 'OFFLINE'));
    const extras = [context.roadClass, context.surface, context.lanes ? `${context.lanes} LANES` : null].filter(Boolean).join(' · ');
    const meta = `${source}${extras ? ` · ${extras.toUpperCase()}` : ''} · ${state.online ? 'ONLINE' : 'OFFLINE'}`;
    const limitMeta = limit === null ? (state.busy ? 'SEARCHING' : source) : speed > limit + 1 ? `${Math.round(speed - limit)} MPH OVER` : source;
    const card = document.getElementById('recRoadLimitCard');
    document.getElementById('recRoadName')?.replaceChildren(document.createTextNode(String(roadName).toUpperCase()));
    document.getElementById('recRoadMeta')?.replaceChildren(document.createTextNode(meta));
    document.getElementById('recRoadLimitValue')?.replaceChildren(document.createTextNode(limit === null ? '--' : String(Math.round(limit))));
    document.getElementById('recRoadLimitMeta')?.replaceChildren(document.createTextNode(limitMeta));
    card?.classList.toggle('over', limit !== null && speed > limit + 1);
  }

  function start() {
    state.active = true;
    state.online = navigator.onLine;
    state.lastLookupAt = 0;
    state.lastPoint = null;
    state.lastHeading = null;
    setTimeout(mount, 0);
    setTimeout(mount, 100);
    clearInterval(state.timer);
    state.timer = setInterval(() => evaluate(state.latestGps), 15_000);
    if (state.latestGps) setTimeout(() => void lookup(state.latestGps, 'initial'), 350);
  }

  function stop() {
    state.active = false;
    clearInterval(state.timer);
    state.timer = 0;
  }

  window.addEventListener('moto-recording-isolation-change', event => event.detail?.active ? start() : stop());
  window.addEventListener('moto-gps-fix', event => {
    const point = pointFrom(event.detail);
    if (!point) return;
    state.latestGps = point;
    if (state.active) evaluate(point);
  }, true);
  window.addEventListener('online', () => {
    state.online = true;
    if (state.active && state.latestGps) void lookup(state.latestGps, 'online restored');
    render();
  });
  window.addEventListener('offline', () => {
    state.online = false;
    if (state.active && state.latestGps) {
      const cached = cachedFor(state.latestGps, true);
      if (cached) publish(cached);
    }
    render();
  });

  window.MotoRecorderRoadContext = {
    refresh: () => lookup(state.latestGps, 'manual'),
    getState: () => ({ ...state, context: state.context ? { ...state.context } : null })
  };
})();