import { supabase } from './supabase.js';

const $ = selector => document.querySelector(selector);
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const mph = value => { const numeric=finite(value); return Number.isFinite(numeric)?numeric*2.236936:null; };

function injectNav() {
  const nav = $('#nav');
  if (!nav || $('#rideAnalyticsNav')) return false;
  const button = document.createElement('button');
  button.id = 'rideAnalyticsNav';
  button.innerHTML = '<span class="navIcon">⌁</span><span>Ride Analytics</span><em>NEW</em>';
  button.onclick = () => openAnalytics();
  const group = [...nav.querySelectorAll('.navGroup')].find(item => item.querySelector('.navLabel')?.textContent.trim() === 'Operations');
  (group || nav).appendChild(button);
  return true;
}

function chart(rows, key, label, convert = value => value) {
  const points = rows.map((row, index) => {
    const raw=finite(row[key]);
    const value=Number.isFinite(raw)?convert(raw):null;
    return { index, value };
  }).filter(point => Number.isFinite(point.value));
  if (points.length < 2) return `<div class="analyticsEmpty">No ${esc(label.toLowerCase())} data recorded.</div>`;
  const min = Math.min(...points.map(point => point.value));
  const max = Math.max(...points.map(point => point.value));
  const span = Math.max(0.001, max - min);
  const width = 720, height = 230, pad = 30;
  const polyline = points.map(point => {
    const x = pad + point.index / Math.max(1, rows.length - 1) * (width - pad * 2);
    const y = height - pad - (point.value - min) / span * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)} chart"><line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}"/><polyline points="${polyline}"/><text x="${pad}" y="20">${esc(label)} · ${max.toFixed(1)} max</text></svg>`;
}

function summaryCard(label, value) {
  return `<article><small>${esc(label)}</small><strong>${esc(value)}</strong></article>`;
}

async function openAnalytics(selectedRideId = null) {
  const requestedId = ['string','number'].includes(typeof selectedRideId) ? String(selectedRideId) : null;
  document.querySelector('#rideDetailModal')?.remove();
  document.querySelector('#rideAnalyticsOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rideAnalyticsOverlay';
  overlay.innerHTML = `<section class="analyticsShell"><header><div><small>POST-RIDE INTELLIGENCE</small><h2>Ride Analytics</h2></div><button id="closeAnalytics" aria-label="Close">×</button></header><div id="analyticsBody"><div class="analyticsEmpty">Loading completed rides…</div></div></section>`;
  document.body.appendChild(overlay);
  $('#closeAnalytics').onclick = () => overlay.remove();

  const { data, error } = await supabase.from('ride_sessions').select('*').eq('status', 'complete').order('started_at', { ascending: false }).limit(30);
  let rides = data || [];
  const body = $('#analyticsBody');
  if (!body) return;
  if (error) { body.innerHTML = `<div class="analyticsEmpty">${esc(error.message)}</div>`; return; }
  if (requestedId && !rides.some(ride => String(ride.id) === requestedId)) {
    const { data: requestedRide, error: requestedError } = await supabase.from('ride_sessions').select('*').eq('id', requestedId).eq('status', 'complete').maybeSingle();
    if (requestedError) { body.innerHTML = `<div class="analyticsEmpty">${esc(requestedError.message)}</div>`; return; }
    if (requestedRide) rides = [requestedRide, ...rides];
  }
  if (!rides.length) { body.innerHTML = '<div class="analyticsEmpty">Complete a ride to generate analytics.</div>'; return; }

  const selectedId = requestedId && rides.some(ride => String(ride.id) === requestedId) ? requestedId : String(rides[0].id);
  body.innerHTML = `<label class="analyticsPicker"><span>RIDE</span><select id="analyticsRide">${rides.map(ride => `<option value="${ride.id}" ${String(ride.id)===selectedId?'selected':''}>${esc(ride.bike_name || 'Motorcycle')} · ${new Date(ride.started_at).toLocaleString()}</option>`).join('')}</select></label><div id="analyticsResult"></div>`;
  const loadSelected = () => loadRide(rides.find(ride => String(ride.id) === String($('#analyticsRide')?.value)));
  $('#analyticsRide').onchange = loadSelected;
  loadSelected();
}

async function loadRide(ride) {
  const result = $('#analyticsResult');
  if (!result || !ride) return;
  result.innerHTML = '<div class="analyticsEmpty">Loading ride samples…</div>';
  const { data, error } = await supabase.from('ride_samples').select('*').eq('session_id', ride.id).order('recorded_at').limit(20000);
  if (error) { result.innerHTML = `<div class="analyticsEmpty">${esc(error.message)}</div>`; return; }
  const rows = data || [];
  const leanRows = rows.map(row => ({...row,lean:finite(row.lean_deg)})).filter(row => Number.isFinite(row.lean));
  const leanValues = leanRows.map(row => Math.abs(row.lean));
  const accelValues = rows.map(row => finite(row.accel_g)).filter(Number.isFinite);
  const maxLean = leanValues.length ? Math.max(...leanValues) : null;
  const storedMaxG = finite(ride.max_accel_g);
  const maxG = Math.max(storedMaxG??0, ...(accelValues.length ? accelValues : [0]));
  let gain = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const current = finite(rows[index].altitude_m), previous = finite(rows[index - 1].altitude_m);
    if (Number.isFinite(current) && Number.isFinite(previous) && current > previous) gain += (current - previous) * 3.28084;
  }
  const topLean = [...leanRows].sort((a,b) => Math.abs(b.lean) - Math.abs(a.lean)).slice(0,5);

  result.innerHTML = `<div class="analyticsSummary">${summaryCard('DISTANCE', `${Number(ride.distance_miles || 0).toFixed(1)} mi`)}${summaryCard('MAX SPEED', `${Math.round(Number(ride.max_speed_mph || 0))} mph`)}${summaryCard('MAX LEAN', Number.isFinite(maxLean)?`${maxLean.toFixed(1)}°`:'--')}${summaryCard('LEAN POINTS', String(leanRows.length))}${summaryCard('MAX G', `${maxG.toFixed(2)} g`)}${summaryCard('ELEVATION GAIN', `${Math.round(gain)} ft`)}${summaryCard('ALL SAMPLES', String(rows.length))}</div><section class="analyticsChart"><h3>Speed</h3>${chart(rows, 'speed_mps', 'Speed mph', mph)}</section><section class="analyticsChart"><h3>Lean angle</h3>${chart(rows, 'lean_deg', 'Calibrated lean angle')}</section><section class="analyticsChart"><h3>Acceleration</h3>${chart(rows, 'accel_g', 'Acceleration g')}</section><section class="analyticsChart"><h3>Elevation</h3>${chart(rows, 'altitude_m', 'Elevation m')}</section><section class="analyticsEvents"><h3>Top calibrated lean points</h3>${topLean.length ? topLean.map(row => {const speed=mph(row.speed_mps);return `<article><strong>${Math.abs(row.lean).toFixed(1)}°</strong><span>${Number.isFinite(speed)?`${Math.round(speed)} mph`:'-- mph'}</span><small>${Number.isFinite(finite(row.latitude)) && Number.isFinite(finite(row.longitude)) ? `${finite(row.latitude).toFixed(5)}, ${finite(row.longitude).toFixed(5)}` : 'No coordinates'}</small></article>`}).join('') : '<div class="analyticsEmpty">No calibrated lean points were saved for this ride.</div>'}</section>`;
}

window.MotoRideAnalytics = { open: openAnalytics };
window.addEventListener('moto-open-ride-analytics', event => openAnalytics(event.detail?.rideId));

let attempts = 0;
const navTimer = setInterval(() => {
  attempts += 1;
  if (injectNav() || attempts > 60) clearInterval(navTimer);
}, 1000);
injectNav();
