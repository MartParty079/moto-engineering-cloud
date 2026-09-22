import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMiles, exportGpx, parseGpx, routeStats } from '../src/gpx.js';

test('GPX route export preserves geometry, zero elevation and escaped names', () => {
  const points = [{ lat: 0, lon: 0, ele: 0 }, { lat: 0, lon: 1, ele: 10 }];
  const route = { name: 'A & <B>', kind: 'route', points };
  const xml = exportGpx(route, [{ lat: 1, lon: 2, ele: null, name: '<camp>' }]);
  assert.match(xml, /<rte>/); assert.doesNotMatch(xml, /<trk>/);
  assert.match(xml, /<ele>0<\/ele>/); assert.match(xml, /A &amp; &lt;B&gt;/);
  assert.match(xml, /&lt;camp&gt;/); assert.equal((xml.match(/<rtept /g) || []).length, 2);
  assert.ok(distanceMiles(points) > 69 && distanceMiles(points) < 70);
  assert.equal(routeStats(route).gainFt, 33);
  assert.equal(routeStats({ points: points.map(p => ({ ...p, ele: null })) }).gainFt, null);
  assert.match(exportGpx({ ...route, kind: 'track' }), /<trkseg>/);
});
test('GPX rejects entities and oversized files before XML parsing', () => {
  assert.throws(() => parseGpx('<!DOCTYPE gpx><gpx/>'), /not supported/);
  assert.throws(() => parseGpx('x'.repeat(5 * 1024 * 1024 + 1)), /smaller than 5 MB/);
});
