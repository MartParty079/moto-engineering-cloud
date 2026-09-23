import { supabase } from './supabase.js';
import { roadCache } from './road-cache.js';
import { rideJournal } from './ride-runtime.js';
import { openRideReview } from './ride-review.js';

const app = document.querySelector('#app');
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const bikeName = bike => [bike.year, bike.make, bike.model].filter(Boolean).join(' ') || bike.name || 'Motorcycle';
let session = null;
let loadVersion = 0;
let loadError = '';
let view = localStorage.getItem('motoSimpleView') || 'garage';
let state = { bikes: [], maintenance: [], rides: [] };

function authScreen(message = '') {
  app.innerHTML = `<main class="authPage"><section class="authCard"><h1>Moto Mission — Sign in</h1><form id="authForm"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Sign in</button></form><p id="authMessage" class="statusText" role="status">${esc(message)}</p></section></main>`;
  document.querySelector('#authForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    const messageNode = document.querySelector('#authMessage');
    const fields = new FormData(form);
    button.disabled = true;
    messageNode.textContent = 'Signing in…';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: fields.get('email'), password: fields.get('password') });
      if (error) throw error;
    } catch (error) { messageNode.textContent = error.message || 'Unable to connect. Try again.'; }
    finally { button.disabled = false; }
  };
}

async function loadData() {
  if (!session?.user) return;
  const version = ++loadVersion;
  const owner = session.user.id;
  const [bikes, maintenance, rides, localRides] = await Promise.all([
    supabase.from('bikes').select('*').eq('user_id', owner).order('created_at'),
    supabase.from('maintenance').select('*').eq('user_id', owner).order('created_at', { ascending: false }).limit(50),
    supabase.from('ride_sessions').select('*').eq('user_id', owner).order('started_at', { ascending: false }).limit(50),
    rideJournal.list(owner).catch(() => [])
  ]);
  if (version !== loadVersion || session?.user.id !== owner) return;
  loadError = [bikes, maintenance, rides].some(result => result.error) ? 'Some records could not be loaded. Please retry.' : '';
  const history = new Map((rides.data || []).map(ride => [ride.id, ride]));
  for (const ride of localRides.filter(ride => ['pending','synced'].includes(ride.status))) history.set(ride.id, {
    ...history.get(ride.id), id: ride.id, bike_name: ride.bikeName, started_at: new Date(ride.startedAt).toISOString(), ended_at: new Date(ride.stoppedAt).toISOString(),
    distance_miles: ride.distanceMiles, duration_seconds: Math.floor((ride.stoppedAt-ride.startedAt)/1000), average_speed_mph: ride.speedCount?ride.speedSum/ride.speedCount:0,
    max_speed_mph: ride.maxSpeedMph, status: ride.status==='synced'?'complete':'pending'
  });
  state = { bikes: bikes.data || [], maintenance: maintenance.data || [], rides: [...history.values()].sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at)).slice(0,100) };
  renderShell();
}

function renderShell() {
  app.innerHTML = `<header class="appHeader"><strong>Moto Mission</strong><div class="headerActions"><button id="logout" class="iconButton" aria-label="Sign out">Sign out</button></div></header><main class="appBody"><nav class="simpleNav" aria-label="Main navigation"><button id="openRide">Ride</button><button id="openMap">Map</button><button data-view="garage" class="${view === 'garage' ? 'active' : ''}">Garage</button><button data-view="service" class="${view === 'service' ? 'active' : ''}">Service</button><button data-view="history" class="${view === 'history' ? 'active' : ''}">Ride history</button></nav>${loadError ? `<p role="alert">${esc(loadError)} <button id="retryLoad">Retry</button></p>` : ''}<section id="content"></section></main><div id="toast" class="toast" role="status"></div>`;
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { view = button.dataset.view; localStorage.setItem('motoSimpleView', view); renderShell(); });
  document.querySelector('#openRide').onclick = () => window.MotoRideDash?.open?.();
  document.querySelector('#openMap').onclick = () => window.MotoMap?.open?.();
  document.querySelector('#openMap').insertAdjacentHTML('afterend', '<button id="openGpx">GPX</button>');
  document.querySelector('#openGpx').onclick = () => window.MotoMap?.open?.({ tab: 'gpx' });
  document.querySelector('#logout').onclick = async () => { const { error } = await supabase.auth.signOut(); if (error) toast(error.message); };
  document.querySelector('#retryLoad')?.addEventListener('click', loadData);
  renderView();
}

