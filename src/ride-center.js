import { supabase } from './supabase.js';
import { recorder, subscribeRecorder, exportLocalRide } from './ride-runtime.js';

// Preserve the unified Ride OS interface while the journal owns capture and recovery.
let bikes = [], rides = [], stopping = false, loadGeneration = 0;
const bikeName = bike => [bike.year, bike.make, bike.model].filter(Boolean).join(' ') || bike.name || 'Motorcycle';
const ft = value => Number.isFinite(value) ? value * 3.28084 : null;
function rideState() {
  const ride = recorder.ride, point = ride?.latest || {};
  const elapsed = ride ? Math.max(0, Math.floor(((ride.stoppedAt || Date.now()) - ride.startedAt) / 1000)) : 0;
  return {
    active: recorder.recording, recording: recorder.recording, starting: recorder.starting, stopping, syncing: recorder.syncing,
    status: ride ? (recorder.recording ? 'recording' : ride.status === 'recording' ? 'interrupted' : ride.status) : 'idle',
    bikeId: ride?.bike.id || null, bikeName: ride?.bikeName || null, sessionId: ride?.id || null,
    elapsedSeconds: elapsed, elapsedText: `${String(Math.floor(elapsed / 3600)).padStart(2,'0')}:${String(Math.floor(elapsed % 3600 / 60)).padStart(2,'0')}:${String(elapsed % 60).padStart(2,'0')}`,
    distanceMiles: ride?.distanceMiles || 0, speedMph: point.speed ?? null,
    averageSpeedMph: ride?.speedCount ? ride.speedSum / ride.speedCount : 0, maxSpeedMph: ride?.maxSpeedMph || 0,
    heading: point.heading ?? null, altitudeFt: ft(point.altitude), accuracyFt: ft(point.accuracy),
    latitude: point.latitude ?? null, longitude: point.longitude ?? null, gpsLocked: Boolean(ride?.latest),
    gpsError: recorder.error || null, error: recorder.error, bufferedSamples: ride ? ride.sequence - ride.acknowledged : 0,
    completionRequested: Boolean(ride?.completionRequested)
  };
}
function rideHistory() {
  return rides.map(ride => ({id:ride.id,bikeId:ride.bike_id,bikeName:ride.bike_name,startedAt:ride.started_at,endedAt:ride.ended_at,
    durationSeconds:Number(ride.duration_seconds || 0),distanceMiles:Number(ride.distance_miles || 0),maxSpeedMph:Number(ride.max_speed_mph || 0),
    averageSpeedMph:Number(ride.average_speed_mph || 0),status:ride.status}));
}
function publish() {
  const state = rideState();
  window.MotoRideState = state;
  window.__motoRecordingActive = recorder.recording;
  // Only capture owns this marker; recovery must not reactivate legacy motion writers.
  try {
    if (recorder.recording) localStorage.setItem('motoActiveRide', JSON.stringify({id:state.sessionId,bikeId:state.bikeId,startedAt:recorder.ride.startedAt,durable:true}));
    else localStorage.removeItem('motoActiveRide');
  } catch { /* IndexedDB is authoritative; this legacy UI hint is optional. */ }
  window.dispatchEvent(new CustomEvent('moto-ride-state',{detail:state}));
  return state;
}
async function loadData() {
  const generation = ++loadGeneration;
  const {data, error} = await supabase.auth.getSession();
  if (generation !== loadGeneration) return;
  const owner = error ? null : data.session?.user.id;
  await recorder.setOwner(owner || null);
  if (generation !== loadGeneration) return;
  if (!owner) { bikes = []; rides = []; }
  else {
    const [bikeResult, rideResult] = await Promise.all([
      supabase.from('bikes').select('*').eq('user_id',owner).order('created_at'),
      supabase.from('ride_sessions').select('*').eq('user_id',owner).order('started_at',{ascending:false}).limit(40)
    ]);
    if (generation !== loadGeneration || owner !== recorder.owner) return;
    if (bikeResult.error || rideResult.error) throw new Error('Garage or ride history could not be loaded.');
    bikes = bikeResult.data || []; rides = rideResult.data || [];
  }
  window.MotoRideHistory = rideHistory();
  window.dispatchEvent(new CustomEvent('moto-rides-update',{detail:window.MotoRideHistory}));
  publish();
}
const refresh = () => loadData().catch(error => { recorder.error = error.message; publish(); });
async function stop() {
  if (stopping) return rideState();
  stopping = true; publish();
  try { await recorder.stop(); await refresh(); return rideState(); }
  finally { stopping = false; publish(); }
}
window.MotoRide = {
  getState:rideState, getBikes:() => bikes.map(bike => ({id:bike.id,name:bikeName(bike),odometer:Number(bike.odometer || 0)})),
  getRides:rideHistory, refresh, stop,
  async start(id) { const bike = bikes.find(item => String(item.id) === String(id)); if (!bike) throw new Error('Choose a motorcycle from your garage.'); await recorder.start(bike); return publish(); },
  async resume() { await recorder.resume(); return publish(); },
  async retry() { await recorder.sync(); await refresh(); return publish(); },
  async discard() { await recorder.discard(); return publish(); },
  export:exportLocalRide,
  open() { if (window.MotoRideDash?.open) window.MotoRideDash.open(); else window.dispatchEvent(new CustomEvent('moto-ride-open-request')); }
};
let lifecycle = '';
subscribeRecorder(() => {
  const next = [recorder.owner,recorder.recording,recorder.starting,recorder.syncing,recorder.ride?.status,recorder.error].join('|');
  if (next !== lifecycle) { lifecycle = next; publish(); }
});
setInterval(() => { if (recorder.recording) publish(); },1000);
setInterval(() => { if (recorder.owner && !recorder.recording && !recorder.starting && recorder.ride?.status === 'pending') recorder.sync(); },15000);
window.addEventListener('online',() => { if (!recorder.recording) recorder.sync(); });
window.addEventListener('moto-ride-complete',refresh);
window.addEventListener('pagehide',() => { recorder.release(); publish(); });
window.addEventListener('pageshow',refresh);
supabase.auth.onAuthStateChange(() => setTimeout(refresh,0));
refresh();
