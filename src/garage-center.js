import { supabase } from './supabase.js';

const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];
const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, m => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[m]));
const num = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const money = value => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2
}).format(num(value) || 0);
const miles = value => `${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 1, maximumFractionDigits: 1
})} mi`;
const hours = seconds => `${(Number(seconds || 0) / 3600).toLocaleString('en-US', {
  minimumFractionDigits: 1, maximumFractionDigits: 1
})} hr`;
const duration = seconds => {
  const safe = Math.max(0, Number(seconds || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};
const fullDate = value => value ? new Date(value).toLocaleString() : '—';
const shortDate = value => value ? new Date(value).toLocaleDateString(undefined, {
  month: 'short', day: 'numeric', year: 'numeric'
}) : '—';
const dateInput = value => value ? new Date(value).toISOString().slice(0, 10) : '';
const bikeLabel = bike => [bike?.year, bike?.make, bike?.model].filter(Boolean).join(' ') || bike?.name || 'Motorcycle';
const cssImage = url => url
  ? `url('${String(url).replace(/['\\\n\r]/g, '')}')`
  : 'linear-gradient(145deg,#1b2836,#0a0f15 72%)';

const MOD_STATUSES = ['Planned', 'Ordered', 'Installed', 'Removed'];
const MOD_CATEGORIES = [
  'Engine', 'Exhaust', 'ECU & Tuning', 'Suspension', 'Wheels & Tires',
  'Lighting', 'Protection', 'Luggage', 'Controls', 'Electronics',
  'Navigation', 'Bodywork', 'Comfort', 'Other'
];

let session = null;
let loading = false;
let queued = false;
let cache = {
  bikes: [], rides: [], intervals: [], tires: [], fuel: [], mods: [], maintenance: []
};

async function rows(label, query) {
  const { data, error } = await query;
  if (error) {
    console.warn(`${label} unavailable`, error);
    return [];
  }
  return data || [];
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    if (!session) {
      const { data } = await supabase.auth.getSession();
      session = data.session;
    }
    const [bikes, rides, intervals, tires, fuel, mods, maintenance] = await Promise.all([
      rows('Motorcycles', supabase.from('bikes').select('*').order('created_at', { ascending: false })),
      rows('Ride totals', supabase.from('ride_sessions')
        .select('id,bike_id,status,started_at,duration_seconds,distance_miles,max_speed_mph,average_speed_mph,max_lean_deg')
        .order('started_at', { ascending: false }).limit(1500)),
      rows('Maintenance schedule', supabase.from('maintenance_intervals').select('*').order('item_name')),
      rows('Tire profiles', supabase.from('tire_profiles').select('*').order('created_at', { ascending: false }).limit(500)),
      rows('Fuel entries', supabase.from('fuel_entries').select('*').order('filled_at', { ascending: false }).limit(500)),
      rows('Aftermarket mods', supabase.from('bike_mods').select('*').order('created_at', { ascending: false }).limit(1000)),
      rows('Maintenance history', supabase.from('maintenance').select('*').order('service_date', { ascending: false }).limit(1000))
    ]);
    cache = { bikes, rides, intervals, tires, fuel, mods, maintenance };
  } finally {
    loading = false;
  }
}

function related(id) {
  const same = row => String(row.bike_id) === String(id);
  return {
    rides: cache.rides.filter(same),
    intervals: cache.intervals.filter(same),
    tires: cache.tires.filter(same),
    fuel: cache.fuel.filter(same),
    mods: cache.mods.filter(same),
    maintenance: cache.maintenance.filter(same)
  };
}

function rideTotals(list) {
  const completed = list.filter(row => row.status === 'complete');
  return completed.reduce((acc, row) => {
    acc.seconds += Number(row.duration_seconds || 0);
    acc.miles += Number(row.distance_miles || 0);
    acc.speed = Math.max(acc.speed, Number(row.max_speed_mph || 0));
    const lean = Number(row.max_lean_deg);
    if (Number.isFinite(lean)) acc.lean = Math.max(acc.lean, Math.abs(lean));
    acc.count += 1;
    return acc;
  }, { seconds: 0, miles: 0, speed: 0, lean: 0, count: 0, completed });
}

function modTotals(list) {
  return list.reduce((acc, mod) => {
    const status = MOD_STATUSES.includes(mod.status) ? mod.status : 'Planned';
    acc[status.toLowerCase()] += 1;
    acc.totalCost += Number(mod.cost || 0);
    if (status === 'Installed') acc.installedCost += Number(mod.cost || 0);
    return acc;
  }, { planned: 0, ordered: 0, installed: 0, removed: 0, totalCost: 0, installedCost: 0 });
}

function maintenanceTotals(list) {
  return list.reduce((acc, row) => {
    acc.cost += Number(row.cost || 0);
    acc.count += 1;
    return acc;
  }, { cost: 0, count: 0 });
}

function cardId(card) {
  const ref = card.querySelector('[data-edit^="bikes:"]')?.dataset.edit
    || card.querySelector('[data-del^="bikes:"]')?.dataset.del;
  return (ref || '').split(':')[1] || card.dataset.bikeProfile || '';
}

function serviceState(bike, rideData, intervals) {
  const odometer = Number(bike.odometer || 0);
  const rideHours = rideData.seconds / 3600;
  const active = intervals.filter(row => row.enabled !== false);
  if (!active.length) return { label: 'Service plan not set', detail: 'Open Quick settings', warn: false };
  const calculated = active.map(row => ({
    ...row,
    milesRemaining: Number(row.interval_miles) > 0
      ? Number(row.last_service_miles || 0) + Number(row.interval_miles) - odometer
      : Infinity,
    hoursRemaining: Number(row.interval_hours) > 0
      ? Number(row.last_service_hours || 0) + Number(row.interval_hours) - rideHours
      : Infinity
  }));
  const due = calculated.filter(row => row.milesRemaining <= 0 || row.hoursRemaining <= 0);
  if (due.length) {
    return {
      label: `${due.length} service item${due.length === 1 ? '' : 's'} due`,
      detail: due.slice(0, 2).map(row => row.item_name).join(', '),
      warn: true
    };
  }
  const next = calculated.filter(row => Number.isFinite(row.milesRemaining))
    .sort((a, b) => a.milesRemaining - b.milesRemaining)[0]
    || calculated.filter(row => Number.isFinite(row.hoursRemaining))
      .sort((a, b) => a.hoursRemaining - b.hoursRemaining)[0];
  if (!next) return { label: 'Service plan active', detail: `${active.length} tracked items`, warn: false };
  return {
    label: 'Service current',
    detail: Number.isFinite(next.milesRemaining)
      ? `${next.item_name} in ${Math.round(next.milesRemaining).toLocaleString()} mi`
      : `${next.item_name} in ${next.hoursRemaining.toFixed(1)} hr`,
    warn: false
  };
}

function beforeDrawer(host, node) {
  const drawer = host.querySelector(':scope > .garageCompactDrawer');
  drawer ? host.insertBefore(node, drawer) : host.appendChild(node);
}

function ensurePhaseTwoActions(card, bike) {
  const grid = card.querySelector('.garagePrimaryActions');
  if (!grid) return;
  if (!grid.querySelector('[data-gc-log-service]')) {
    const service = document.createElement('button');
    service.type = 'button';
    service.dataset.gcLogService = bike.id;
    service.innerHTML = '<i>✓</i><span>Log Service</span>';
    service.onclick = event => {
      event.stopPropagation();
      void openMaintenanceForm(bike, null, false);
    };
    grid.appendChild(service);
  }
  if (!grid.querySelector('[data-gc-add-mod]')) {
    const mod = document.createElement('button');
    mod.type = 'button';
    mod.dataset.gcAddMod = bike.id;
    mod.innerHTML = '<i>＋</i><span>Add Mod</span>';
    mod.onclick = event => {
      event.stopPropagation();
      void openModForm(bike, null, false);
    };
    grid.appendChild(mod);
  }
}

function enhanceCard(card, bike) {
  const data = related(bike.id);
  const rides = rideTotals(data.rides);
  const lastRide = rides.completed[0];
  const service = serviceState(bike, rides, data.intervals);
  const tire = data.tires.find(row => row.active) || data.tires[0];
  const mods = modTotals(data.mods);

  card.dataset.bikeProfile = bike.id;
  card.classList.add('garageCardCompact', 'motorcycleSelectable');
  card.tabIndex = 0;
  card.setAttribute('role', 'link');
  card.setAttribute('aria-label', `Open ${bike.name || bikeLabel(bike)} Garage Center`);
  card.style.setProperty('--bike-card-image', cssImage(bike.image_url));

  const host = card.querySelector(':scope > div') || card;
  let status = card.querySelector('.garageCardStatus');
  if (!status) {
    status = document.createElement('div');
    status.className = 'garageCardStatus';
  }
  status.innerHTML = `
    <span class="${service.warn ? 'warn' : ''}">${esc(service.label)}</span>
    <span>${lastRide ? `Last ride ${shortDate(lastRide.started_at)}` : 'No rides yet'}</span>
    <span>${mods.installed} installed mod${mods.installed === 1 ? '' : 's'}</span>
    ${tire ? `<span>${esc(tire.name || tire.wheel_setup || 'Tire setup')}</span>` : ''}`;
  const top = host.querySelector(':scope > .rowtop');
  top ? top.after(status) : host.prepend(status);

  let summary = card.querySelector('.bikeCardTotals');
  if (!summary) {
    summary = document.createElement('div');
    summary.className = 'bikeCardTotals';
  }
  summary.innerHTML = `
    <span><small>TOTAL MILEAGE</small><b>${miles(bike.odometer)}</b></span>
    <span><small>RIDE HOURS</small><b>${hours(rides.seconds)}</b></span>
    <span><small>SAVED RIDES</small><b>${rides.count}</b></span>
    <span><small>INSTALLED MODS</small><b>${mods.installed}</b></span>`;
  beforeDrawer(host, summary);
  ensurePhaseTwoActions(card, bike);
}

async function enhance() {
  const main = $('#main');
  if (main?.querySelector('.section h2')?.textContent.trim() !== 'Motorcycles') return;
  if (!cache.bikes.length) await refresh();
  const cards = $$('.bikeHero');
  cards.forEach((card, index) => {
    const id = cardId(card);
    const bike = cache.bikes.find(row => String(row.id) === String(id)) || cache.bikes[index];
    if (bike) enhanceCard(card, bike);
  });
}

function empty(label, title, body, button = '') {
  return `<div class="garageCenterEmpty"><div><small>${esc(label)}</small><h2>${esc(title)}</h2><p>${esc(body)}</p>${button}</div></div>`;
}

function rideList(list, limit = 999) {
  if (!list.length) return empty(
    'RIDES', 'No completed rides',
    'Start Ride Center with this motorcycle selected to build mileage, hours, routes, and analytics history.'
  );
  return `<div class="garageCenterTimeline">${list.slice(0, limit).map(ride => `
    <article><div><strong>${fullDate(ride.started_at)}</strong>
    <span>${duration(ride.duration_seconds)} · ${Number(ride.average_speed_mph || 0).toFixed(1)} mph avg</span></div>
    <div><b>${miles(ride.distance_miles)}</b><span>${Number(ride.max_speed_mph || 0).toFixed(1)} mph max</span></div></article>`).join('')}</div>`;
}

function serviceSchedule(bike, rides, list) {
  if (!list.length) return empty(
    'MAINTENANCE', 'No service schedule yet',
    'Use Quick settings → Service to create recommended intervals for this motorcycle.'
  );
  const odometer = Number(bike.odometer || 0);
  const rideHours = rides.seconds / 3600;
  return `<div class="garageCenterServiceList">${list.map(item => {
    const milesRemaining = Number(item.interval_miles) > 0
      ? Number(item.last_service_miles || 0) + Number(item.interval_miles) - odometer
      : null;
    const hoursRemaining = Number(item.interval_hours) > 0
      ? Number(item.last_service_hours || 0) + Number(item.interval_hours) - rideHours
      : null;
    const due = (milesRemaining !== null && milesRemaining <= 0)
      || (hoursRemaining !== null && hoursRemaining <= 0);
    const remaining = milesRemaining !== null
      ? `${Math.max(0, Math.round(milesRemaining)).toLocaleString()} mi remaining`
      : hoursRemaining !== null
        ? `${Math.max(0, hoursRemaining).toFixed(1)} hr remaining`
        : 'Manual interval';
    return `<article><div><strong>${esc(item.item_name || 'Service item')}</strong><small>${esc(remaining)}</small></div>
      <b class="${due ? 'due' : ''}">${due ? 'DUE' : 'CURRENT'}</b></article>`;
  }).join('')}</div>`;
}

function maintenanceHistory(list, limit = 999) {
  if (!list.length) return empty(
    'SERVICE HISTORY', 'No completed maintenance records',
    'Log oil changes, tires, valves, repairs, inspections, and other completed work here.',
    '<button data-add-maintenance>LOG FIRST SERVICE</button>'
  );
  return `<div class="garageMaintenanceHistory">${list.slice(0, limit).map(row => `
    <article data-maintenance-id="${row.id}">
      <div class="garageHistoryIcon">✓</div>
      <div class="garageHistoryMain"><div><small>${shortDate(row.service_date || row.created_at)}</small><h3>${esc(row.service)}</h3></div>
      <p>${esc(row.notes || row.parts_used || 'Completed maintenance')}</p>
      <div class="garageHistoryMeta"><span>${miles(row.odometer)}</span>${row.service_hours != null ? `<span>${Number(row.service_hours).toFixed(1)} hr</span>` : ''}
      ${row.performed_by ? `<span>${esc(row.performed_by)}</span>` : ''}<span>${money(row.cost)}</span></div></div>
      <div class="garageHistoryActions"><button data-edit-maintenance="${row.id}">Edit</button><button data-delete-maintenance="${row.id}">Delete</button></div>
    </article>`).join('')}</div>`;
}

function modCard(mod) {
  const image = mod.image_url
    ? `<img src="${esc(mod.image_url)}" alt="${esc(mod.part_name)}">`
    : `<div class="garageModPlaceholder">${esc((mod.category || 'M').slice(0, 1))}</div>`;
  return `<article class="garageModCard" data-mod-id="${mod.id}">
    <div class="garageModImage">${image}<span data-status="${esc(mod.status)}">${esc(mod.status)}</span></div>
    <div class="garageModBody"><small>${esc(mod.category || 'Other')}</small><h3>${esc([mod.brand, mod.part_name].filter(Boolean).join(' '))}</h3>
    <p>${esc(mod.notes || mod.part_number || 'No notes')}</p>
    <dl><div><dt>Cost</dt><dd>${money(mod.cost)}</dd></div><div><dt>Installed</dt><dd>${mod.installed_at ? shortDate(mod.installed_at) : '—'}</dd></div>
    <div><dt>Mileage</dt><dd>${mod.installed_odometer_miles != null ? miles(mod.installed_odometer_miles) : '—'}</dd></div>
    <div><dt>Vendor</dt><dd>${esc(mod.vendor || '—')}</dd></div></dl>
    <div class="garageModActions">${mod.source_url ? `<a href="${esc(mod.source_url)}" target="_blank" rel="noopener">Source</a>` : ''}
    <button data-edit-mod="${mod.id}">Edit</button><button data-delete-mod="${mod.id}">Delete</button></div></div>
  </article>`;
}

function modsPanel(list) {
  const totals = modTotals(list);
  return `<div class="garageCenterStats">
    <article><small>INSTALLED</small><strong>${totals.installed}</strong></article>
    <article><small>PLANNED / ORDERED</small><strong>${totals.planned + totals.ordered}</strong></article>
    <article><small>REMOVED</small><strong>${totals.removed}</strong></article>
    <article><small>INSTALLED VALUE</small><strong>${money(totals.installedCost)}</strong></article>
  </div>
  <div class="garagePanelHeader"><div><small>AFTERMARKET BUILD</small><h2>Parts and modifications</h2></div><button data-add-mod>ADD MOD</button></div>
  ${list.length ? `<div class="garageModGrid">${list.map(modCard).join('')}</div>` : empty(
    'AFTERMARKET BUILD', 'No modifications recorded',
    'Track installed, planned, ordered, and removed parts with cost, mileage, vendor, notes, and a photo.',
    '<button data-add-mod>ADD FIRST MOD</button>'
  )}`;
}

function closeCenter() {
  document.querySelector('#garageCenterOverlay')?.remove();
  document.body.style.overflow = '';
}

function closeForm() {
  document.querySelector('#garageEntryOverlay')?.remove();
}

function cardFor(id) {
  return $$('[data-bike-profile]').find(card => String(card.dataset.bikeProfile) === String(id));
}

function action(id, selector) {
  closeCenter();
  setTimeout(() => cardFor(id)?.querySelector(selector)?.click(), 0);
}

async function uploadModPhoto(bikeId, modId, file) {
  if (!file || !file.size) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error('Use a mod image smaller than 5 MB.');
  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${session.user.id}/${bikeId}/mods/${modId}-${Date.now()}.${extension}`;
  const upload = await supabase.storage.from('bike-images').upload(path, file, {
    contentType: file.type, upsert: true
  });
  if (upload.error) throw upload.error;
  return supabase.storage.from('bike-images').getPublicUrl(path).data.publicUrl;
}

function formShell(title, eyebrow, body) {
  closeForm();
  const overlay = document.createElement('div');
  overlay.id = 'garageEntryOverlay';
  overlay.className = 'garageEntryOverlay';
  overlay.innerHTML = `<section class="garageEntryPanel"><header><div><small>${esc(eyebrow)}</small><h2>${esc(title)}</h2></div>
    <button data-close-entry aria-label="Close">×</button></header>${body}</section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-close-entry]').onclick = closeForm;
  overlay.onclick = event => { if (event.target === overlay) closeForm(); };
  return overlay;
}