function renderView() {
  const content = document.querySelector('#content');
  if (view === 'service') return renderService(content);
  if (view === 'history') return renderHistory(content);
  renderGarage(content);
}

function renderGarage(content) {
  content.innerHTML = `<div class="sectionHead"><div><h1>Garage</h1></div><button id="addBike" class="primary">Add bike</button></div><div class="cardGrid">${state.bikes.map(bike => `<article class="bikeCard"><div><h2>${esc(bikeName(bike))}</h2><p>${Number(bike.odometer || 0).toLocaleString()} mi</p></div><button data-bike-edit="${bike.id}">Edit</button></article>`).join('') || '<div class="emptyState">No motorcycles yet.</div>'}</div>`;
  document.querySelector('#addBike').onclick = () => bikeDialog();
  document.querySelectorAll('[data-bike-edit]').forEach(button => button.onclick = () => bikeDialog(state.bikes.find(bike => String(bike.id) === button.dataset.bikeEdit)));
}

function renderService(content) {
  content.innerHTML = `<div class="sectionHead"><div><h1>Service</h1></div><button id="addService">Add service</button></div><div class="list">${state.maintenance.map(item => `<article class="listRow"><div><h2>${esc(item.service || item.title || item.name || 'Service record')}</h2><p>${esc(item.notes || item.status || '')}</p></div><time>${esc(item.service_date || (item.created_at ? new Date(item.created_at).toLocaleDateString() : ''))}</time><button data-service-edit="${esc(item.id)}">Edit</button></article>`).join('') || '<div class="emptyState">No service records yet.</div>'}</div>`;
  document.querySelector('#addService').onclick = () => serviceDialog();
  document.querySelectorAll('[data-service-edit]').forEach(button => button.onclick = () => serviceDialog(state.maintenance.find(item => String(item.id) === button.dataset.serviceEdit)));
}

function renderHistory(content) {
  content.innerHTML = `<div class="sectionHead"><div><h1>Ride history</h1></div></div><div class="list">${state.rides.map(ride => `<article class="listRow"><div><h2>${esc(ride.bike_name || 'Ride')}</h2><p>${Number(ride.distance_miles || 0).toFixed(1)} mi · ${Math.round(Number(ride.duration_seconds || 0) / 60)} min · ${Math.round(Number(ride.average_speed_mph || 0))} mph avg</p></div><time>${ride.started_at ? new Date(ride.started_at).toLocaleDateString() : ''}</time><button type="button" data-review="${esc(ride.id)}">Review${ride.status==='pending'?' · pending upload':''}</button></article>`).join('') || '<div class="emptyState">No recorded rides yet.</div>'}</div>`;
  content.querySelectorAll('[data-review]').forEach(button => button.onclick = () => {
    const owner=session.user.id,id=button.dataset.review;
    void openRideReview(owner,id,()=>session?.user.id===owner,state.rides.find(r=>r.id===id));
  });
}

