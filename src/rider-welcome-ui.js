import {mountWorkspace} from './workspace-ui.js';
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
  const introMarkup = '<span>MOTO MISSION</span><strong>Prepare · Ride · Review</strong><small>Map · Ride Center · Weather · Garage · Settings</small>';
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

export async function openMaintenanceModal() {
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


export function renderMissionArea(view,main){return mountWorkspace(view,main,{openSettingsModal,openMaintenanceModal});}
