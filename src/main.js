import { supabase } from './supabase.js';

const app = document.querySelector('#app');
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const bikeName = bike => [bike.year, bike.make, bike.model].filter(Boolean).join(' ') || bike.name || 'Motorcycle';
let session = null;
let view = localStorage.getItem('motoSimpleView') || 'garage';
let state = { bikes: [], maintenance: [], rides: [] };

function authScreen(message = '') {
  app.innerHTML = `<main class="authPage"><section class="authCard"><div class="brandMark">M</div><p class="eyebrow">MOTO MISSION</p><h1>Your bikes and rides.<br>Nothing extra.</h1><form id="authForm"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Sign in</button></form><p id="authMessage" class="statusText" role="status">${esc(message)}</p></section></main>`;
  document.querySelector('#authForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    const messageNode = document.querySelector('#authMessage');
    const fields = new FormData(form);
    button.disabled = true;
    messageNode.textContent = 'Signing in…';
    const { error } = await supabase.auth.signInWithPassword({ email: fields.get('email'), password: fields.get('password') });
    if (error) { messageNode.textContent = error.message; button.disabled = false; }
  };
}

async function loadData() {
  if (!session?.user) return;
  const owner = session.user.id;
  const [bikes, maintenance, rides] = await Promise.all([
    supabase.from('bikes').select('*').eq('user_id', owner).order('created_at'),
    supabase.from('maintenance').select('*').eq('user_id', owner).order('created_at', { ascending: false }).limit(50),
    supabase.from('ride_sessions').select('*').eq('user_id', owner).order('started_at', { ascending: false }).limit(50)
  ]);
  state = { bikes: bikes.data || [], maintenance: maintenance.data || [], rides: rides.data || [] };
  renderShell();
}

function renderShell() {
  app.innerHTML = `<header class="appHeader"><div class="wordmark"><span>M</span><div><strong>Moto Mission</strong><small>Rider tools</small></div></div><div class="headerActions"><button id="openRide" class="primary">Ride</button><button id="openMap">Map</button><button id="logout" class="iconButton" aria-label="Sign out">↪</button></div></header><main class="appBody"><nav class="simpleNav" aria-label="Main navigation"><button data-view="garage" class="${view === 'garage' ? 'active' : ''}">Garage</button><button data-view="service" class="${view === 'service' ? 'active' : ''}">Service</button><button data-view="history" class="${view === 'history' ? 'active' : ''}">Ride history</button></nav><section id="content"></section></main><div id="toast" class="toast" role="status"></div>`;
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { view = button.dataset.view; localStorage.setItem('motoSimpleView', view); renderShell(); });
  document.querySelector('#openRide').onclick = () => window.MotoRideDash?.open?.();
  document.querySelector('#openMap').onclick = () => window.MotoMap?.open?.();
  document.querySelector('#logout').onclick = () => supabase.auth.signOut();
  renderView();
}

function renderView() {
  const content = document.querySelector('#content');
  if (view === 'service') return renderService(content);
  if (view === 'history') return renderHistory(content);
  renderGarage(content);
}

function renderGarage(content) {
  content.innerHTML = `<div class="sectionHead"><div><p class="eyebrow">YOUR MOTORCYCLES</p><h1>Garage</h1></div><button id="addBike" class="primary">Add bike</button></div><div class="cardGrid">${state.bikes.map(bike => `<article class="bikeCard"><div class="bikeIcon">${esc((bike.make || bike.name || 'M').slice(0, 1).toUpperCase())}</div><div><h2>${esc(bikeName(bike))}</h2><p>${Number(bike.odometer || 0).toLocaleString()} mi</p></div><button data-bike-edit="${bike.id}">Edit</button></article>`).join('') || '<div class="emptyState">No motorcycles yet.</div>'}</div>`;
  document.querySelector('#addBike').onclick = () => bikeDialog();
  document.querySelectorAll('[data-bike-edit]').forEach(button => button.onclick = () => bikeDialog(state.bikes.find(bike => String(bike.id) === button.dataset.bikeEdit)));
}

function renderService(content) {
  content.innerHTML = `<div class="sectionHead"><div><p class="eyebrow">MAINTENANCE</p><h1>Service</h1></div></div><div class="list">${state.maintenance.map(item => `<article class="listRow"><div><h2>${esc(item.service || item.title || item.name || 'Service record')}</h2><p>${esc(item.notes || item.status || '')}</p></div><time>${item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</time></article>`).join('') || '<div class="emptyState">No service records yet.</div>'}</div>`;
}

function renderHistory(content) {
  content.innerHTML = `<div class="sectionHead"><div><p class="eyebrow">RECORDED RIDES</p><h1>Ride history</h1></div></div><div class="list">${state.rides.map(ride => `<article class="listRow"><div><h2>${esc(ride.bike_name || 'Ride')}</h2><p>${Number(ride.distance_miles || 0).toFixed(1)} mi · ${Math.round(Number(ride.duration_seconds || 0) / 60)} min · ${Math.round(Number(ride.average_speed_mph || 0))} mph avg</p></div><time>${ride.started_at ? new Date(ride.started_at).toLocaleDateString() : ''}</time></article>`).join('') || '<div class="emptyState">No recorded rides yet.</div>'}</div>`;
}

function bikeDialog(bike = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'simpleDialog';
  dialog.innerHTML = `<form method="dialog" id="bikeForm"><div class="dialogHead"><h2>${bike.id ? 'Edit motorcycle' : 'Add motorcycle'}</h2><button value="cancel" aria-label="Close">×</button></div><div class="formGrid"><label>Year<input name="year" inputmode="numeric" value="${esc(bike.year || '')}"></label><label>Make<input name="make" value="${esc(bike.make || '')}" required></label><label>Model<input name="model" value="${esc(bike.model || '')}" required></label><label>Odometer (mi)<input name="odometer" type="number" min="0" step="1" value="${esc(bike.odometer || 0)}"></label></div><div class="dialogActions"><button value="cancel">Cancel</button><button class="primary" value="default">Save</button></div></form>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('#bikeForm').onsubmit = async event => {
    event.preventDefault();
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

function toast(message) {
  const node = document.querySelector('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2800);
}

supabase.auth.onAuthStateChange((_event, nextSession) => { session = nextSession; if (session) loadData(); else authScreen(); });
const { data } = await supabase.auth.getSession();
session = data.session;
if (session) await loadData(); else authScreen();
