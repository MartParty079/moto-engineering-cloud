import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { rideJournal as journal } from '../src/ride-journal.js';
import { RideRecorder } from '../src/ride-recorder.js';
import { syncRide } from '../src/ride-sync.js';

const bike = { id: '00000000-0000-4000-8000-000000000003', name: 'Test bike', odometer: 20 };
const fix = (timestamp = Date.now()) => ({ timestamp, coords: { latitude: 32, longitude: -97, speed: null, accuracy: 5, heading: null, altitude: null } });

test('journal isolates owners, persists atomic summaries, validates data and retains unacknowledged samples', async () => {
  const owner = crypto.randomUUID();
  const ride = await journal.create(owner, bike, Date.now() - 1000);
  for (let i = 0; i < 150; i++) await journal.append(owner, ride.id, fix());
  assert.equal((await journal.list(owner))[0].sequence, 150);
  assert.equal((await journal.list('another-account')).length, 0);
  await assert.rejects(journal.stop('another-account', ride.id), /belongs/);
  await assert.rejects(journal.append(owner, ride.id, { ...fix(), coords: { latitude: 91, longitude: 0 } }), /Invalid/);
  const batch = await journal.batch(owner, ride.id);
  assert.equal(batch.length, 100);
  assert.equal(batch[0].row.speed_mps, null);
  await journal.acknowledge(owner, ride.id, batch);
  assert.equal((await journal.batch(owner, ride.id)).length, 50);
  await journal.stop(owner, ride.id);
  await assert.rejects(journal.markSynced(owner, ride.id), /pending/);
  const exported = await journal.export(owner, ride.id);
  assert.equal(exported.unsyncedSamples.length, 50);
  await assert.rejects(journal.create(null, bike), /Sign in/);
});

test('ambiguous sample response retries stable IDs; absent completion RPC retains pending ride', async () => {
  const owner = crypto.randomUUID();
  const ride = await journal.create(owner, bike, Date.now() - 1000);
  await journal.append(owner, ride.id, fix()); await journal.stop(owner, ride.id);
  const stored = new Map(); let ambiguous = true, rpcAvailable = false, currentOwner = owner;
  const client = {
    from(table) { return { async upsert(input, options) {
      assert.equal(options.ignoreDuplicates, true); assert.equal(options.onConflict, table === 'ride_samples' ? 'client_sample_id' : 'id');
      for (const row of Array.isArray(input) ? input : [input]) stored.set(`${table}:${row.client_sample_id || row.id}`, row);
      if (table === 'ride_samples' && ambiguous) { ambiguous = false; return { error: { message: 'Response lost after server committed' } }; }
      return { data: null, error: null };
    } }; },
    async rpc(name, input) { assert.equal(name, 'complete_ride_v1'); assert.equal(input.p_sample_count, 1); return rpcAvailable ? { data: { session_id: ride.id, status: 'complete' } } : { error: { message: 'Missing RPC' } }; }
  };
  const run = () => syncRide({ journal, client, owner, id: ride.id, isCurrentOwner: value => value === currentOwner });
  await assert.rejects(run(), /Response lost/);
  assert.equal((await journal.batch(owner, ride.id)).length, 1);
  await assert.rejects(run(), /Missing RPC/);
  assert.equal(stored.size, 2, 'One session and one sample despite retry');
  assert.equal((await journal.list(owner))[0].status, 'pending');
  await assert.rejects(journal.markDiscarded(owner, ride.id), /Completion may already/);
  currentOwner = 'different-owner'; await assert.rejects(run(), /owner account/);
  currentOwner = owner; rpcAvailable = true;
  assert.equal((await run()).status, 'synced');
});

test('recorder recovers interrupted rides, stops capture on account change and preserves queued writes', async () => {
  const owner = crypto.randomUUID(); let success, cleared = 0, released = 0;
  const dependencies = { journal, synchronize: async () => { throw new Error('offline'); }, acquireCapture: async () => () => { released++; },
    watch: callback => { success = callback; return 1; }, unwatch: () => { cleared++; } };
  const first = new RideRecorder(dependencies);
  await first.setOwner(owner); await first.start(bike);
  const id = first.ride.id;
  success(fix()); await first.writeQueue;
  first.release();
  const restored = new RideRecorder(dependencies);
  await restored.setOwner(owner);
  assert.equal(restored.ride.id, id); assert.equal(restored.recording, false);
  await restored.resume(); assert.equal(restored.recording, true);
  success(fix());
  await restored.setOwner('different-account'); await restored.writeQueue;
  assert.equal(restored.ride, null); assert.equal(restored.recording, false);
  assert.ok(cleared >= 2 && released >= 2);
  await restored.setOwner(owner);
  assert.equal(restored.ride.sequence, 2);
  await restored.stop();
  assert.equal(restored.ride.status, 'pending'); assert.match(restored.error, /offline/);
});

test('storage failure stops capture instead of advertising unsaved data', async () => {
  let receive;
  const recorder = new RideRecorder({ journal: { ...journal, append: async () => { throw new Error('Quota exceeded'); } }, synchronize: async () => {},
    acquireCapture: async () => () => {}, watch: callback => { receive = callback; return 1; }, unwatch() {} });
  await recorder.setOwner(crypto.randomUUID()); await recorder.start(bike);
  receive(fix()); await recorder.writeQueue;
  assert.equal(recorder.recording, false); assert.equal(recorder.ride.sequence, 0);
  assert.match(recorder.error, /Quota exceeded/);
});
