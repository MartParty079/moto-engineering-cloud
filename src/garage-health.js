import { supabase } from './supabase.js';

const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];
const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const n = v => { const x = Number(v); return Number.isFinite(x) ? x : null; };
let session = null;
let bikes = [];
let queued = false;
let enhancing = false;

const shortName = b => [b.year, b.make, b.model].filter(Boolean).join(' ') || b.name || 'Motorcycle';

function serviceProfileFor(b) {
  const key = `${b.year || ''} ${b.make || ''} ${b.model || ''}`.toLowerCase();
  if (/crf\s*450\s*(rl|l)/.test(key)) return {
    source: 'CRF450RL suggested profile — verify owner’s manual',
    items: [['Oil',600,15],['Oil filter',1200,30],['Valve clearance',1800,45],['Air filter',600,15],['Tires',600,null],['Brake pads',600,null],['Chain',300,null]]
  };
  if (/f\s*800\s*gs/.test(key)) return {
    source: 'F800GS suggested profile — verify owner’s manual',
    items: [['Oil',6000,100],['Oil filter',6000,100],['Valve clearance',12000,200],['Air filter',12000,200],['Tires',6000,null],['Brake pads',6000,null],['Chain',600,null]]
  };
  return {
    source: 'General motorcycle baseline — verify manufacturer schedule',
    items: [['Oil',3000,75],['Oil filter',3000,75],['Valve clearance',12000,250],['Air filter',3000,75],['Tires',3000,null],['Brake pads',3000,null],['Chain',500,null]]
  };
}

async function loadBikes() {
  const { data, error } = await supabase.from('bikes').select('*').order('created_at', { ascending:false });
  if (error) throw error;
  bikes = data || [];
}

function bikeIdFromCard(card) {
  const editRef = card.querySelector('[data-edit^="bikes:"]')?.dataset.edit;
  const deleteRef = card.querySelector('[data-del^="bikes:"]')?.dataset.del;
  return (editRef || deleteRef || '').split(':')[1] || card.dataset.bikeProfile || '';
}

function removeDuplicateDeck() {
  document.querySelector('#garageIntelligence')?.remove();
  $$('.legacyGarageAdd').forEach(el => el.classList.remove('legacyGarageAdd'));
  $$('.bikeHero').forEach(card => {
    card.hidden = false;
    card.removeAttribute('hidden');
    card.querySelector('.bikeCardTotals')?.remove();
  });
}

function openRideLog(bikeId) {
  document.querySelector('[data-v="rides"]')?.click();
  setTimeout(() => window.dispatchEvent(new CustomEvent('motocloud:open-ride-log', { detail:{ bikeId } })), 0);
}

function openProfile(card) {
  card.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
}

function openSettings(card) {
  card.querySelector('[data-edit^="bikes:"]')?.click();
}

function addPrimaryActions(card, bike) {
  card.querySelector('.bikeCardTotals')?.remove();
  if (card.querySelector('.garagePrimaryActions')) return;
  const host = card.querySelector(':scope > div') || card;
  const actions = document.createElement('div');
  actions.className = 'garagePrimaryActions';
  actions.setAttribute('aria-label', `${shortName(bike)} tools`);
  actions.innerHTML = `
    <button type="button" data-garage-profile><i>◇</i><span>Profile</span></button>
    <button type="button" data-garage-fuel><i>⛽</i><span>Fuel</span></button>
    <button type="button" data-garage-service><i>🔧</i><span>Service</span></button>
    <button type="button" data-garage-tires><i>🛞</i><span>Tires</span></button>
    <button type="button" data-garage-rides><i>▤</i><span>Ride Log</span></button>
    <button type="button" data-garage-history><i>⌁</i><span>History</span></button>
    <button type="button" data-garage-settings><i>⚙</i><span>Settings</span></button>`;
  actions.addEventListener('click', event => event.stopPropagation());
  actions.querySelector('[data-garage-profile]').onclick = event => { event.stopPropagation(); openProfile(card); };
  actions.querySelector('[data-garage-fuel]').onclick = event => { event.stopPropagation(); void fuel(bike); };
  actions.querySelector('[data-garage-service]').onclick = event => { event.stopPropagation(); void openServiceManager(bike); };
  actions.querySelector('[data-garage-tires]').onclick = event => { event.stopPropagation(); void tires(bike); };
  actions.querySelector('[data-garage-rides]').onclick = event => { event.stopPropagation(); openRideLog(bike.id); };
  actions.querySelector('[data-garage-history]').onclick = event => { event.stopPropagation(); openRideLog(bike.id); };
  actions.querySelector('[data-garage-settings]').onclick = event => { event.stopPropagation(); openSettings(card); };
  host.appendChild(actions);
}

async function enhanceGarageCards(force = false) {
  removeDuplicateDeck();
  const main = $('#main');
  const title = main?.querySelector('.section h2')?.textContent.trim();
  if (!main || title !== 'Motorcycles' || enhancing) return;
  const cards = [...main.querySelectorAll('.bikeHero')];
  if (!cards.length) return;
  if (!bikes.length || force) {
    enhancing = true;
    try { await loadBikes(); }
    catch (error) { console.error('Garage tools could not load motorcycles', error); }
    finally { enhancing = false; }
  }
  cards.forEach(card => {
    const bikeId = bikeIdFromCard(card);
    const bike = bikes.find(row => String(row.id) === String(bikeId));
    if (bike) addPrimaryActions(card, bike);
  });
}

function queueEnhance(force = false) {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    void enhanceGarageCards(force);
  });
}

