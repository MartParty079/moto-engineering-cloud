import { supabase } from './supabase.js';

const $ = q => document.querySelector(q);
const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const n = v => { const x = Number(v); return Number.isFinite(x) ? x : null; };
let session, bikes = [];

const name = b => [b.year, b.make, b.model].filter(Boolean).join(' ') || b.name || 'Motorcycle';
const shortName = b => [b.year, b.make, b.model].filter(Boolean).join(' ') || b.name || 'Motorcycle';
const SERVICE_ITEMS = ['Oil','Oil filter','Valve clearance','Air filter','Tires','Brake pads','Chain'];

function serviceProfileFor(b) {
  const key = `${b.year || ''} ${b.make || ''} ${b.model || ''}`.toLowerCase();
  if (/crf\s*450\s*(rl|l)/.test(key)) return {
    source: 'CRF450RL suggested profile — verify owner’s manual',
    items: [
      ['Oil',600,15],['Oil filter',1200,30],['Valve clearance',1800,45],['Air filter',600,15],
      ['Tires',600,null],['Brake pads',600,null],['Chain',300,null]
    ]
  };
  if (/f\s*800\s*gs/.test(key)) return {
    source: 'F800GS suggested profile — verify owner’s manual',
    items: [
      ['Oil',6000,100],['Oil filter',6000,100],['Valve clearance',12000,200],['Air filter',12000,200],
      ['Tires',6000,null],['Brake pads',6000,null],['Chain',600,null]
    ]
  };
  return {
    source: 'General motorcycle baseline — verify manufacturer schedule',
    items: [
      ['Oil',3000,75],['Oil filter',3000,75],['Valve clearance',12000,250],['Air filter',3000,75],
      ['Tires',3000,null],['Brake pads',3000,null],['Chain',500,null]
    ]
  };
}

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

function clickLegacy(regex) {
  const el = [...document.querySelectorAll('button,[role="button"],a')].find(x => !x.closest('#garageIntelligence') && regex.test(x.textContent || ''));
  if (el) el.click();
}

function hideLegacyGarage(main) {
  [...main.querySelectorAll('article,.card,.motorcycleCard,.bikeCard')].forEach(el => {
    if (el.closest('#garageIntelligence')) return;
    const text = el.textContent || '';
    if (/Open motorcycle profile/i.test(text) && /Edit/i.test(text) && /Delete/i.test(text)) el.hidden = true;
  });
  [...main.querySelectorAll('button,a')].forEach(el => {
    if (!el.closest('#garageIntelligence') && /add bike|add motorcycle/i.test(el.textContent || '')) el.classList.add('legacyGarageAdd');
  });
}

