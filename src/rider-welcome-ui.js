import { mountMissionPreferences } from './rider-preferences.js';
import { mountOfflineNavigation } from './offline-navigation-ui.js';
import { mountRouteLibrary } from './route-library.js';
import { supabase } from './supabase.js';

const REMOVED_VIEWS = new Set(['roadmap', 'engineering', 'parts', 'pcb', 'firmware']);
const REMOVED_SEARCH_TYPES = new Set(['tasks', 'parts', 'firmware', 'engineering_items']);
let scanQueued = false;

const $ = selector => document.querySelector(selector);
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));
const setText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
const localDate = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const numberOrNull = value => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

function toast(message) {
  const node = $('#toast');
  if (!node) return;
  setText(node, message);
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2600);
}

function closeOverlay(id) {
  document.querySelector(`#${id}`)?.remove();
  if (!document.querySelector('.riderUtilityOverlay')) document.body.classList.remove('riderUtilityOpen');
}

function navigate(view) {
  $(`#nav [data-v="${view}"]`)?.click();
}


function removeEngineeringNavigation() {
  const nav = $('#nav');
  if (!nav) return;
  const activeRemoved = [...nav.querySelectorAll('[data-v].active')].some(button => REMOVED_VIEWS.has(button.dataset.v));

  nav.querySelectorAll('[data-v]').forEach(button => {
    if (REMOVED_VIEWS.has(button.dataset.v)) button.remove();
  });
  nav.querySelectorAll('.navGroup').forEach(group => {
    const label = group.querySelector('.navLabel')?.textContent.trim().toLowerCase();
    if (label === 'build' || !group.querySelector('button')) group.remove();
  });

  const intro = nav.querySelector('.navIntro');
  const introMarkup = '<span>MOTO MISSION</span><strong>Prepare · Ride · Review</strong><small>Map · Routes · Rides · Bike · Settings</small>';
  if (intro && intro.innerHTML !== introMarkup) intro.innerHTML = introMarkup;
  setText(nav.querySelector('.navFooter small'), 'Ride · Maintain · Explore');
  setText($('.brandCopy h1'), 'Moto Mission');
  setText($('.brandCopy p'), 'Prepare · Ride · Review');
  const search = $('#globalSearch');
  if (search && search.placeholder !== 'Search motorcycles, rides, maintenance…') search.placeholder = 'Search motorcycles, rides, maintenance…';

  if (activeRemoved) nav.querySelector('[data-v="dashboard"]')?.click();
}

function cleanVisibleCopy() {
  const authEyebrow = $('#auth')?.closest('.card')?.querySelector('.eyebrow');
  if (authEyebrow?.textContent.includes('ENGINEERING')) setText(authEyebrow, 'MARTY MOTO PARTY');
  const notesEyebrow = $('#main .section .eyebrow');
  if (notesEyebrow?.textContent.trim() === 'ENGINEERING NOTEBOOK') setText(notesEyebrow, 'RIDER NOTEBOOK');
}

function filterSearchResults() {
  document.querySelectorAll('#searchResults .item').forEach(item => {
    const type = item.querySelector('.sub')?.textContent.split('·')[0].trim();
    if (REMOVED_SEARCH_TYPES.has(type)) item.remove();
  });
  const box = $('#searchResults');
  if (box && !box.querySelector('.item') && !box.classList.contains('hidden') && box.textContent !== 'No rider records found.') {
    box.innerHTML = '<div class="empty">No rider records found.</div>';
  }
}

