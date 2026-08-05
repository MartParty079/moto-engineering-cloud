import { supabase } from './supabase.js';

const REMOVED_VIEWS = new Set(['roadmap', 'engineering', 'parts', 'pcb', 'firmware']);
const REMOVED_SEARCH_TYPES = new Set(['tasks', 'parts', 'firmware', 'engineering_items', 'pcb_projects', 'pcb_components', 'pcb_pins', 'pcb_connectors', 'pcb_revisions']);
let scanQueued = false;

const $ = selector => document.querySelector(selector);
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

function localDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function numberOrNull(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2600);
}

function closeOverlay(id) {
  document.querySelector(`#${id}`)?.remove();
  document.body.classList.remove('riderUtilityOpen');
}

function navigate(view) {
  document.querySelector(`#nav [data-v="${view}"]`)?.click();
}

function installStyles() {
  if ($('#riderWelcomeStyles')) return;
  const style = document.createElement('style');
  style.id = 'riderWelcomeStyles';
  style.textContent = `
    .motoWelcomePage{display:grid;gap:22px;max-width:1180px;margin:0 auto;padding:4px 0 34px}
    .motoWelcomeHero{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(250px,.65fr);gap:20px;align-items:stretch;padding:30px;border-radius:28px;background:linear-gradient(135deg,rgba(244,81,44,.16),rgba(25,30,38,.96));border:1px solid rgba(255,255,255,.09);box-shadow:0 22px 60px rgba(0,0,0,.24)}
    .motoWelcomeHero h2{font-size:clamp(2rem,5vw,4rem);line-height:.96;margin:8px 0 14px;letter-spacing:-.05em}
    .motoWelcomeHero p{max-width:650px;font-size:1.03rem;line-height:1.65;margin:0;color:var(--muted,#aab1bd)}
    .motoWelcomeBadge{display:flex;flex-direction:column;justify-content:flex-end;min-height:210px;padding:22px;border-radius:22px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.08)}
    .motoWelcomeBadge span{font-size:2.8rem}.motoWelcomeBadge strong{font-size:1.25rem;margin-top:12px}.motoWelcomeBadge small{margin-top:6px;color:var(--muted,#aab1bd)}
    .motoWelcomeActions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
    .motoWelcomeAction{appearance:none;text-align:left;display:flex;flex-direction:column;min-height:190px;padding:22px;border-radius:24px;border:1px solid rgba(255,255,255,.09);background:var(--card,#151a22);color:inherit;cursor:pointer;transition:transform .16s ease,border-color .16s ease,background .16s ease}
    .motoWelcomeAction:hover,.motoWelcomeAction:focus-visible{transform:translateY(-3px);border-color:rgba(244,81,44,.6);background:rgba(244,81,44,.09);outline:none}
    .motoWelcomeAction .icon{font-size:2rem;margin-bottom:auto}.motoWelcomeAction strong{font-size:1.28rem;margin-top:26px}.motoWelcomeAction small{margin-top:7px;color:var(--muted,#aab1bd);line-height:1.45}
    .riderUtilityOverlay{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:18px;background:rgba(3,6,10,.78);backdrop-filter:blur(12px)}
    .riderUtilityPanel{width:min(680px,100%);max-height:min(880px,92vh);overflow:auto;padding:24px;border-radius:26px;background:var(--card,#151a22);border:1px solid rgba(255,255,255,.1);box-shadow:0 30px 90px rgba(0,0,0,.45)}
    .riderUtilityHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:22px}.riderUtilityHeader h2{margin:3px 0 0}.riderUtilityClose{width:42px;height:42px;border-radius:50%;font-size:1.4rem}
    .riderMaintenanceForm{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.riderMaintenanceForm label{display:grid;gap:7px;font-size:.82rem;font-weight:700;letter-spacing:.04em}.riderMaintenanceForm label.full{grid-column:1/-1}.riderMaintenanceForm input,.riderMaintenanceForm select,.riderMaintenanceForm textarea{width:100%;box-sizing:border-box}.riderMaintenanceForm textarea{min-height:120px;resize:vertical}.riderMaintenanceActions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px;margin-top:6px}
    .riderSettingsGrid{display:grid;gap:12px}.riderSettingsChoice{display:flex;align-items:center;gap:16px;width:100%;padding:18px;border-radius:18px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.03);color:inherit;text-align:left;cursor:pointer}.riderSettingsChoice:hover{border-color:rgba(244,81,44,.55);background:rgba(244,81,44,.08)}.riderSettingsChoice span{font-size:1.55rem}.riderSettingsChoice strong{display:block}.riderSettingsChoice small{display:block;margin-top:4px;color:var(--muted,#aab1bd)}
    body.riderUtilityOpen{overflow:hidden}
    @media(max-width:760px){.motoWelcomeHero{grid-template-columns:1fr;padding:23px}.motoWelcomeBadge{min-height:130px}.motoWelcomeActions{grid-template-columns:1fr}.motoWelcomeAction{min-height:145px}.riderMaintenanceForm{grid-template-columns:1fr}.riderMaintenanceForm label.full,.riderMaintenanceActions{grid-column:1}}
  `;
  document.head.appendChild(style);
}

