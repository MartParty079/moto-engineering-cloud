import { supabase } from './supabase.js';

const $ = q => document.querySelector(q);
const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const n = v => { const x = Number(v); return Number.isFinite(x) ? x : null; };
let session, bikes = [];

const name = b => [b.year, b.make, b.model].filter(Boolean).join(' ') || b.name || 'Motorcycle';
const shortName = b => [b.year, b.make, b.model].filter(Boolean).join(' ') || b.name || 'Motorcycle';

function mpg(entries) {
  const f = entries.filter(x => x.full_tank);
  let mi = 0, g = 0;
  for (let i = 1; i < f.length; i++) {
    const d = Number(f[i].odometer_miles) - Number(f[i - 1].odometer_miles);
    if (d > 0 && d < 2000) { mi += d; g += Number(f[i].gallons || 0); }
  }
  return g ? mi / g : null;
}

async function intel(b) {
  const [f, m, t, r] = await Promise.all([
    supabase.from('fuel_entries').select('*').eq('bike_id', b.id).order('odometer_miles'),
    supabase.from('maintenance_intervals').select('*').eq('bike_id', b.id).eq('enabled', true),
    supabase.from('tire_profiles').select('*').eq('bike_id', b.id).eq('active', true).limit(1).maybeSingle(),
    supabase.from('ride_sessions').select('duration_seconds').eq('bike_id', b.id).eq('status', 'complete')
  ]);
  return { fuel: f.data || [], maint: m.data || [], tire: t.data, rides: r.data || [] };
}

function dueState(due) {
  if (!due) return { label: 'Ready to Ride', tone: 'good', service: 'Not set' };
  if (due.left <= 0) return { label: 'Service Due', tone: 'bad', service: `${due.name} overdue` };
  if (due.left <= 250) return { label: 'Attention', tone: 'warn', service: `${due.name} in ${Math.ceil(due.left)} mi` };
  return { label: 'Ready to Ride', tone: 'good', service: `${due.name} in ${Math.ceil(due.left)} mi` };
}

function openRideLog(bikeId) {
  const candidates = [...document.querySelectorAll('button,[role="button"]')];
  const rideButton = candidates.find(el => /ride log|history/i.test(el.textContent || ''));
  if (rideButton) rideButton.click();
  else window.dispatchEvent(new CustomEvent('motocloud:open-ride-log', { detail: { bikeId } }));
}

async function render(force = false) {
  const main = $('#main');
  if (!main || !/Motorcycles|Overview/i.test(main.textContent || '')) return;
  if ($('#garageIntelligence') && !force) return;
  $('#garageIntelligence')?.remove();

  const s = document.createElement('section');
  s.id = 'garageIntelligence';
  s.className = 'garageIntel garageIntelV2';
  s.innerHTML = `
    <div class="garageIntelHead">
      <div><small>FLEET INTELLIGENCE</small><h2>My Garage</h2></div>
      <button id="refreshGarageIntel" class="garageRefresh" aria-label="Refresh fleet">↻</button>
    </div>
    <div id="garageFleetSummary" class="garageFleetSummary" aria-live="polite"></div>
    <div id="garageIntelGrid" class="garageIntelGrid"><p class="garageLoading">Loading garage…</p></div>`;
  main.prepend(s);
  $('#refreshGarageIntel').onclick = () => render(true);

  const records = [];
  for (const b of bikes) {
    const d = await intel(b);
    const hours = d.rides.reduce((a, x) => a + Number(x.duration_seconds || 0), 0) / 3600;
    const odo = Number(b.odometer || 0);
    const economy = mpg(d.fuel);
    const due = d.maint.map(x => ({
      name: x.item_name,
      left: n(x.interval_miles) !== null ? Number(x.interval_miles) - (odo - Number(x.last_service_miles || 0)) : Infinity
    })).sort((a, z) => a.left - z.left)[0];
    const used = d.tire ? Math.max(0, odo - Number(d.tire.installed_odometer_miles || odo)) : 0;
    records.push({ b, d, hours, odo, economy, due, used, state: dueState(due) });
  }

  const totalMiles = records.reduce((sum, x) => sum + x.odo, 0);
  const totalHours = records.reduce((sum, x) => sum + x.hours, 0);
  const servicesDue = records.filter(x => x.due && x.due.left <= 0).length;
  $('#garageFleetSummary').innerHTML = `
    <div><span>🏍️</span><b>${records.length}</b><small>Bikes</small></div>
    <div><span>🛣️</span><b>${totalMiles.toFixed(0)}</b><small>Total mi</small></div>
    <div><span>◷</span><b>${totalHours.toFixed(1)}</b><small>Total hr</small></div>
    <div class="${servicesDue ? 'summaryAlert' : ''}"><span>🔧</span><b>${servicesDue}</b><small>Services due</small></div>`;

  const cards = records.map(({ b, d, hours, odo, economy, due, used, state }) => `
    <article class="garageBikeCard" data-bike-card="${b.id}">
      <header class="garageBikeHeader">
        <div class="garageBikeAvatar" aria-hidden="true">🏍️</div>
        <div class="garageBikeIdentity">
          <h3>${esc(shortName(b))}</h3>
          <span class="garageStatus garageStatus-${state.tone}"><i></i>${esc(state.label)}</span>
        </div>
        <button class="garageMore" aria-label="Bike options">•••</button>
      </header>

      <div class="garagePrimaryStats">
        <span><i>▥</i><b>${odo.toFixed(0)}</b><small>mi</small></span>
        <span><i>◷</i><b>${hours.toFixed(1)}</b><small>hr</small></span>
        <span><i>⛽</i><b>${economy ? economy.toFixed(1) : '—'}</b><small>mpg</small></span>
      </div>

      <div class="garageHealthRow">
        <span><i>⛽</i><strong>Fuel</strong><small>${d.fuel.length ? `${d.fuel.length} entries` : 'Not set'}</small></span>
        <span><i>🔧</i><strong>Service</strong><small>${esc(state.service)}</small></span>
        <span><i>🛞</i><strong>Tires</strong><small>${d.tire ? esc(d.tire.name) : 'Not set'}</small></span>
      </div>

      <footer class="garageActions">
        <button data-fuel="${b.id}"><i>⛽</i>Fuel</button>
        <button data-service="${b.id}"><i>🔧</i>Service</button>
        <button data-tires="${b.id}"><i>🛞</i>Tires</button>
        <button data-ride-log="${b.id}"><i>▤</i>Ride Log</button>
      </footer>

      <details class="garageDetails">
        <summary>View Details</summary>
        <div>
          <span><small>Next service</small><b>${due ? esc(due.name) : 'Not set'}</b></span>
          <span><small>Tire mileage</small><b>${d.tire ? `${used.toFixed(0)} mi` : '—'}</b></span>
          <span><small>Fuel economy</small><b>${economy ? `${economy.toFixed(1)} mpg` : '—'}</b></span>
        </div>
      </details>
    </article>`);

  $('#garageIntelGrid').innerHTML = cards.join('') || '<p class="garageEmpty">Add a motorcycle to begin tracking your fleet.</p>';
  document.querySelectorAll('[data-fuel]').forEach(x => x.onclick = () => fuel(bikes.find(b => b.id === x.dataset.fuel)));
  document.querySelectorAll('[data-service]').forEach(x => x.onclick = () => service(bikes.find(b => b.id === x.dataset.service)));
  document.querySelectorAll('[data-tires]').forEach(x => x.onclick = () => tires(bikes.find(b => b.id === x.dataset.tires)));
  document.querySelectorAll('[data-ride-log]').forEach(x => x.onclick = () => openRideLog(x.dataset.rideLog));
}