function renderWelcome() {
  const main = $('#main');
  if (!$('#nav [data-v="dashboard"]')?.classList.contains('active') || !main || main.dataset.accessBlocked || main.querySelector('.motoWelcomePage')) return;
  const username = $('.userButton b')?.textContent?.trim() || 'Rider';
  main.innerHTML = `<section class="motoWelcomePage">
    <header class="missionHeading"><div><span class="eyebrow">MAKE TIME FOR THE RIDE</span><h2>The miles ahead.</h2><p>Welcome back, ${esc(username)}. A little preparation. A lot more possibility.</p></div><span class="missionPill">Phone GPS · Invite-only</span></header>
    <section class="missionExplore"><div class="missionExploreCopy"><span class="eyebrow">EXPLORE YOUR NEXT CHAPTER</span><h3>Less planning.<br>More open road.</h3><p>Find your way, bring a route, and keep the moments that matter.</p><button class="primary" id="missionOpenMap" type="button">Explore the map <span aria-hidden="true">↗</span></button><small>Online map · Saved GPX tracks</small></div><div class="missionRouteArt" aria-hidden="true"><svg viewBox="0 0 560 360" fill="none"><path d="M-20 295C80 245 105 360 195 300S190 175 295 160 375 75 490 95 600 0 620 10"/><path d="M-40 240C50 180 120 265 175 220S195 105 295 100 405 15 475 35 570-35 610-50"/><path d="M-20 350C85 300 115 400 235 350S265 245 340 230 425 140 520 155 620 80 640 70"/><path class="missionRouteLine" d="M55 290C120 260 110 335 195 300S190 175 295 160 375 75 450 92"/><circle cx="55" cy="290" r="9"/><circle cx="450" cy="92" r="9"/></svg><span class="missionArtCaption">Go somewhere that stays with you.</span></div></section>
    <div class="missionSectionTitle"><h3>Ready when you are</h3><span>Your riding essentials</span></div>
    <div class="motoWelcomeActions"><button class="motoWelcomeAction" id="welcomeStartRide" type="button"><span class="icon" aria-hidden="true">↗</span><strong>Start a ride</strong><small>Record with phone GPS. Review it later.</small><span class="missionActionArrow" aria-hidden="true">→</span></button><button class="motoWelcomeAction" id="welcomeRoutes" type="button"><span class="icon" aria-hidden="true">⌁</span><strong>Prepare a route</strong><small>GPX, offline roads, and route weather.</small><span class="missionActionArrow" aria-hidden="true">→</span></button><button class="motoWelcomeAction" id="welcomeAddMaintenance" type="button"><span class="icon" aria-hidden="true">◇</span><strong>Add maintenance</strong><small>A well-kept bike is a ready bike.</small><span class="missionActionArrow" aria-hidden="true">→</span></button><button class="motoWelcomeAction" id="welcomeSettings" type="button"><span class="icon" aria-hidden="true">◎</span><strong>Make it yours</strong><small>Display, preferences, and security.</small><span class="missionActionArrow" aria-hidden="true">→</span></button></div>
    <aside class="missionQuietNote"><span aria-hidden="true">◎</span><p>Your phone is your starting point. Optional motorcycle hardware remains disconnected.</p><button type="button" class="ghost" id="welcomeDevices">Device status</button></aside>
  </section>`;
  $('#welcomeRoutes').onclick = () => navigate('routes');
  $('#welcomeDevices').onclick = () => navigate('devices');
  $('#missionOpenMap').onclick = () => openMissionMap(false);
  $('#welcomeStartRide').onclick = () => { if (window.MotoRide?.open) window.MotoRide.open(); else window.dispatchEvent(new CustomEvent('moto-ride-open-request')); };
  $('#welcomeAddMaintenance').onclick = () => void openMaintenanceModal();
  $('#welcomeSettings').onclick = openSettingsModal;
}

async function openMaintenanceModal() {
  closeOverlay('riderMaintenanceOverlay');
  const [{ data: sessionData }, { data: bikes, error: bikeError }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.from('bikes').select('id,name,year,make,model,odometer').order('created_at')
  ]);
  const session = sessionData.session;
  if (!session) return toast('Sign in before adding maintenance.');
  if (bikeError) console.warn('Could not load motorcycles for maintenance', bikeError);

  const overlay = document.createElement('div');
  overlay.id = 'riderMaintenanceOverlay';
  overlay.className = 'riderUtilityOverlay';
  overlay.innerHTML = `<section class="riderUtilityPanel" role="dialog" aria-modal="true" aria-label="Add maintenance"><header class="riderUtilityHeader"><div><span class="eyebrow">SERVICE RECORD</span><h2>Add Maintenance</h2></div><button class="riderUtilityClose" type="button" aria-label="Close">×</button></header><form class="riderMaintenanceForm" id="riderMaintenanceForm">
    <label class="full">SERVICE<input name="service" placeholder="Oil and filter change" required maxlength="160"></label>
    <label>MOTORCYCLE<select name="bike_id"><option value="">No motorcycle selected</option>${(bikes || []).map(bike => {
      const label = [bike.year, bike.make, bike.model].filter(Boolean).join(' ') || bike.name || 'Motorcycle';
      return `<option value="${esc(bike.id)}" data-bike-name="${esc(label)}" data-odometer="${esc(bike.odometer || '')}">${esc(label)}</option>`;
    }).join('')}</select></label>
    <label>SERVICE DATE<input name="service_date" type="date" value="${localDate()}"></label><label>ODOMETER (MI)<input name="odometer" type="number" min="0" step="0.1"></label><label>COST ($)<input name="cost" type="number" min="0" step="0.01"></label><label>NEXT DUE (MI)<input name="next_due_miles" type="number" min="0" step="1"></label><label>PARTS USED<input name="parts_used" maxlength="300" placeholder="Oil, filter, crush washer"></label><label class="full">NOTES<textarea name="notes" maxlength="2000" placeholder="Work performed, observations, torque checks…"></textarea></label><div class="riderMaintenanceActions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary" type="submit">Save Maintenance</button></div>
  </form></section>`;
  document.body.appendChild(overlay);
  document.body.classList.add('riderUtilityOpen');

  const close = () => closeOverlay('riderMaintenanceOverlay');
  overlay.querySelector('.riderUtilityClose').onclick = close;
  overlay.querySelector('[data-cancel]').onclick = close;
  overlay.onclick = event => { if (event.target === overlay) close(); };
  const bikeSelect = overlay.querySelector('[name="bike_id"]');
  const odometerInput = overlay.querySelector('[name="odometer"]');
  bikeSelect.onchange = () => {
    const odometer = bikeSelect.selectedOptions[0]?.dataset.odometer;
    if (!odometerInput.value && odometer) odometerInput.value = odometer;
  };

  overlay.querySelector('#riderMaintenanceForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    const payload = {
      user_id: session.user.id,
      service: String(data.get('service') || '').trim(),
      bike_id: data.get('bike_id') || null,
      bike: bikeSelect.selectedOptions[0]?.dataset.bikeName || null,
      service_date: data.get('service_date') || null,
      odometer: numberOrNull(data.get('odometer')),
      cost: numberOrNull(data.get('cost')),
      next_due_miles: numberOrNull(data.get('next_due_miles')),
      parts_used: String(data.get('parts_used') || '').trim() || null,
      notes: String(data.get('notes') || '').trim() || null,
      performed_by: session.user.email || null
    };
    if (!payload.service) return;
    submit.disabled = true;
    setText(submit, 'Saving…');
    const { error } = await supabase.from('maintenance').insert(payload);
    if (error) {
      submit.disabled = false;
      setText(submit, 'Save Maintenance');
      return toast(error.message || 'Maintenance could not be saved.');
    }
    close();
    localStorage.setItem('motoOpenAfterReload', 'maintenance');
    toast('Maintenance saved.');
    setTimeout(() => window.location.reload(), 450);
  };
}