async function openModForm(bike, mod = null, reopen = true) {
  if (!session) await refresh();
  const current = mod || {
    category: 'Other', status: 'Installed', installed_at: dateInput(new Date()),
    installed_odometer_miles: bike.odometer || 0, cost: 0
  };
  const overlay = formShell(
    mod ? 'Edit modification' : 'Add modification',
    bike.name || bikeLabel(bike),
    `<form id="garageModForm" class="garageEntryForm">
      <div class="garageEntryGrid">
        <label class="wide">Part name<input name="part_name" required value="${esc(current.part_name || '')}" placeholder="Example: FMF Q4 muffler"></label>
        <label>Brand<input name="brand" value="${esc(current.brand || '')}" placeholder="FMF"></label>
        <label>Part number<input name="part_number" value="${esc(current.part_number || '')}"></label>
        <label>Category<select name="category">${MOD_CATEGORIES.map(value => `<option ${value === current.category ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>
        <label>Status<select name="status">${MOD_STATUSES.map(value => `<option ${value === current.status ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <label>Cost<input name="cost" type="number" step="0.01" value="${esc(current.cost || 0)}"></label>
        <label>Installed date<input name="installed_at" type="date" value="${esc(dateInput(current.installed_at))}"></label>
        <label>Installed mileage<input name="installed_odometer_miles" type="number" step="0.1" value="${esc(current.installed_odometer_miles ?? bike.odometer ?? 0)}"></label>
        <label>Removed date<input name="removed_at" type="date" value="${esc(dateInput(current.removed_at))}"></label>
        <label>Vendor<input name="vendor" value="${esc(current.vendor || '')}"></label>
        <label class="wide">Source URL<input name="source_url" type="url" value="${esc(current.source_url || '')}"></label>
        <label class="wide">Notes<textarea name="notes">${esc(current.notes || '')}</textarea></label>
        <label class="wide garagePhotoInput">Part photo<input name="photo" type="file" accept="image/*"></label>
        ${current.image_url ? `<img class="garageEntryPreview" src="${esc(current.image_url)}" alt="Current mod photo">` : ''}
      </div>
      <footer><button type="button" data-cancel>Cancel</button><button class="primary">${mod ? 'SAVE MOD' : 'ADD MOD'}</button></footer>
    </form>`
  );
  overlay.querySelector('[data-cancel]').onclick = closeForm;
  overlay.querySelector('#garageModForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const photo = form.get('photo');
    const record = {
      user_id: session.user.id,
      bike_id: bike.id,
      part_name: form.get('part_name')?.trim(),
      brand: form.get('brand')?.trim() || null,
      part_number: form.get('part_number')?.trim() || null,
      category: form.get('category') || 'Other',
      status: form.get('status') || 'Planned',
      cost: num(form.get('cost')) || 0,
      installed_at: form.get('installed_at') || null,
      removed_at: form.get('removed_at') || null,
      installed_odometer_miles: num(form.get('installed_odometer_miles')),
      vendor: form.get('vendor')?.trim() || null,
      source_url: form.get('source_url')?.trim() || null,
      notes: form.get('notes')?.trim() || null,
      updated_at: new Date().toISOString()
    };
    let id = mod?.id;
    let result;
    if (id) result = await supabase.from('bike_mods').update(record).eq('id', id).select().single();
    else result = await supabase.from('bike_mods').insert({ ...record, created_at: new Date().toISOString() }).select().single();
    if (result.error) {
      alert(result.error.message);
      return;
    }
    id = result.data.id;
    try {
      const imageUrl = await uploadModPhoto(bike.id, id, photo);
      if (imageUrl) {
        const update = await supabase.from('bike_mods').update({ image_url: imageUrl, updated_at: new Date().toISOString() }).eq('id', id);
        if (update.error) throw update.error;
      }
    } catch (error) {
      alert(error.message || String(error));
      return;
    }
    closeForm();
    await refresh();
    queue(true);
    if (reopen) void openCenter(bike.id, 'mods');
  };
}

async function openMaintenanceForm(bike, record = null, reopen = true) {
  if (!session) await refresh();
  const data = related(bike.id);
  const rides = rideTotals(data.rides);
  const current = record || {
    service_date: dateInput(new Date()), odometer: bike.odometer || 0,
    service_hours: rides.seconds / 3600, cost: 0
  };
  const overlay = formShell(
    record ? 'Edit maintenance record' : 'Log completed service',
    bike.name || bikeLabel(bike),
    `<form id="garageMaintenanceForm" class="garageEntryForm">
      <div class="garageEntryGrid">
        <label class="wide">Service performed<input name="service" required value="${esc(current.service || '')}" placeholder="Oil and filter change"></label>
        <label>Service date<input name="service_date" type="date" required value="${esc(dateInput(current.service_date || new Date()))}"></label>
        <label>Odometer<input name="odometer" type="number" step="0.1" value="${esc(current.odometer ?? bike.odometer ?? 0)}"></label>
        <label>Ride hours<input name="service_hours" type="number" step="0.1" value="${esc(current.service_hours ?? (rides.seconds / 3600).toFixed(1))}"></label>
        <label>Cost<input name="cost" type="number" step="0.01" value="${esc(current.cost || 0)}"></label>
        <label>Performed by<input name="performed_by" value="${esc(current.performed_by || 'Owner')}"></label>
        <label class="wide">Link service interval<select name="interval_id"><option value="">No linked interval</option>${data.intervals.map(item => `<option value="${item.id}" ${item.id === current.interval_id ? 'selected' : ''}>${esc(item.item_name)}</option>`).join('')}</select></label>
        <label class="wide">Parts and fluids used<textarea name="parts_used">${esc(current.parts_used || '')}</textarea></label>
        <label class="wide">Receipt / reference URL<input name="receipt_url" type="url" value="${esc(current.receipt_url || '')}"></label>
        <label class="wide">Notes<textarea name="notes">${esc(current.notes || '')}</textarea></label>
      </div>
      <footer><button type="button" data-cancel>Cancel</button><button class="primary">${record ? 'SAVE RECORD' : 'LOG SERVICE'}</button></footer>
    </form>`
  );
  overlay.querySelector('[data-cancel]').onclick = closeForm;
  overlay.querySelector('#garageMaintenanceForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const maintenance = {
      user_id: session.user.id,
      bike_id: bike.id,
      bike: bike.name || bikeLabel(bike),
      service: form.get('service')?.trim(),
      service_date: form.get('service_date') || dateInput(new Date()),
      odometer: num(form.get('odometer')) || 0,
      service_hours: num(form.get('service_hours')),
      cost: num(form.get('cost')) || 0,
      performed_by: form.get('performed_by')?.trim() || null,
      interval_id: form.get('interval_id') || null,
      parts_used: form.get('parts_used')?.trim() || null,
      receipt_url: form.get('receipt_url')?.trim() || null,
      notes: form.get('notes')?.trim() || null,
      updated_at: new Date().toISOString()
    };
    const result = record?.id
      ? await supabase.from('maintenance').update(maintenance).eq('id', record.id)
      : await supabase.from('maintenance').insert({ ...maintenance, created_at: new Date().toISOString() });
    if (result.error) {
      alert(result.error.message);
      return;
    }
    if (maintenance.interval_id) {
      const intervalUpdate = await supabase.from('maintenance_intervals').update({
        last_service_miles: maintenance.odometer,
        last_service_hours: maintenance.service_hours,
        last_service_at: new Date(`${maintenance.service_date}T12:00:00`).toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', maintenance.interval_id);
      if (intervalUpdate.error) console.warn('Service interval was not updated', intervalUpdate.error);
    }
    closeForm();
    await refresh();
    queue(true);
    if (reopen) void openCenter(bike.id, 'maintenance');
  };
}

async function deleteMod(bike, id) {
  if (!confirm('Delete this modification record?')) return;
  const { error } = await supabase.from('bike_mods').delete().eq('id', id);
  if (error) return alert(error.message);
  await refresh();
  queue(true);
  void openCenter(bike.id, 'mods');
}

async function deleteMaintenance(bike, id) {
  if (!confirm('Delete this maintenance record?')) return;
  const { error } = await supabase.from('maintenance').delete().eq('id', id);
  if (error) return alert(error.message);
  await refresh();
  queue(true);
  void openCenter(bike.id, 'maintenance');
}

function bindCenter(overlay, bike, initialTab) {
  const activateTab = tab => {
    overlay.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    overlay.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tab));
  };
  activateTab(initialTab);
  overlay.querySelector('[data-close]').onclick = closeCenter;
  overlay.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => activateTab(button.dataset.tab));
  overlay.querySelectorAll('[data-edit-bike]').forEach(button => button.onclick = () => action(bike.id, '[data-edit^="bikes:"]'));
  overlay.querySelectorAll('[data-service-settings]').forEach(button => button.onclick = () => action(bike.id, '[data-garage-service]'));
  overlay.querySelectorAll('[data-rides]').forEach(button => button.onclick = () => {
    closeCenter();
    document.querySelector('[data-v="rides"]')?.click();
  });
  overlay.querySelectorAll('[data-add-mod]').forEach(button => button.onclick = () => openModForm(bike));
  overlay.querySelectorAll('[data-add-maintenance]').forEach(button => button.onclick = () => openMaintenanceForm(bike));
  overlay.querySelectorAll('[data-edit-mod]').forEach(button => button.onclick = () => {
    const mod = cache.mods.find(row => String(row.id) === String(button.dataset.editMod));
    if (mod) void openModForm(bike, mod);
  });
  overlay.querySelectorAll('[data-delete-mod]').forEach(button => button.onclick = () => void deleteMod(bike, button.dataset.deleteMod));
  overlay.querySelectorAll('[data-edit-maintenance]').forEach(button => button.onclick = () => {
    const record = cache.maintenance.find(row => String(row.id) === String(button.dataset.editMaintenance));
    if (record) void openMaintenanceForm(bike, record);
  });
  overlay.querySelectorAll('[data-delete-maintenance]').forEach(button => button.onclick = () => void deleteMaintenance(bike, button.dataset.deleteMaintenance));
}

async function openCenter(id, initialTab = 'overview') {
  await refresh();
  const bike = cache.bikes.find(row => String(row.id) === String(id));
  if (!bike) return;
  const data = related(id);
  const rides = rideTotals(data.rides);
  const lastRide = rides.completed[0];
  const average = rides.count ? rides.miles / rides.count : 0;
  const service = serviceState(bike, rides, data.intervals);
  const tire = data.tires.find(row => row.active) || data.tires[0];
  const latestFuel = data.fuel[0];
  const modData = modTotals(data.mods);
  const maintenanceData = maintenanceTotals(data.maintenance);
  const latestMaintenance = data.maintenance[0];

  closeCenter();
  const overlay = document.createElement('div');
  overlay.id = 'garageCenterOverlay';
  overlay.className = 'garageCenterOverlay';
  overlay.innerHTML = `<main class="garageCenterShell">
    <section class="garageCenterHero" style="--garage-hero-image:${cssImage(bike.image_url)}">
      <div class="garageCenterTop"><button class="garageCenterBack" data-close>‹</button>
        <div class="garageCenterHeroActions"><button data-rides>RIDE LOG</button><button data-add-maintenance>LOG SERVICE</button><button data-add-mod>ADD MOD</button><button data-edit-bike>EDIT BIKE</button></div>
      </div>
      <div><div class="garageCenterIdentity"><small>MOTORCYCLE GARAGE CENTER</small><h1>${esc(bike.name || bikeLabel(bike))}</h1><p>${esc(bikeLabel(bike))}</p></div>
        <div class="garageCenterHeroMetrics">
          <article><small>TOTAL MILEAGE</small><strong>${miles(bike.odometer)}</strong><span>Saved odometer</span></article>
          <article><small>RIDE HOURS</small><strong>${hours(rides.seconds)}</strong><span>${duration(rides.seconds)} logged</span></article>
          <article><small>SAVED RIDES</small><strong>${rides.count}</strong><span>${miles(average)} average</span></article>
          <article><small>INSTALLED MODS</small><strong>${modData.installed}</strong><span>${money(modData.installedCost)} installed</span></article>
          <article><small>SERVICE RECORDS</small><strong>${maintenanceData.count}</strong><span>${money(maintenanceData.cost)} total</span></article>
          <article><small>MAX LEAN</small><strong>${rides.lean.toFixed(1)}°</strong><span>${rides.speed.toFixed(1)} mph max</span></article>
        </div>
      </div>
    </section>
    <nav class="garageCenterTabs">${[
      ['overview', 'Overview'], ['maintenance', 'Maintenance'], ['rides', 'Rides'], ['mods', 'Mods'],
      ['fuel', 'Fuel & Tires'], ['documents', 'Documents'], ['notes', 'Notes'], ['settings', 'Settings']
    ].map(([tab, label]) => `<button data-tab="${tab}">${label}</button>`).join('')}</nav>
    <div class="garageCenterBody">
      <section class="garageCenterPanel" data-panel="overview">
        <div class="garageCenterStats">
          <article><small>SERVICE STATUS</small><strong class="${service.warn ? 'warning' : ''}">${esc(service.label)}</strong></article>
          <article><small>AFTERMARKET VALUE</small><strong>${money(modData.installedCost)}</strong></article>
          <article><small>MAINTENANCE SPEND</small><strong>${money(maintenanceData.cost)}</strong></article>
          <article><small>LAST RIDE</small><strong>${lastRide ? shortDate(lastRide.started_at) : '—'}</strong></article>
        </div>
        <div class="garageCenterGrid">
          <article class="garageCenterCard"><header><div><small>RECENT ACTIVITY</small><h2>Ride history</h2></div><button data-rides>Full ride log</button></header>${rideList(rides.completed, 5)}</article>
          <article class="garageCenterCard"><header><div><small>BIKE STATUS</small><h2>At a glance</h2></div></header><dl class="garageCenterRecord">
            <div><dt>Next service</dt><dd>${esc(service.detail)}</dd></div><div><dt>Last maintenance</dt><dd>${latestMaintenance ? shortDate(latestMaintenance.service_date) : '—'}</dd></div>
            <div><dt>Active tires</dt><dd>${esc(tire?.name || tire?.wheel_setup || 'Not set')}</dd></div><div><dt>Latest fuel</dt><dd>${latestFuel ? `${Number(latestFuel.gallons || 0).toFixed(2)} gal` : '—'}</dd></div>
            <div><dt>Installed mods</dt><dd>${modData.installed}</dd></div><div><dt>Planned upgrades</dt><dd>${modData.planned + modData.ordered}</dd></div>
          </dl></article>
        </div>
        <div class="garageCenterGrid garageOverviewSecondary">
          <article class="garageCenterCard"><header><div><small>RECENT SERVICE</small><h2>Maintenance history</h2></div><button data-add-maintenance>Log service</button></header>${maintenanceHistory(data.maintenance, 4)}</article>
          <article class="garageCenterCard"><header><div><small>CURRENT BUILD</small><h2>Installed modifications</h2></div><button data-add-mod>Add mod</button></header>${data.mods.filter(mod => mod.status === 'Installed').length
            ? `<div class="garageOverviewMods">${data.mods.filter(mod => mod.status === 'Installed').slice(0, 5).map(mod => `<div><span>${esc(mod.category)}</span><strong>${esc([mod.brand, mod.part_name].filter(Boolean).join(' '))}</strong><small>${money(mod.cost)}</small></div>`).join('')}</div>`
            : empty('CURRENT BUILD', 'Stock setup recorded', 'Add installed aftermarket parts to create a complete build sheet.')}</article>
        </div>
      </section>
      <section class="garageCenterPanel" data-panel="maintenance">
        <div class="garageCenterStats"><article><small>HISTORY RECORDS</small><strong>${maintenanceData.count}</strong></article><article><small>TOTAL SPEND</small><strong>${money(maintenanceData.cost)}</strong></article>
          <article><small>LAST SERVICE</small><strong>${latestMaintenance ? shortDate(latestMaintenance.service_date) : '—'}</strong></article><article><small>SCHEDULED ITEMS</small><strong>${data.intervals.filter(row => row.enabled !== false).length}</strong></article></div>
        <div class="garageCenterGrid"><article class="garageCenterCard"><header><div><small>SERVICE SCHEDULE</small><h2>Upcoming maintenance</h2></div><button data-service-settings>Interval settings</button></header>${serviceSchedule(bike, rides, data.intervals)}</article>
          <article class="garageCenterCard"><header><div><small>QUICK ENTRY</small><h2>Completed work</h2></div><button data-add-maintenance>LOG SERVICE</button></header><p>Record the date, odometer, ride hours, cost, parts used, who performed the work, and optional receipt link.</p></article></div>
        <article class="garageCenterCard garageFullWidth"><header><div><small>OWNERSHIP TIMELINE</small><h2>Maintenance history</h2></div><button data-add-maintenance>ADD RECORD</button></header>${maintenanceHistory(data.maintenance)}</article>
      </section>
      <section class="garageCenterPanel" data-panel="rides"><article class="garageCenterCard"><header><div><small>RIDE CENTER HISTORY</small><h2>All saved rides</h2></div><button data-rides>Open full Ride Log</button></header>${rideList(rides.completed)}</article></section>
      <section class="garageCenterPanel" data-panel="mods">${modsPanel(data.mods)}</section>
      <section class="garageCenterPanel" data-panel="fuel"><div class="garageCenterGrid"><article class="garageCenterCard"><header><div><small>ACTIVE SETUP</small><h2>Tires and wheels</h2></div></header><dl class="garageCenterRecord">
        <div><dt>Profile</dt><dd>${esc(tire?.name || 'Not set')}</dd></div><div><dt>Wheel setup</dt><dd>${esc(tire?.wheel_setup || '—')}</dd></div><div><dt>Front</dt><dd>${esc(tire?.front_tire || '—')}</dd></div><div><dt>Rear</dt><dd>${esc(tire?.rear_tire || '—')}</dd></div>
        <div><dt>Pressure</dt><dd>${tire ? `${tire.front_psi || '—'} / ${tire.rear_psi || '—'} psi` : '—'}</dd></div></dl></article>
        <article class="garageCenterCard"><header><div><small>LAST FILL</small><h2>Fuel snapshot</h2></div></header><dl class="garageCenterRecord"><div><dt>Gallons</dt><dd>${latestFuel ? Number(latestFuel.gallons || 0).toFixed(2) : '—'}</dd></div>
        <div><dt>Odometer</dt><dd>${latestFuel ? miles(latestFuel.odometer_miles) : '—'}</dd></div><div><dt>Total cost</dt><dd>${latestFuel ? money(latestFuel.total_cost) : '—'}</dd></div><div><dt>Station</dt><dd>${esc(latestFuel?.station || '—')}</dd></div></dl></article></div></section>
      <section class="garageCenterPanel" data-panel="documents">${empty('DOCUMENT VAULT', 'Documents workspace prepared', 'Registration, insurance, manuals, receipts, tune files, setup sheets, and dyno documents are planned for Phase 3.')}</section>
      <section class="garageCenterPanel" data-panel="notes"><article class="garageCenterCard"><header><div><small>OWNER NOTES</small><h2>${esc(bike.name || bikeLabel(bike))}</h2></div><button data-edit-bike>Edit notes</button></header><p>${esc(bike.notes || 'No motorcycle notes have been added yet.')}</p></article></section>
      <section class="garageCenterPanel" data-panel="settings"><article class="garageCenterCard"><header><div><small>MOTORCYCLE SETTINGS</small><h2>Profile and photo</h2></div><button data-edit-bike>Edit motorcycle</button></header><p>Update the name, year, make, model, odometer, notes, and the photo used behind the Garage card and Garage Center hero.</p></article></section>
    </div>
  </main>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  bindCenter(overlay, bike, initialTab);
}

function queue(force = false) {
  if (queued) return;
  queued = true;
  requestAnimationFrame(async () => {
    queued = false;
    if (force) cache.bikes = [];
    await enhance();
  });
}

document.addEventListener('click', event => {
  const card = event.target.closest('[data-bike-profile]');
  if (!card || event.target.closest('button,a,input,label,select,textarea,summary,details,.garageCompactDrawer')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openCenter(card.dataset.bikeProfile);
}, true);

document.addEventListener('keydown', event => {
  const card = event.target.closest?.('[data-bike-profile]');
  if (!card || !['Enter', ' '].includes(event.key) || event.target.closest('button,summary,details')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openCenter(card.dataset.bikeProfile);
}, true);

new MutationObserver(() => queue()).observe(document.querySelector('#app') || document.body, {
  childList: true, subtree: true
});

supabase.auth.onAuthStateChange((_event, nextSession) => {
  session = nextSession;
  queue(true);
});
window.addEventListener('moto-ride-complete', () => queue(true));
window.MotoGarageCenter = { open: openCenter, refresh: () => queue(true) };
queue(true);
