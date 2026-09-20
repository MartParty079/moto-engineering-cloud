import test from 'node:test';
import assert from 'node:assert/strict';
import { screenTilt, LeanEstimate, angleDifference } from '../src/lean-tracker.js';

test('tilt rejects missing sensors and flat mounts; wraps angles', () => {
  assert.equal(screenTilt(null, 0), null);
  assert.equal(screenTilt(0, 0), null);
  assert.ok(Math.abs(screenTilt(90, 0)) < .001);
  assert.equal(angleDifference(-179, 179), 2);
  assert.ok(Math.abs(screenTilt(0, -90, 90)) > 179);
});

function calibrated() {
  const tracker = new LeanEstimate();
  for (let i = 0; i < 20; i++) tracker.sample(60, 0, 0, 1000 + i * 50);
  assert.equal(tracker.lean, 0);
  return tracker;
}

test('stable calibration, signed tilt and independent peaks', () => {
  const tracker = calibrated();
  for (let i = 0; i < 20; i++) tracker.sample(60, 45, 0, 2000 + i * 50);
  assert.ok(tracker.lean > 20 && tracker.lean < 25);
  assert.ok(tracker.right > 20);
  for (let i = 0; i < 30; i++) tracker.sample(60, -45, 0, 3000 + i * 50);
  assert.ok(tracker.lean < -20);
  assert.ok(tracker.left > 20 && tracker.right > 20);
});

test('rotation and stale samples cannot silently recalibrate in a corner', () => {
  const tracker = calibrated();
  tracker.sample(60, 10, 90, 2000);
  assert.equal(tracker.lean, null);
  assert.equal(tracker.calibrating, false);
  for (let i = 0; i < 30; i++) tracker.sample(60, 10, 90, 2100 + i * 50);
  assert.equal(tracker.baseline, null);
  const stale = calibrated();
  stale.sample(60, 0, 0, 5000);
  assert.equal(stale.lean, null);
  assert.equal(stale.calibrating, false);
});