async function seedServiceDefaults(b, existing = []) {
  const existingNames = new Set(existing.map(x => String(x.item_name || '').toLowerCase()));
  const profile = serviceProfileFor(b);
  const rows = profile.items.filter(([item]) => !existingNames.has(item.toLowerCase())).map(([item_name, interval_miles, interval_hours]) => ({
    user_id: session.user.id,
    bike_id: b.id,
    item_name,
    interval_miles,
    interval_hours,
    last_service_miles: Number(b.odometer || 0),
    last_service_hours: 0,
    last_service_at: new Date().toISOString(),
    enabled: true
  }));
  if (rows.length) await supabase.from('maintenance_intervals').insert(rows);
  return profile;
}

async function openServiceManager(b) {
  if (!b) return;
  let { data: rows } = await supabase.from('maintenance_intervals').select('*').eq('bike_id', b.id).order('item_name');
  rows = rows || [];
  if (!rows.length) {
    await seedServiceDefaults(b, rows);
    ({ data: rows } = await supabase.from('maintenance_intervals').select('*').eq('bike_id', b.id).order('item_name'));
    rows = rows || [];
  }
  const profile = serviceProfileFor(b);
  document.querySelector('#garageServiceModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'garageServiceModal';
  modal.className = 'garageModal';
  modal.innerHTML = `<section class="garageModalPanel"><header><div><small>SERVICE SETTINGS</small><h3>${esc(shortName(b))}</h3></div><button data-close-service aria-label="Close">×</button></header><p class="garageProfileSource">${esc(profile.source)}</p><div class="garageServiceList">${rows.map(r => `<label data-service-row="${r.id}"><span>${esc(r.item_name)}</span><input data-field="interval_miles" inputmode="decimal" value="${r.interval_miles ?? ''}" placeholder="Miles"><input data-field="interval_hours" inputmode="decimal" value="${r.interval_hours ?? ''}" placeholder="Hours"><input data-field="last_service_miles" inputmode="decimal" value="${r.last_service_miles ?? b.odometer ?? 0}" placeholder="Last mi"><button data-save-service="${r.id}">Save</button></label>`).join('')}</div><footer><button data-add-defaults>Restore missing defaults</button><button data-add-service>+ Custom service</button></footer></section>`;
  document.body.append(modal);
  modal.querySelector('[data-close-service]').onclick = () => modal.remove();
  modal.onclick = event => { if (event.target === modal) modal.remove(); };
  modal.querySelectorAll('[data-save-service]').forEach(button => button.onclick = async () => {
    const row = button.closest('[data-service-row]');
    const values = Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, n(input.value)]));
    await supabase.from('maintenance_intervals').update(values).eq('id', button.dataset.saveService);
    button.textContent = 'Saved';
    setTimeout(() => { button.textContent = 'Save'; }, 900);
  });
  modal.querySelector('[data-add-defaults]').onclick = async () => { await seedServiceDefaults(b, rows); modal.remove(); void openServiceManager(b); };
  modal.querySelector('[data-add-service]').onclick = async () => {
    const item_name = prompt('Custom maintenance item:');
    if (!item_name) return;
    await supabase.from('maintenance_intervals').insert({ user_id:session.user.id,bike_id:b.id,item_name,interval_miles:null,interval_hours:null,last_service_miles:Number(b.odometer||0),last_service_hours:0,last_service_at:new Date().toISOString(),enabled:true });
    modal.remove();
    void openServiceManager(b);
  };
}

async function fuel(b) {
  if (!b) return;
  const odometer = Number(prompt('Current odometer:', b.odometer || 0));
  const gallons = Number(prompt('Gallons added:', '2'));
  const total_cost = Number(prompt('Total cost:', '0'));
  const tank_capacity_gallons = Number(prompt('Tank capacity gallons:', ''));
  if (!Number.isFinite(odometer) || !Number.isFinite(gallons) || gallons <= 0) return;
  await supabase.from('fuel_entries').insert({ user_id:session.user.id,bike_id:b.id,odometer_miles:odometer,gallons,total_cost:Number.isFinite(total_cost)?total_cost:0,full_tank:confirm('Was this a full fill-up?') });
  await supabase.from('bike_trip_settings').upsert({ bike_id:b.id,user_id:session.user.id,tank_capacity_gallons:Number.isFinite(tank_capacity_gallons)&&tank_capacity_gallons>0?tank_capacity_gallons:null,last_fill_odometer:odometer,miles_since_fill:0,updated_at:new Date().toISOString() });
}

async function tires(b) {
  if (!b) return;
  const profile = prompt('Profile name (example: Supermoto set):');
  if (!profile) return;
  const wheel_setup = prompt('Wheel setup:', '');
  const front_tire = prompt('Front tire:', '');
  const rear_tire = prompt('Rear tire:', '');
  const front_psi = n(prompt('Front PSI:', ''));
  const rear_psi = n(prompt('Rear PSI:', ''));
  const expected_life_miles = n(prompt('Expected life miles:', '4000'));
  await supabase.from('tire_profiles').update({ active:false }).eq('bike_id', b.id);
  await supabase.from('tire_profiles').insert({ user_id:session.user.id,bike_id:b.id,name:profile,wheel_setup,front_tire,rear_tire,front_psi,rear_psi,installed_odometer_miles:Number(b.odometer||0),expected_life_miles,active:true });
}

async function init() {
  const { data:{ session:s } } = await supabase.auth.getSession();
  session = s;
  removeDuplicateDeck();
  if (!s) return;
  try { await loadBikes(); }
  catch (error) { console.error('Garage tools could not initialize', error); }
  const observer = new MutationObserver(() => queueEnhance());
  observer.observe(document.querySelector('#app') || document.body, { childList:true, subtree:true });
  queueEnhance();
}

supabase.auth.onAuthStateChange((_event, nextSession) => {
  session = nextSession;
  bikes = [];
  if (nextSession) setTimeout(() => queueEnhance(true), 50);
  else removeDuplicateDeck();
});

void init();
