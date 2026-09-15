import { validPosition } from './location-validity.js';

let databaseName = 'moto-ride-journal-v1';
const range = (owner, id) => IDBKeyRange.bound([owner, id, 0], [owner, id, Number.MAX_SAFE_INTEGER]);
let connection;
export function configureRideJournal(projectUrl) {
  if (connection) throw new Error('Ride storage is already open.');
  databaseName = `moto-ride-journal-v1:${new URL(projectUrl).origin}`;
}

function open() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Durable ride storage is unavailable in this browser.'));
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('rides', { keyPath: ['owner', 'id'] }).createIndex('owner', 'owner');
      request.result.createObjectStore('samples', { keyPath: ['owner', 'rideId', 'sequence'] });
    };
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => { connection = null; reject(new Error('Close other Moto tabs to open ride storage.')); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
  });
  return connection;
}

async function transaction(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['rides', 'samples'], mode, { durability: 'strict' });
    let value, failure;
    const fail = error => { failure = error; tx.abort(); };
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(failure || tx.error || new Error('Ride storage transaction failed.'));
    tx.onerror = () => {};
    try { action(tx.objectStore('rides'), tx.objectStore('samples'), result => { value = result; }, fail); }
    catch (error) { fail(error); }
  });
}

function ownerRequired(owner) { if (!owner || typeof owner !== 'string') throw new Error('Sign in before accessing ride storage.'); }
function update(owner, id, change) {
  ownerRequired(owner);
  return transaction('readwrite', (rides, samples, done, fail) => {
    const get = rides.get([owner, id]);
    get.onsuccess = () => {
      try {
        if (!get.result) throw new Error('No local ride belongs to this account.');
        const ride = get.result;
        change(ride, samples);
        rides.put(ride);
        done(ride);
      } catch (error) { fail(error); }
    };
  });
}

function distanceMiles(a, b) {
  const rad = n => n * Math.PI / 180;
  const q = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 3958.7613 * Math.asin(Math.min(1, Math.sqrt(q)));
}