async function fuel(b) {
  const odometer = Number(prompt('Current odometer:', b.odometer || 0));
  const gallons = Number(prompt('Gallons added:', '2'));
  const total_cost = Number(prompt('Total cost:', '0'));
  const tank_capacity_gallons = Number(prompt('Tank capacity gallons:', ''));
  if (!Number.isFinite(odometer) || !Number.isFinite(gallons) || gallons <= 0) return;
  await supabase.from('fuel_entries').insert({ user_id: session.user.id, bike_id: b.id, odometer_miles: odometer, gallons, total_cost: Number.isFinite(total_cost) ? total_cost : 0, full_tank: confirm('Was this a full fill-up?') });
  await supabase.from('bike_trip_settings').upsert({ bike_id: b.id, user_id: session.user.id, tank_capacity_gallons: Number.isFinite(tank_capacity_gallons) && tank_capacity_gallons > 0 ? tank_capacity_gallons : null, last_fill_odometer: odometer, miles_since_fill: 0, updated_at: new Date().toISOString() });
  render(true);
}

async function service(b) {
  const item_name = prompt('Maintenance item:');
  if (!item_name) return;
  const interval_miles = n(prompt('Interval miles (blank if none):', ''));
  const interval_hours = n(prompt('Interval hours (blank if none):', ''));
  const last_service_miles = n(prompt('Mileage at last service:', b.odometer || 0));
  const last_service_hours = n(prompt('Ride hours at last service:', '0'));
  await supabase.from('maintenance_intervals').insert({ user_id: session.user.id, bike_id: b.id, item_name, interval_miles, interval_hours, last_service_miles: last_service_miles || 0, last_service_hours: last_service_hours || 0, last_service_at: new Date().toISOString() });
  render(true);
}

async function tires(b) {
  const profile = prompt('Profile name (example: Supermoto set):');
  if (!profile) return;
  const wheel_setup = prompt('Wheel setup:', '');
  const front_tire = prompt('Front tire:', '');
  const rear_tire = prompt('Rear tire:', '');
  const front_psi = n(prompt('Front PSI:', ''));
  const rear_psi = n(prompt('Rear PSI:', ''));
  const expected_life_miles = n(prompt('Expected life miles:', '4000'));
  await supabase.from('tire_profiles').update({ active: false }).eq('bike_id', b.id);
  await supabase.from('tire_profiles').insert({ user_id: session.user.id, bike_id: b.id, name: profile, wheel_setup, front_tire, rear_tire, front_psi, rear_psi, installed_odometer_miles: Number(b.odometer || 0), expected_life_miles, active: true });
  render(true);
}

async function init() {
  const { data: { session: s } } = await supabase.auth.getSession();
  session = s;
  if (!s) return;
  const { data } = await supabase.from('bikes').select('*');
  bikes = data || [];
  new MutationObserver(() => queueMicrotask(() => render())).observe(document.body, { childList: true, subtree: true });
  render();
}

init();