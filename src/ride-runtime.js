import { supabase } from './supabase.js';
import { rideJournal, configureRideJournal } from './ride-journal.js';
import { RideRecorder } from './ride-recorder.js';
import { syncRide } from './ride-sync.js';
import { reviewContext, clearReviewContext } from './ride-review-data.js';

configureRideJournal(supabase.supabaseUrl || location.origin);
const listeners = new Set();
export const subscribeRecorder = listener => { listeners.add(listener); return () => listeners.delete(listener); };

async function acquireCapture() {
  if (!navigator.locks) throw new Error('Ride recording requires a browser with Web Locks support on a secure origin.');
  return new Promise((resolve, reject) => {
    navigator.locks.request('moto-ride-capture', { ifAvailable: true }, async lock => {
      if (!lock) { reject(new Error('Another Moto tab is recording. Return to that tab.')); return; }
      await new Promise(release => resolve(release));
    }).catch(reject);
  });
}
export const recorder = new RideRecorder({
  journal: rideJournal,
  context: reviewContext,
  stopped: ride => window.dispatchEvent(new CustomEvent('moto-ride-stopped', { detail: { id: ride.id, owner: ride.owner } })),
  acquireCapture,
  watch: (success, error) => {
    if (!navigator.geolocation) throw new Error('GPS is unavailable.');
    window.__motoRecordingActive = true;
    let lastSampleAt = 0;
    return navigator.geolocation.watchPosition(position => {
      const timestamp = position.timestamp;
      if (timestamp - lastSampleAt < 1000) return;
      lastSampleAt = timestamp;
      success(position);
    }, error, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  },
  unwatch: id => { navigator.geolocation.clearWatch(id); window.__motoRecordingActive = false; },
  changed: state => listeners.forEach(listener => listener(state)),
  synchronize: async (owner, isCurrentOwner) => {
    if (!navigator.onLine) throw new Error('Offline. Reconnect and retry the upload.');
    if (!navigator.locks) throw new Error('This browser cannot coordinate safe synchronization.');
    await navigator.locks.request(`moto-ride-sync:${owner}`, async () => {
      for (const ride of await rideJournal.list(owner)) {
        if (!isCurrentOwner(owner)) return;
        if (ride.status === 'synced' || ride.status === 'recording') continue;
        const saved = await syncRide({ journal: rideJournal, client: supabase, owner, id: ride.id, isCurrentOwner });
        if (saved?.status === 'synced' && isCurrentOwner(owner)) window.dispatchEvent(new CustomEvent('moto-ride-complete', { detail: {
          sessionId: ride.id, bikeId: ride.bike.id, distanceMiles: ride.distanceMiles,
          durationSeconds: Math.floor((ride.stoppedAt - ride.startedAt) / 1000)
        } }));
      }
    });
  }
});
export async function exportLocalRide() {
  if (!recorder.ride) throw new Error('No local ride selected.');
  const data = await rideJournal.export(recorder.owner, recorder.ride.id);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `moto-recovery-${recorder.ride.id}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export { rideJournal };

supabase.auth.onAuthStateChange(() => clearReviewContext());