function openSettingsModal() {
  closeOverlay('riderSettingsOverlay');
  const overlay = document.createElement('div');
  overlay.id = 'riderSettingsOverlay';
  overlay.className = 'riderUtilityOverlay';
  overlay.innerHTML = `<section class="riderUtilityPanel" role="dialog" aria-modal="true" aria-label="Settings"><header class="riderUtilityHeader"><div><span class="eyebrow">RIDER HUB</span><h2>Settings</h2></div><button class="riderUtilityClose" type="button" aria-label="Close">×</button></header><div class="riderSettingsGrid"><button class="riderSettingsChoice" type="button" data-setting="motorcycles"><span>🏍️</span><div><strong>Motorcycles</strong><small>Add, edit, and review motorcycle profiles.</small></div></button><button class="riderSettingsChoice" type="button" data-setting="display"><span>▦</span><div><strong>Ride Display</strong><small>Open the dashboard to adjust its style and layout.</small></div></button><button class="riderSettingsChoice" type="button" data-setting="security"><span>🔐</span><div><strong>Account & Security</strong><small>Password, MFA, sessions, and account controls.</small></div></button></div></section>`;
  document.body.appendChild(overlay);
  document.body.classList.add('riderUtilityOpen');
  const close = () => closeOverlay('riderSettingsOverlay');
  overlay.querySelector('.riderUtilityClose').onclick = close;
  overlay.onclick = event => { if (event.target === overlay) close(); };
  overlay.querySelector('[data-setting="motorcycles"]').onclick = () => { close(); navigate('garage'); };
  overlay.querySelector('[data-setting="display"]').onclick = () => { close(); window.MotoRide?.open?.() || window.dispatchEvent(new CustomEvent('moto-ride-open-request')); };
  overlay.querySelector('[data-setting="security"]').onclick = () => { close(); $('#securityCenterNav')?.click() || toast('Security settings are still loading.'); };
}

function openRequestedView() {
  const requested = localStorage.getItem('motoOpenAfterReload');
  if (!requested || !$('#nav')) return;
  localStorage.removeItem('motoOpenAfterReload');
  navigate(requested);
}

function scan() {
  scanQueued = false;
  removeEngineeringNavigation();
  cleanVisibleCopy();
  filterSearchResults();
  renderWelcome();
  openRequestedView();
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(scan);
}

