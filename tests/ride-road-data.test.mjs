import test from 'node:test';
import assert from 'node:assert/strict';
import { roadReadout } from '../src/ride-road-data.js';

test('road readout shows mapped limits but never road-class estimates', () => {
  const road = { status: 'road', road: 'Main Street', limit: { mph: 35 }, limitKind: 'mapped', lanes: '2' };
  assert.equal(roadReadout(road).limit, '35');
  assert.equal(roadReadout(road).name, 'Main Street');
  assert.equal(roadReadout(road).lanes, '2');
  assert.equal(roadReadout({ ...road, limitKind: 'estimated' }).limit, '--');
  assert.equal(roadReadout({ ...road, limit: { mph: null } }).limit, '--');
  assert.equal(roadReadout({ ...road, limit: { mph: -3 } }).limit, '--');
  assert.equal(roadReadout({ status: 'no-road' }), null);
  assert.equal(roadReadout(null), null);
  assert.equal(roadReadout(road).surface, 'Unknown');
});

import { RoadDisplay, createRideRoadData } from '../src/ride-road-data.js';
const point = { latitude: 32, longitude: -97 };
const payload = { status: 'road', road: 'Main Street', limit: { mph: 35 }, limitKind: 'mapped' };

test('road values survive refresh and failure, then replace as one matched record', () => {
  const display = new RoadDisplay();
  const original = roadReadout(payload);
  display.accept(original, point, 1000);
  assert.equal(display.read(point, 31000, 'loading').data, original);
  assert.equal(display.read(point, 31000, 'loading').label, 'Updating');
  assert.equal(display.read(point, 61000, 'error').data, original);
  assert.equal(display.read(point, 61000, 'error').label, 'Last known');
  display.accept(null, point, 61000);
  assert.equal(display.read(point, 61000, 'unmatched').data, original);
  display.accept(roadReadout({ ...payload, road: 'Second Street', limit: null }), point, 62000);
  assert.equal(display.read(point, 62000).data.name, 'Second Street');
  assert.equal(display.read(point, 62000).data.limit, '--', 'Never attach previous road limit to a new road');
});

test('last-known road expires by request age or distance and delayed matches are labeled', () => {
  const display = new RoadDisplay();
  display.accept(roadReadout(payload), point, 1000);
  assert.equal(display.read({ ...point, latitude: 32.002 }, 2000).label, 'Last known');
  assert.ok(display.read(point, 121000, 'error').data);
  assert.equal(display.read(point, 121001, 'error').data, null);
  display.accept(roadReadout(payload), point, 200000);
  assert.equal(display.read({ ...point, latitude: 32.03 }, 200001).data, null);
});

test('refresh coordinator retains values during a pending request and rejects callbacks after stop', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 1000000 });
  const changes = [], requests = [];
  const tracker = createRideRoadData((data, status, label) => changes.push({ data, status, label }), {
    requestRoad: (_point, signal) => new Promise(resolve => requests.push({ resolve, signal }))
  });
  try {
    tracker.start(); tracker.update(point);
    requests[0].resolve(payload); await Promise.resolve(); await Promise.resolve();
    assert.equal(changes.at(-1).data.limit, '35');
    t.mock.timers.tick(15000); tracker.update(point);
    assert.equal(requests.length, 1, 'No lookup at the old 15-second cadence');
    t.mock.timers.tick(15000); tracker.update(point);
    assert.equal(requests.length, 2);
    assert.equal(changes.at(-1).data.limit, '35');
    const count = changes.length;
    tracker.stop();
    assert.ok(requests[1].signal.aborted);
    requests[1].resolve({ ...payload, road: 'Old response' });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(changes.length, count);
    tracker.clear(); tracker.start();
    assert.equal(changes.at(-1).data, null, 'Explicit account clearing drops retained data');
  } finally { tracker.stop(); }
});