async function resolveBikeImage(b) {
  const key = `motocloud-bike-image:${name(b).toLowerCase()}`;
  const cached = localStorage.getItem(key);
  if (cached) return cached;
  try {
    const q = encodeURIComponent(`${name(b)} motorcycle`);
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${q}&gsrlimit=3&prop=pageimages&piprop=thumbnail&pithumbsize=420&format=json&origin=*`;
    const response = await fetch(url);
    const json = await response.json();
    const pages = Object.values(json?.query?.pages || {});
    const image = pages.find(p => p.thumbnail?.source)?.thumbnail?.source;
    if (image) { localStorage.setItem(key, image); return image; }
  } catch (error) { console.debug('Bike image lookup unavailable', error); }
  return '';
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
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.querySelectorAll('[data-save-service]').forEach(btn => btn.onclick = async () => {
    const row = btn.closest('[data-service-row]');
    const values = Object.fromEntries([...row.querySelectorAll('[data-field]')].map(i => [i.dataset.field, n(i.value)]));
    await supabase.from('maintenance_intervals').update(values).eq('id', btn.dataset.saveService);
    btn.textContent = 'Saved'; setTimeout(() => btn.textContent = 'Save', 900); render(true);
  });
  modal.querySelector('[data-add-defaults]').onclick = async () => { await seedServiceDefaults(b, rows); modal.remove(); openServiceManager(b); };
  modal.querySelector('[data-add-service]').onclick = async () => {
    const item_name = prompt('Custom maintenance item:'); if (!item_name) return;
    await supabase.from('maintenance_intervals').insert({ user_id:session.user.id,bike_id:b.id,item_name,interval_miles:null,interval_hours:null,last_service_miles:Number(b.odometer||0),last_service_hours:0,last_service_at:new Date().toISOString(),enabled:true });
    modal.remove(); openServiceManager(b);
  };
}

async function render(force = false) {
  const main = $('#main');
  if (!main || !/Motorcycles|Overview/i.test(main.textContent || '')) return;
  if ($('#garageIntelligence') && !force) { hideLegacyGarage(main); return; }
  $('#garageIntelligence')?.remove();

  const s = document.createElement('section');
  s.id = 'garageIntelligence';
  s.className = 'garageIntel garageIntelV2';
  s.innerHTML = `<div class="garageIntelHead"><div><small>FLEET INTELLIGENCE</small><h2>My Garage</h2></div><div class="garageHeadActions"><button id="addBikeFromGarage" class="garageAddBike">＋ Add Bike</button><button id="refreshGarageIntel" class="garageRefresh" aria-label="Refresh fleet">↻</button></div></div><div id="garageFleetSummary" class="garageFleetSummary" aria-live="polite"></div><div id="garageIntelGrid" class="garageIntelGrid"><p class="garageLoading">Loading garage…</p></div>`;
  main.prepend(s);
  $('#refreshGarageIntel').onclick = () => render(true);
  $('#addBikeFromGarage').onclick = () => clickLegacy(/add bike|add motorcycle/i);

  const records = [];
  for (const b of bikes) {
    const d = await intel(b);
    const hours = d.rides.reduce((a, x) => a + Number(x.duration_seconds || 0), 0) / 3600;
    const odo = Number(b.odometer || 0);
    const economy = mpg(d.fuel);
    const due = d.maint.map(x => ({ name:x.item_name, left:n(x.interval_miles)!==null ? Number(x.interval_miles) - (odo - Number(x.last_service_miles || 0)) : Infinity })).sort((a,z)=>a.left-z.left)[0];
    const used = d.tire ? Math.max(0, odo - Number(d.tire.installed_odometer_miles || odo)) : 0;
    records.push({ b,d,hours,odo,economy,due,used,state:dueState(due) });
  }

  const totalMiles = records.reduce((sum,x)=>sum+x.odo,0), totalHours = records.reduce((sum,x)=>sum+x.hours,0), servicesDue = records.filter(x=>x.due&&x.due.left<=0).length;
  $('#garageFleetSummary').innerHTML = `<div><span>🏍️</span><b>${records.length}</b><small>Bikes</small></div><div><span>🛣️</span><b>${totalMiles.toFixed(0)}</b><small>Total mi</small></div><div><span>◷</span><b>${totalHours.toFixed(1)}</b><small>Total hr</small></div><div class="${servicesDue?'summaryAlert':''}"><span>🔧</span><b>${servicesDue}</b><small>Services due</small></div>`;

  const cards = records.map(({b,d,hours,odo,economy,due,used,state}) => `<article class="garageBikeCard" data-bike-card="${b.id}"><header class="garageBikeHeader"><div class="garageBikeAvatar" data-bike-image="${b.id}" aria-label="${esc(shortName(b))}"><span>🏍️</span></div><div class="garageBikeIdentity"><h3>${esc(shortName(b))}</h3><p>${odo.toFixed(1)} mi • ${hours.toFixed(1)} hr</p><span class="garageStatus garageStatus-${state.tone}"><i></i>${esc(state.label)}</span></div><button class="garageMore" data-edit-bike="${b.id}" aria-label="Bike options">•••</button></header><div class="garagePrimaryStats"><span><i>▥</i><b>${odo.toFixed(1)}</b><small>mi</small></span><span><i>◷</i><b>${hours.toFixed(1)}</b><small>hr</small></span><span><i>⛽</i><b>${economy?economy.toFixed(1):'—'}</b><small>mpg</small></span></div><div class="garageHealthRow"><span><i>⛽</i><strong>Fuel</strong><small>${d.fuel.length?`${d.fuel.length} entries`:'Not set'}</small></span><span><i>🔧</i><strong>Service</strong><small>${esc(state.service)}</small></span><span><i>🛞</i><strong>Tires</strong><small>${d.tire?esc(d.tire.name):'Not set'}</small></span></div><footer class="garageActions garageActionsSix"><button data-fuel="${b.id}"><i>⛽</i>Fuel</button><button data-service="${b.id}"><i>🔧</i>Service</button><button data-tires="${b.id}"><i>🛞</i>Tires</button><button data-ride-log="${b.id}"><i>▤</i>Ride Log</button><button data-history="${b.id}"><i>⌁</i>History</button><button data-settings="${b.id}"><i>⚙</i>Settings</button></footer><details class="garageDetails"><summary>View Details</summary><div><span><small>Next service</small><b>${due?esc(due.name):'Not set'}</b></span><span><small>Tire mileage</small><b>${d.tire?`${used.toFixed(0)} mi`:'—'}</b></span><span><small>Fuel economy</small><b>${economy?`${economy.toFixed(1)} mpg`:'—'}</b></span></div></details></article>`);
  $('#garageIntelGrid').innerHTML = cards.join('') || '<p class="garageEmpty">Add a motorcycle to begin tracking your fleet.</p>';

  document.querySelectorAll('[data-fuel]').forEach(x=>x.onclick=()=>fuel(bikes.find(b=>b.id===x.dataset.fuel)));
  document.querySelectorAll('[data-service]').forEach(x=>x.onclick=()=>openServiceManager(bikes.find(b=>b.id===x.dataset.service)));
  document.querySelectorAll('[data-tires]').forEach(x=>x.onclick=()=>tires(bikes.find(b=>b.id===x.dataset.tires)));
  document.querySelectorAll('[data-ride-log],[data-history]').forEach(x=>x.onclick=()=>openRideLog(x.dataset.rideLog||x.dataset.history));
  document.querySelectorAll('[data-settings],[data-edit-bike]').forEach(x=>x.onclick=()=>clickLegacy(/edit/i));
  records.forEach(async ({b}) => { const src = await resolveBikeImage(b); if (!src) return; const avatar = document.querySelector(`[data-bike-image="${b.id}"]`); if (avatar) avatar.innerHTML = `<img src="${esc(src)}" alt="${esc(shortName(b))}">`; });
  hideLegacyGarage(main);
}

async function fuel(b) {
  const odometer=Number(prompt('Current odometer:',b.odometer||0)), gallons=Number(prompt('Gallons added:','2')), total_cost=Number(prompt('Total cost:','0')), tank_capacity_gallons=Number(prompt('Tank capacity gallons:',''));
  if(!Number.isFinite(odometer)||!Number.isFinite(gallons)||gallons<=0)return;
  await supabase.from('fuel_entries').insert({user_id:session.user.id,bike_id:b.id,odometer_miles:odometer,gallons,total_cost:Number.isFinite(total_cost)?total_cost:0,full_tank:confirm('Was this a full fill-up?')});
  await supabase.from('bike_trip_settings').upsert({bike_id:b.id,user_id:session.user.id,tank_capacity_gallons:Number.isFinite(tank_capacity_gallons)&&tank_capacity_gallons>0?tank_capacity_gallons:null,last_fill_odometer:odometer,miles_since_fill:0,updated_at:new Date().toISOString()}); render(true);
}

async function tires(b) {
  const profile=prompt('Profile name (example: Supermoto set):'); if(!profile)return;
  const wheel_setup=prompt('Wheel setup:',''), front_tire=prompt('Front tire:',''), rear_tire=prompt('Rear tire:',''), front_psi=n(prompt('Front PSI:','')), rear_psi=n(prompt('Rear PSI:','')), expected_life_miles=n(prompt('Expected life miles:','4000'));
  await supabase.from('tire_profiles').update({active:false}).eq('bike_id',b.id);
  await supabase.from('tire_profiles').insert({user_id:session.user.id,bike_id:b.id,name:profile,wheel_setup,front_tire,rear_tire,front_psi,rear_psi,installed_odometer_miles:Number(b.odometer||0),expected_life_miles,active:true}); render(true);
}

async function init() {
  const {data:{session:s}}=await supabase.auth.getSession(); session=s; if(!s)return;
  const {data}=await supabase.from('bikes').select('*'); bikes=data||[];
  new MutationObserver(()=>queueMicrotask(()=>render())).observe(document.body,{childList:true,subtree:true}); render();
}

init();