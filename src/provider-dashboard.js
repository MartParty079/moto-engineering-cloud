import { supabase } from './supabase.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

let userId = null;

function injectNav() {
  const nav = $('#nav');
  if (!nav || $('#providerDashboardNav')) return;
  const button = document.createElement('button');
  button.id = 'providerDashboardNav';
  button.type = 'button';
  button.innerHTML = '<span class="navIcon">◌</span><span>Data Providers</span><em>STATUS</em>';
  button.onclick = openDashboard;
  const administration = [...nav.querySelectorAll('.navGroup')].find(group => group.querySelector('.navLabel')?.textContent.trim() === 'Administration');
  (administration || nav).appendChild(button);
}

function providerCard(name, key, cap, used, configured, note) {
  const remaining = cap == null ? null : Math.max(0, cap - used);
  const percent = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const state = configured ? 'ready' : 'missing';
  return `<article class="providerCard ${state}">
    <header><div><small>${esc(key)}</small><h3>${esc(name)}</h3></div><span>${configured ? 'READY' : 'KEY MISSING'}</span></header>
    ${cap == null ? '<strong>Unlimited free fallback</strong>' : `<strong>${used.toLocaleString()} / ${cap.toLocaleString()}</strong><div class="providerMeter"><i style="width:${percent}%"></i></div><p>${remaining.toLocaleString()} requests remaining this month</p>`}
    <footer>${esc(note)}</footer>
  </article>`;
}

async function loadDashboard() {
  const status = $('#providerDashboardStatus');
  const grid = $('#providerDashboardGrid');
  if (!status || !grid || !userId) return;
  status.textContent = 'Checking provider configuration and monthly usage…';
  try {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [healthResponse, settingsResult, usageResult] = await Promise.all([
      fetch('/api/provider-health', { cache: 'no-store' }),
      supabase.from('road_provider_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('road_api_usage').select('provider,request_count,last_request_at').eq('user_id', userId).eq('month_start', monthStart.toISOString().slice(0, 10))
    ]);
    const health = healthResponse.ok ? await healthResponse.json() : {};
    const settings = settingsResult.data || { google_monthly_cap: 4500, tomtom_monthly_cap: 2200, google_places_monthly_cap: 500 };
    const usage = Object.fromEntries((usageResult.data || []).map(row => [row.provider, row]));
    const count = provider => Number(usage[provider]?.request_count || 0);
    grid.innerHTML = [
      providerCard('Google Roads', 'ROAD SNAP + SPEED', Number(settings.google_monthly_cap || 4500), count('google'), Boolean(health.googleRoads?.configured), usage.google?.last_request_at ? `Last request ${new Date(usage.google.last_request_at).toLocaleString()}` : 'No requests this month'),
      providerCard('Google Places', 'ADVENTURE POI', Number(settings.google_places_monthly_cap || 500), count('google_places'), Boolean(health.googlePlaces?.configured), usage.google_places?.last_request_at ? `Last request ${new Date(usage.google_places.last_request_at).toLocaleString()}` : 'No requests this month'),
      providerCard('TomTom', 'ROAD SNAP + ATTRIBUTES', Number(settings.tomtom_monthly_cap || 2200), count('tomtom'), Boolean(health.tomTom?.configured), usage.tomtom?.last_request_at ? `Last request ${new Date(usage.tomtom.last_request_at).toLocaleString()}` : 'No requests this month'),
      providerCard('OpenStreetMap', 'FREE FALLBACK', null, 0, true, 'Used automatically when a paid provider is unavailable or capped')
    ].join('');
    status.textContent = 'Hard caps are enforced by the backend. Counts reset at the start of each calendar month.';
  } catch (error) {
    status.textContent = `Provider status unavailable: ${error.message || error}`;
  }
}

function openDashboard() {
  $('#providerDashboardOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'providerDashboardOverlay';
  overlay.innerHTML = `<section class="providerDashboardShell">
    <header><div><small>API SAFETY & HEALTH</small><h2>Data Providers</h2></div><button id="closeProviderDashboard" type="button" aria-label="Close">×</button></header>
    <p id="providerDashboardStatus">Loading…</p>
    <div id="providerDashboardGrid"></div>
    <button id="refreshProviderDashboard" class="providerRefresh" type="button">REFRESH STATUS</button>
  </section>`;
  document.body.appendChild(overlay);
  $('#closeProviderDashboard').onclick = () => overlay.remove();
  $('#refreshProviderDashboard').onclick = loadDashboard;
  overlay.onclick = event => { if (event.target === overlay) overlay.remove(); };
  loadDashboard();
}

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  userId = session?.user?.id || null;
  if (!userId) return;
  injectNav();
  const observer = new MutationObserver(() => queueMicrotask(injectNav));
  observer.observe(document.querySelector('#app') || document.body, { childList: true, subtree: true });
}

supabase.auth.onAuthStateChange((_event, session) => {
  userId = session?.user?.id || null;
  if (userId) queueMicrotask(injectNav);
});

init();
