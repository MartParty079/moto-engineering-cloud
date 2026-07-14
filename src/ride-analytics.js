import { supabase } from './supabase.js';

const $ = selector => document.querySelector(selector);
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));
const mph = value => Number(value || 0) * 2.236936;

function injectNav() {
  const nav = $('#nav');
  if (!nav || $('#rideAnalyticsNav')) return false;
  const button = document.createElement('button');
  button.id = 'rideAnalyticsNav';
  button.innerHTML = '<span class="navIcon">⌁</span><span>Ride Analytics</span><em>NEW</em>';
  button.onclick = openAnalytics;
  const group = [...nav.querySelectorAll('.navGroup')].find(item => item.querySelector('.navLabel')?.textContent.trim() === 'Operations');
  (group || nav).appendChild(button);
  return true;
}

function chart(rows, key, label, convert = value => value) {
  const points = rows.map((row, index) => ({ index, value: convert(Number(row[key])) })).filter(point => Number.isFinite(point.value));
  if (points.length < 2) return `<div class="analyticsEmpty">No ${esc(label.toLowerCase())} data recorded.</div>`;
  const min = Math.min(...points.map(point => point.value));
  const max = Math.max(...points.map(point => point.value));
  const span = Math.max(0.001, max - min);
  const width = 720, height = 230, pad = 30;
  const polyline = points.map((point, index) => {
    const x = pad + index / Math.max(1, points.length - 1) * (width - pad * 2);
    const y = height - pad - (point.value - min) / span * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)} chart"><line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}"/><polyline points="${polyline}"/><text x="${pad}" y="20">${esc(label)} · ${max.toFixed(1)} max</text></svg>`;
}

function summaryCard(label, value) {
  return `<article><small>${esc(label)}</small><strong>${esc(value)}</strong></article>`;
}

async function openAnalytics() {
  document.querySelector('#rideAnalyticsOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rideAnalyticsOverlay';
  overlay.innerHTML = `<section class="analyticsShell"><header><div><small>POST-RIDE INTELLIGENCE</small><h2>Ride Analytics</h2></div><button id="closeAnalytics" aria-label="Close">×</button></header><div id="analyticsBody"><div class="analyticsEmpty">Loading completed rides…</div></div></section>`;
  document.body.appendChild(overlay);
  $('#closeAnalytics').onclick = () => overlay.remove();

  const { data: rides, error } = await supabase.from('ride_sessions').select('*').eq('status', 'complete').order('started_at', { ascending: false }).limit(30);
  const body = $('#analyticsBody');
  if (!body) return;
  if (error) { body.innerHTML = `<div class="analyticsEmpty">${esc(error.message)}</div>`; return; }
  if (!rides?.length) { body.innerHTML = '<div class="analyticsEmpty">Complete a ride to generate analytics.</div>'; return; }

  body.innerHTML = `<label class="analyticsPicker"><span>RIDE</span><select id="analyticsRide">${rides.map(ride => `<option value="${ride.id}">${esc(ride.bike_name || 'Motorcycle')} · ${new Date(ride.started_at).toLocaleString()}</option>`).join('')}</select></label><div id="analyticsResult"></div>`;
  const loadSelected = () => loadRide(rides.find(ride => ride.id === $('#analyticsRide')?.value));
  $('#analyticsRide').onchange = loadSelected;
  loadSelected();
}

async function loadRide(ride) {
  const result = $('#analyticsResult');
  if (!result || !ride) return;
  result.innerHTML = '<div class="analyticsEmpty">Loading ride samples…</div>';
  const { data, error } = await supabase.from('ride_samples').select('*').eq('session_id', ride.id).order('recorded_at').limit(12000);
  if (error) { result.innerHTML = `<div class="analyticsEmpty">${esc(error.message)}</div>`; return; }
  const rows = data || [];
  const leanValues = rows.map(row => Math.abs(Number(row.lean_deg))).filter(Number.isFinite);
  const accelValues = rows.map(row => Number(row.accel_g)).filter(Number.isFinite);
  const maxLean = Math.max(Number(ride.max_lean_deg || 0), ...(leanValues.length ? leanValues : [0]));
  const maxG = Math.max(Number(ride.max_accel_g || 0), ...(accelValues.length ? accelValues : [0]));
  let gain = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const current = Number(rows[index].altitude_m), previous = Number(rows[index - 1].altitude_m);
    if (Number.isFinite(current) && Number.isFinite(previous) && current > previous) gain += (current - previous) * 3.28084;
  }
  const topLean = rows.filter(row => Number.isFinite(Number(row.lean_deg))).sort((a,b) => Math.abs(Number(b.lean_deg)) - Math.abs(Number(a.lean_deg))).slice(0,5);

  result.innerHTML = `<div class="analyticsSummary">${summaryCard('DISTANCE', `${Number(ride.distance_miles || 0).toFixed(1)} mi`)}${summaryCard('MAX SPEED', `${Math.round(Number(ride.max_speed_mph || 0))} mph`)}${summaryCard('MAX LEAN', `${maxLean.toFixed(1)}°`)}${summaryCard('MAX G', `${maxG.toFixed(2)} g`)}${summaryCard('ELEVATION GAIN', `${Math.round(gain)} ft`)}${summaryCard('SAMPLES', String(rows.length))}</div><section class="analyticsChart"><h3>Speed</h3>${chart(rows, 'speed_mps', 'Speed mph', mph)}</section><section class="analyticsChart"><h3>Lean angle</h3>${chart(rows, 'lean_deg', 'Lean angle')}</section><section class="analyticsChart"><h3>Acceleration</h3>${chart(rows, 'accel_g', 'Acceleration g')}</section><section class="analyticsChart"><h3>Elevation</h3>${chart(rows, 'altitude_m', 'Elevation m')}</section><section class="analyticsEvents"><h3>Top lean points</h3>${topLean.length ? topLean.map(row => `<article><strong>${Math.abs(Number(row.lean_deg)).toFixed(1)}°</strong><span>${Math.round(mph(row.speed_mps))} mph</span><small>${Number.isFinite(Number(row.latitude)) ? `${Number(row.latitude).toFixed(5)}, ${Number(row.longitude).toFixed(5)}` : 'No coordinates'}</small></article>`).join('') : '<div class="analyticsEmpty">No lean samples recorded yet.</div>'}</section>`;
}

let attempts = 0;
const navTimer = setInterval(() => {
  attempts += 1;
  if (injectNav() || attempts > 60) clearInterval(navTimer);
}, 1000);
injectNav();