export const rideJournal = {
  async list(owner) {
    ownerRequired(owner);
    return transaction('readonly', (rides, samples, done) => {
      const get = rides.index('owner').getAll(owner);
      get.onsuccess = () => done(get.result);
    });
  },
  async create(owner, bike, now = Date.now()) {
    ownerRequired(owner);
    if (!bike?.id) throw new Error('Choose a motorcycle.');
    return transaction('readwrite', (rides, samples, done, fail) => {
      const get = rides.index('owner').getAll(owner);
      get.onsuccess = () => {
        if (get.result.some(r => r.status === 'recording')) return fail(new Error('Recover or finish your interrupted ride first.'));
        const ride = { version: 1, id: crypto.randomUUID(), owner, bike, bikeName: [bike.year, bike.make, bike.model].filter(Boolean).join(' ') || bike.name || 'Motorcycle',
          startedAt: now, lastCaptureAt: now, stoppedAt: null, status: 'recording', sequence: 0, acknowledged: 0, cloudCreated: false,
          distanceMiles: 0, maxSpeedMph: 0, speedSum: 0, speedCount: 0, latest: null, previous: null, interruptions: [] };
        rides.add(ride); done(ride);
      };
    });
  },
  append(owner, id, position) {
    if (!validPosition(position)) return Promise.reject(new Error('Invalid GPS fix.'));
    return update(owner, id, (ride, samples) => {
      if (ride.status !== 'recording') throw new Error('Ride is no longer recording.');
      if (position.timestamp < ride.lastCaptureAt || position.timestamp > Date.now() + 5000) throw new Error('Out-of-order or future GPS fix.');
      const c = position.coords;
      const finite = value => Number.isFinite(value) ? value : null;
      const speed = Number.isFinite(c.speed) && c.speed >= 0 && c.speed <= 250 / 2.236936 ? c.speed : null;
      const p = { latitude: c.latitude, longitude: c.longitude, altitude: finite(c.altitude), accuracy: Number.isFinite(c.accuracy) && c.accuracy >= 0 ? c.accuracy : null,
        speed: speed === null ? null : speed * 2.236936, heading: Number.isFinite(c.heading) && c.heading >= 0 && c.heading < 360 ? c.heading : null, timestamp: position.timestamp };
      if (ride.previous && p.accuracy !== null && p.accuracy < 80 && ride.previous.accuracy !== null && ride.previous.accuracy < 80) {
        const distance = distanceMiles(ride.previous, p);
        if (distance < 0.5) ride.distanceMiles += distance;
      }
      if (p.speed !== null) { ride.maxSpeedMph = Math.max(ride.maxSpeedMph, p.speed); ride.speedSum += p.speed; ride.speedCount++; }
      ride.previous = p; ride.latest = p; ride.lastCaptureAt = position.timestamp; ride.sequence++;
      samples.add({ owner, rideId: id, sequence: ride.sequence, row: { id: crypto.randomUUID(), session_id: id, user_id: owner,
        recorded_at: new Date(position.timestamp).toISOString(), latitude: p.latitude, longitude: p.longitude,
        altitude_m: p.altitude, accuracy_m: p.accuracy, speed_mps: speed, heading_deg: p.heading } });
    });
  },
  resume(owner, id) {
    return update(owner, id, ride => {
      if (ride.status !== 'recording') throw new Error('Only an interrupted recording can resume.');
      ride.interruptions.push({ from: ride.lastCaptureAt, to: Date.now() }); ride.previous = null;
    });
  },
  appendMotion(owner, id, input) {
    const fields = ['latitude','longitude','altitude_m','accuracy_m','speed_mps','heading_deg','accel_x','accel_y','accel_z','accel_g','rotation_beta','rotation_gamma','lean_deg','pitch_deg','roll_deg'];
    return update(owner, id, (ride, samples) => {
      if (ride.status !== 'recording') throw new Error('Ride is no longer recording.');
      const row = {};
      for (const field of fields) {
        const value = input[field];
        if (value != null && !Number.isFinite(value)) throw new Error('Invalid motion measurement.');
        row[field] = value ?? null;
      }
      if (row.latitude != null && Math.abs(row.latitude) > 90 || row.longitude != null && Math.abs(row.longitude) > 180) throw new Error('Invalid motion coordinates.');
      ride.sequence++;
      samples.add({ owner, rideId: id, sequence: ride.sequence, row: { ...row, id: crypto.randomUUID(), user_id: owner, session_id: id, recorded_at: new Date().toISOString() } });
    });
  },
  stop(owner, id, now = Date.now()) { return update(owner, id, ride => { if (ride.status !== 'recording') return; ride.status = 'pending'; ride.stoppedAt = now; }); },
  markCreated(owner, id) { return update(owner, id, ride => { ride.cloudCreated = true; }); },
  async batch(owner, id, limit = 100) {
    ownerRequired(owner);
    return transaction('readonly', (rides, samples, done) => {
      const get = samples.getAll(range(owner, id), Math.max(1, Math.min(100, limit)));
      get.onsuccess = () => done(get.result);
    });
  },
  acknowledge(owner, id, entries) {
    return update(owner, id, (ride, samples) => {
      for (const entry of entries) {
        if (entry.owner !== owner || entry.rideId !== id) throw new Error('Invalid sample acknowledgement.');
        samples.delete([owner, id, entry.sequence]);
        ride.acknowledged = Math.max(ride.acknowledged, entry.sequence);
      }
    });
  },
  markSynced(owner, id) { return update(owner, id, ride => { if (ride.status !== 'pending' || ride.acknowledged !== ride.sequence) throw new Error('Ride still has pending data.'); ride.status = 'synced'; }); },
  markCompletionRequested(owner, id) { return update(owner, id, ride => { if (ride.status !== 'pending') throw new Error('Ride is not ready for completion.'); ride.completionRequested = true; }); },
  markDiscarded(owner, id) { return update(owner, id, ride => { if (ride.completionRequested || ride.status === 'synced') throw new Error('Completion may already have updated mileage. Retry synchronization before managing the saved ride.'); ride.status = 'discarding'; }); },
  async remove(owner, id) {
    ownerRequired(owner);
    return transaction('readwrite', (rides, samples) => { rides.delete([owner, id]); samples.delete(range(owner, id)); });
  },
  async export(owner, id) {
    ownerRequired(owner);
    return transaction('readonly', (rides, samples, done, fail) => {
      const r = rides.get([owner, id]);
      r.onsuccess = () => {
        if (!r.result) return fail(new Error('Ride not found for this account.'));
        const s = samples.getAll(range(owner, id));
        s.onsuccess = () => done({ format: 'moto-local-ride-v1', ride: r.result, unsyncedSamples: s.result.map(x => x.row) });
      };
    });
  }
};