function bikeDialog(bike = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'simpleDialog';
  dialog.innerHTML = `<form method="dialog" id="bikeForm"><div class="dialogHead"><h2>${bike.id ? 'Edit motorcycle' : 'Add motorcycle'}</h2><button value="cancel" formnovalidate aria-label="Close">×</button></div><div class="formGrid"><label>Year<input name="year" inputmode="numeric" value="${esc(bike.year || '')}"></label><label>Make<input name="make" value="${esc(bike.make || '')}" required></label><label>Model<input name="model" value="${esc(bike.model || '')}" required></label><label>Odometer (mi)<input name="odometer" type="number" min="0" step="1" value="${esc(bike.odometer || 0)}"></label></div><div class="dialogActions"><button value="cancel">Cancel</button><button class="primary" value="default">Save</button></div></form>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('#bikeForm').onsubmit = async event => {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') { dialog.close(); return; }
    const record = Object.fromEntries(new FormData(event.currentTarget));
    record.user_id = session.user.id;
    record.odometer = Number(record.odometer || 0);
    const result = bike.id ? await supabase.from('bikes').update(record).eq('id', bike.id) : await supabase.from('bikes').insert(record);
    if (result.error) return toast(result.error.message);
    dialog.close();
    await loadData();
  };
  dialog.showModal();
}

function serviceDialog(item = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'simpleDialog';
  dialog.innerHTML = `<form><div class="dialogHead"><h2>${item.id ? 'Edit service' : 'Add service'}</h2></div>
    <div class="formGrid">
      <label>Service<input name="service" value="${esc(item.service || '')}" required></label>
      <label>Motorcycle<select name="bike"><option value="">Unspecified</option>${state.bikes.map(bike => `<option ${item.bike === bikeName(bike) ? 'selected' : ''}>${esc(bikeName(bike))}</option>`).join('')}</select></label>
      <label>Date<input name="service_date" type="date" value="${esc(item.service_date || new Date().toISOString().slice(0,10))}" required></label>
      <label>Odometer (mi)<input name="odometer" type="number" min="0" value="${Number(item.odometer || 0)}"></label>
      <label>Cost ($)<input name="cost" type="number" min="0" step=".01" value="${Number(item.cost || 0)}"></label>
      <label>Notes<textarea name="notes">${esc(item.notes || '')}</textarea></label>
    </div><p role="status"></p><div class="dialogActions"><button type="button" data-cancel>Cancel</button><button type="submit">Save</button></div></form>`;
  document.body.appendChild(dialog);
  dialog.onclose = () => dialog.remove();
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const record = Object.fromEntries(new FormData(event.currentTarget));
      record.cost = Number(record.cost);
      record.odometer = Number(record.odometer);
      record.user_id = session.user.id;
      const result = item.id
        ? await supabase.from('maintenance').update(record).eq('id', item.id).eq('user_id', session.user.id)
        : await supabase.from('maintenance').insert(record);
      if (result.error) throw result.error;
      dialog.close();
      await loadData();
    } catch (error) { dialog.querySelector('[role="status"]').textContent = error.message; }
    finally { button.disabled = false; }
  };
  dialog.showModal();
}

window.addEventListener('moto-ride-stopped', event => {
  const {id,owner}=event.detail;
  if(session?.user.id!==owner)return;
  window.MotoRideDash?.close(); window.MotoMap?.close();
  void openRideReview(owner,id,()=>session?.user.id===owner);
  void loadData();
});
window.addEventListener('moto-ride-complete', () => { if (session) loadData(); });

function toast(message) {
  const node = document.querySelector('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2800);
}

supabase.auth.onAuthStateChange((_event, nextSession) => { if (session?.user.id !== nextSession?.user.id) document.querySelectorAll('dialog').forEach(dialog => dialog.close()); session = nextSession; roadCache.scope(session?.user.id, supabase.supabaseUrl); setTimeout(() => { if (session) loadData(); else { ++loadVersion; state = { bikes: [], maintenance: [], rides: [] }; window.MotoRideDash?.close(); window.MotoMap?.close(); document.querySelectorAll('dialog').forEach(dialog => dialog.close()); authScreen(); } }, 0); });
const { data } = await supabase.auth.getSession();
session = data.session;
roadCache.scope(session?.user.id, supabase.supabaseUrl);
if (session) await loadData(); else authScreen();