function removeEngineeringNavigation() {
  const nav = $('#nav');
  if (!nav) return;

  const activeRemoved = [...nav.querySelectorAll('[data-v].active')]
    .some(button => REMOVED_VIEWS.has(button.dataset.v));

  nav.querySelectorAll('[data-v]').forEach(button => {
    if (REMOVED_VIEWS.has(button.dataset.v)) button.remove();
  });

  nav.querySelectorAll('.navGroup').forEach(group => {
    const label = group.querySelector('.navLabel')?.textContent.trim().toLowerCase();
    if (label === 'build' || !group.querySelector('button')) group.remove();
  });

  const intro = nav.querySelector('.navIntro');
  if (intro) intro.innerHTML = '<span>RIDER HUB</span><strong>Moto Mission</strong><small>Ride, maintain, and manage</small>';
  const footerCopy = nav.querySelector('.navFooter small');
  if (footerCopy) footerCopy.textContent = 'Ride · Maintain · Explore';

  const brandTitle = $('.brandCopy h1');
  const brandSubtitle = $('.brandCopy p');
  if (brandTitle) brandTitle.textContent = 'Marty Moto Party';
  if (brandSubtitle) brandSubtitle.textContent = 'Rider hub';

  const search = $('#globalSearch');
  if (search) search.placeholder = 'Search motorcycles, rides, maintenance…';

  if (activeRemoved) nav.querySelector('[data-v="dashboard"]')?.click();
}

function cleanVisibleCopy() {
  const authEyebrow = $('#auth')?.closest('.card')?.querySelector('.eyebrow');
  if (authEyebrow?.textContent.includes('ENGINEERING')) authEyebrow.textContent = 'MARTY MOTO PARTY';
  const notesEyebrow = $('#main .section .eyebrow');
  if (notesEyebrow?.textContent.trim() === 'ENGINEERING NOTEBOOK') notesEyebrow.textContent = 'RIDER NOTEBOOK';
}

function filterSearchResults() {
  document.querySelectorAll('#searchResults .item').forEach(item => {
    const type = item.querySelector('.sub')?.textContent.split('·')[0].trim();
    if (REMOVED_SEARCH_TYPES.has(type)) item.remove();
  });
  const box = $('#searchResults');
  if (box && !box.querySelector('.item') && !box.classList.contains('hidden')) {
    box.innerHTML = '<div class="empty">No rider records found.</div>';
  }
}

