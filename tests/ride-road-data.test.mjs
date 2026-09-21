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