function install() {
  scan();
  new MutationObserver(queueScan).observe($('#app') || document.body, { childList: true, subtree: true });
  document.addEventListener('input', event => {
    if (event.target?.id === 'globalSearch') setTimeout(filterSearchResults, 0);
  }, true);
  window.addEventListener('moto-page-ready', queueScan);
  window.addEventListener('pageshow', queueScan);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();


function openMissionMap(routes) {
  if (window.MotoRide?.getState?.().active) return toast('Return to Ride Mode while recording. Route setup is available after stopping.');
  const bridge = window.MotoAdventure;
  if (!bridge) return toast('Map tools are still loading. Try again.');
  routes ? bridge.openRoutes() : bridge.openMap();
}

export function renderMissionArea(view, main) {
  if (!['dashboard', 'routes', 'settings', 'devices'].includes(view)) return false;
  if (main.dataset.accessBlocked) return true;
  if (view === 'dashboard') renderWelcome();
  if (view === 'routes') {
    main.innerHTML = `<section class="missionPage"><header><span class="eyebrow">PREPARE</span><h2>Routes / GPX</h2><p>Good rides begin with a route. Import, preview, and plan here.</p></header><article class="card"><h3>Plan on the map</h3><p>Open the full map for saved tracks, layers, and route tools.</p><button id="missionRoutesOpen" class="primary" type="button">Open route map <span aria-hidden="true">↗</span></button></article><section id="missionRouteLibrary" class="missionRouteLibrary"></section><details class="missionDisclosure"><summary><span>Offline navigation</span><small>Download a small road network before you go</small></summary><section id="missionOfflineNavigation"></section></details><details class="missionDisclosure"><summary><span>Coverage & capabilities</span><small>What works online and offline</small></summary><div class="missionCapabilityGrid"><article class="card"><span class="missionState">Online map</span><h3>Follow a saved track</h3><p>Track guidance uses existing geometry. It does not provide offline turn-by-turn routing.</p></article><article class="card"><span class="missionState">OSM beta</span><h3>Offline packages</h3><p>Download small OSM road networks above for local routing and vector coverage. Large regional basemaps remain unavailable.</p></article><article class="card"><span class="missionState">Open-Meteo beta</span><h3>Weather along your route</h3><p>Choose Route weather on a saved route for arrival-time forecasts, previous three local days and rolling 72-hour estimates.</p></article></div></details></section>`;
    main.querySelector('#missionRoutesOpen').onclick = () => openMissionMap(true);
    void mountRouteLibrary(main.querySelector('#missionRouteLibrary'));
    void mountOfflineNavigation(main.querySelector('#missionOfflineNavigation')).catch(error=>{
      const host=main.querySelector('#missionOfflineNavigation');if(host)host.textContent=error.message;
    });
  }
  if (view === 'devices') {
    main.innerHTML = `<section class="missionPage"><header><span class="eyebrow">BIKE / DEVICES</span><h2>Device status</h2><p>Phone-first riding with explicit measurement sources.</p></header><div class="missionCapabilityGrid"><article class="card"><span class="missionState">Phone source</span><h3>GPS recording</h3><p>Ride Mode uses the existing local GPS recorder. Location permission and a valid GPS fix are required. Continuous iOS background capture is not guaranteed.</p><button class="secondary" type="button" id="missionDeviceRide">Open Ride Mode</button></article><article class="card"><span class="missionState">Disconnected / experimental</span><h3>Motorcycle IMU / ESP32</h3><p>No production hardware transport is connected. Phone motion is not guaranteed chassis lean. Calibration and quality validation are required.</p></article></div></section>`;
    main.querySelector('#missionDeviceRide').onclick = () => window.MotoRide?.open?.();
  }
  if (view === 'settings') {
    main.innerHTML = `<section class="missionPage"><header><span class="eyebrow">MAKE IT YOURS</span><h2>Settings</h2><p>Your display, your data, your peace of mind.</p></header><div class="missionSettingsActions"><button class="missionSettingsAction" type="button" id="missionPreferences"><span aria-hidden="true">◎</span><div><strong>Rider preferences</strong><small>Motorcycles and ride display</small></div><span aria-hidden="true">↗</span></button><button class="missionSettingsAction" type="button" id="missionSecurity"><span aria-hidden="true">◇</span><div><strong>Account security</strong><small>Password, MFA, and sessions</small></div><span aria-hidden="true">↗</span></button></div><section id="missionDataPreferences"></section><aside class="missionQuietNote"><p>Invitation-only access. Guest and local-only accounts remain deferred. Paused and interrupted rides remain recoverable on this device. Administrators retain role-gated controls in navigation.</p></aside></section>`;
    void mountMissionPreferences(main.querySelector('#missionDataPreferences')).catch(error=>{const host=main.querySelector('#missionDataPreferences');if(host)host.textContent=error.message});
    main.querySelector('#missionPreferences').onclick = openSettingsModal;
    main.querySelector('#missionSecurity').onclick = () => { const button=$('#securityCenterNav'); if(button)button.click();else toast('Security settings are still loading.'); };
  }
  return true;
}