function renderWelcome() {
  const overview = $('#nav [data-v="dashboard"]');
  const main = $('#main');
  if (!overview?.classList.contains('active') || !main) return;
  if (main.querySelector('.motoWelcomePage')) return;

  const username = $('.userButton b')?.textContent?.trim() || 'Rider';
  main.innerHTML = `<section class="motoWelcomePage">
    <div class="motoWelcomeHero">
      <div><span class="eyebrow">WELCOME BACK</span><h2>Ready to ride, ${esc(username)}?</h2><p>Start a ride, record maintenance, or adjust your motorcycle and account settings from one clean home screen.</p></div>
      <div class="motoWelcomeBadge"><span>🏍️</span><strong>Moto Mission</strong><small>Your motorcycles and rides, without the engineering workspace.</small></div>
    </div>
    <div class="motoWelcomeActions">
      <button class="motoWelcomeAction" id="welcomeStartRide"><span class="icon">▶</span><strong>Start Ride</strong><small>Open the ride dashboard and begin GPS recording.</small></button>
      <button class="motoWelcomeAction" id="welcomeAddMaintenance"><span class="icon">🔧</span><strong>Add Maintenance</strong><small>Log service, mileage, parts, cost, and notes.</small></button>
      <button class="motoWelcomeAction" id="welcomeSettings"><span class="icon">⚙</span><strong>Settings</strong><small>Manage motorcycles, ride display, and account security.</small></button>
    </div>
  </section>`;

  $('#welcomeStartRide').onclick = () => {
    if (window.MotoRide?.open) window.MotoRide.open();
    else window.dispatchEvent(new CustomEvent('moto-ride-open-request'));
  };
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

  const rows = bikes || [];
  const overlay = document.createElement('div');
  overlay.id = 'riderMaintenanceOverlay';
  overlay.className = 'riderUtilityOverlay';
  overlay.innerHTML = `<section class="riderUtilityPanel" role="dialog" aria-modal="true" aria-label="Add maintenance">
    <header class="riderUtilityHeader"><div><span class="eyebrow">SERVICE RECORD</span><h2>Add Maintenance</h2></div><button class="riderUtilityClose" type="button" aria-label="Close">×</button></header>
    <form class="riderMaintenanceForm" id="riderMaintenanceForm">
      <label class="full">SERVICE<input name="service" placeholder="Oil and filter change" required maxlength="160"></label>
      <label>MOTORCYCLE<select name="bike_id"><option value="">No motorcycle selected</option>${rows.map(bike => {
        const label = [bike.year, bike.make, bike.model].filter(Boolean).join(' ') || bike.name || 'Motorcycle';
        return `<option value="${esc(bike.id)}" data-bike-name="${esc(label)}" data-odometer="${esc(bike.odometer || '')}">${esc(label)}</option>`;
      }).join('')}</select></label>
      <label>SERVICE DATE<input name="service_date" type="date" value="${localDate()}"></label>
      <label>ODOMETER (MI)<input name="odometer" type="number" min="0" step="0.1" inputmode="decimal"></label>
      <label>COST ($)<input name="cost" type="number" min="0" step="0.01" inputmode="decimal"></label>
      <label>NEXT DUE (MI)<input name="next_due_miles" type="number" min="0" step="1" inputmode="numeric"></label>
      <label>PARTS USED<input name="parts_used" maxlength="300" placeholder="Oil, filter, crush washer"></label>
      <label class="full">NOTES<textarea name="notes" maxlength="2000" placeholder="Work performed, observations, torque checks…"></textarea></label>
      <div class="riderMaintenanceActions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary" type="submit">Save Maintenance</button></div>
    </form>
  </section>`;
  document.body.appendChild(overlay);
  document.body.classList.add('riderUtilityOpen');

  const close = () => closeOverlay('riderMaintenanceOverlay');
  overlay.querySelector('.riderUtilityClose').onclick = close;
  overlay.querySelector('[data-cancel]').onclick = close;
  overlay.onclick = event => { if (event.target === overlay) close(); };

  const bikeSelect = overlay.querySelector('[name="bike_id"]');
  const odometerInput = overlay.querySelector('[name="odometer"]');
  bikeSelect.onchange = () => {
    const option = bikeSelect.selectedOptions[0];
    if (!odometerInput.value && option?.dataset.odometer) odometerInput.value = option.dataset.odometer;
  };

  overlay.querySelector('#riderMaintenanceForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    const selected = bikeSelect.selectedOptions[0];
    const payload = {
      user_id: session.user.id,
      service: String(data.get('service') || '').trim(),
      bike_id: data.get('bike_id') || null,
      bike: selected?.dataset.bikeName || null,
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
    submit.textContent = 'Saving…';
    const { error } = await supabase.from('maintenance').insert(payload);
    if (error) {
      submit.disabled = false;
      submit.textContent = 'Save Maintenance';
      toast(error.message || 'Maintenance could not be saved.');
      return;
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
  overlay.innerHTML = `<section class="riderUtilityPanel" role="dialog" aria-modal="true" aria-label="Settings">
    <header class="riderUtilityHeader"><div><span class="eyebrow">RIDER HUB</span><h2>Settings</h2></div><button class="riderUtilityClose" type="button" aria-label="Close">×</button></header>
    <div class="riderSettingsGrid">
      <button class="riderSettingsChoice" type="button" data-setting="motorcycles"><span>🏍️</span><div><strong>Motorcycles</strong><small>Add, edit, and review motorcycle profiles.</small></div></button>
      <button class="riderSettingsChoice" type="button" data-setting="display"><span>▦</span><div><strong>Ride Display</strong><small>Open the dashboard to adjust its style and layout.</small></div></button>
      <button class="riderSettingsChoice" type="button" data-setting="security"><span>🔐</span><div><strong>Account & Security</strong><small>Password, MFA, sessions, and account controls.</small></div></button>
    </div>
  </section>`;
  document.body.appendChild(overlay);
  document.body.classList.add('riderUtilityOpen');
  const close = () => closeOverlay('riderSettingsOverlay');
  overlay.querySelector('.riderUtilityClose').onclick = close;
  overlay.onclick = event => { if (event.target === overlay) close(); };
  overlay.querySelector('[data-setting="motorcycles"]').onclick = () => { close(); navigate('garage'); };
  overlay.querySelector('[data-setting="display"]').onclick = () => {
    close();
    if (window.MotoRide?.open) window.MotoRide.open();
    else window.dispatchEvent(new CustomEvent('moto-ride-open-request'));
  };
  overlay.querySelector('[data-setting="security"]').onclick = () => {
    close();
    const security = $('#securityCenterNav');
    if (security) security.click();
    else toast('Security settings are still loading.');
  };
}

function openRequestedView() {
  const requested = localStorage.getItem('motoOpenAfterReload');
  if (!requested || !$('#nav')) return;
  localStorage.removeItem('motoOpenAfterReload');
  navigate(requested);
}

function scan() {
  scanQueued = false;
  installStyles();
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
  const root = $('#app') || document.body;
  new MutationObserver(queueScan).observe(root, { childList: true, subtree: true });
  document.addEventListener('input', event => {
    if (event.target?.id === 'globalSearch') setTimeout(filterSearchResults, 0);
  }, true);
  window.addEventListener('moto-page-ready', queueScan);
  window.addEventListener('pageshow', queueScan);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
