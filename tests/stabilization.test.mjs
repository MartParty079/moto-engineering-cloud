import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { queryNumber } from '../server/request-validation.js';
import { validPosition, freshPosition } from '../src/location-validity.js';

// No test may use a real provider or project, even when the shell has credentials.
for (const key of ['GOOGLE_ROADS_API_KEY', 'GOOGLE_PLACES_API_KEY', 'TOMTOM_API_KEY']) delete process.env[key];
process.env.SUPABASE_URL = 'https://local-test.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
const handlers = await Promise.all(['road-info', 'road-info-live', 'fuel-nearby', 'poi-nearby'].map(async name => [name, (await import(`../api/${name}.js`)).default]));

function response() {
  return { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test('API input and failure boundaries use no live network', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Mock provider unavailable'); };
  try {
    for (const [name, handler] of handlers) {
      for (const query of [{}, { lat: '', lon: '' }, { lat: ' ', lon: '1' }, { lat: null, lon: 0 }, { lat: ['1'], lon: '2' }, { lat: '91', lon: '0' }, { lat: '0', lon: '-181' }, { lat: 'NaN', lon: '0' }]) {
        const res = response();
        await handler({ method: 'GET', query, headers: {} }, res);
        assert.equal(res.code, 400, name + JSON.stringify(query));
      }
      const res = response();
      await handler({ method: 'POST', query: { lat: '0', lon: '0' }, headers: {} }, res);
      assert.equal(res.code, 405, name);
    }
    assert.equal(calls, 0, 'Invalid requests must never reach providers');
    for (const [name, handler] of handlers.filter(([name]) => name !== 'road-info-live')) {
      const res = response();
      await handler({ method: 'GET', query: { lat: '0', lon: '0' }, headers: {} }, res);
      assert.equal(res.code, 502, name);
      assert.ok(res.body.error);
    }
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    globalThis.fetch = async url => {
      if (String(url).includes('/rest/')) throw Object.assign(new Error('Mock timeout'), { name: 'AbortError' });
      assert.ok(String(url).includes('overpass'), 'A denied quota must not call Google');
      return new Response(JSON.stringify({ elements: [] }));
    };
    const res = response();
    await handlers.find(([name]) => name === 'poi-nearby')[1]({ method: 'GET', query: { lat: '0', lon: '0' }, headers: { authorization: 'Bearer local-test' } }, res);
    assert.equal(res.code, 200);
    assert.match(res.body.source, /OpenStreetMap/);
    assert.match(res.body.attempts[0], /Usage counter unavailable/);
  } finally { globalThis.fetch = original; delete process.env.GOOGLE_PLACES_API_KEY; }
});

test('GPS validity and freshness preserve zero and unknown readings', () => {
  const fix = { coords: { latitude: 0, longitude: 0 }, timestamp: 100000 };
  assert.equal(queryNumber('0'), 0);
  assert.ok(Number.isNaN(queryNumber('')));
  assert.ok(validPosition(fix));
  assert.equal(validPosition({ ...fix, coords: { latitude: 91, longitude: 0 } }), false);
  assert.equal(freshPosition(fix, 0, 100001), false);
  assert.equal(freshPosition(fix, 2000, 102000), true);
  assert.equal(freshPosition(fix, 2000, 102001), false);
  assert.equal(freshPosition(fix, Infinity, 99999), false);
});

test('provider wrapper rewrites only exact same-origin endpoints', async () => {
  const source = await readFile(new URL('../src/provider-auth-fix.js', import.meta.url), 'utf8');
  const start = source.indexOf('const nativeFetch');
  const end = source.indexOf('\n};', start) + 3;
  const calls = [];
  let authCalls = 0;
  const window = { fetch: async (input, init) => { calls.push({ url: String(input.url || input), init }); return new Response('{}'); } };
  const context = vm.createContext({ window, URL, Request, Response, Headers, console, location: { href: 'https://app.test/', origin: 'https://app.test' }, supabase: { auth: { getSession: async () => { authCalls++; return { data: { session: { access_token: 'local-test' } } }; } } } });
  vm.runInContext(source.slice(start, end), context);
  await window.fetch('/api/road-info?lat=0&lon=0');
  await window.fetch('/api/road-info-live?lat=0&lon=0');
  await window.fetch('https://other.test/api/road-info');
  await window.fetch('/api/road-info-other');
  assert.equal(calls[0].url, 'https://app.test/api/road-info-live?lat=0&lon=0');
  assert.equal(calls[1].url, calls[0].url);
  assert.equal(calls[0].init.headers.get('Authorization'), 'Bearer local-test');
  assert.equal(calls[2].init.headers, undefined);
  assert.equal(authCalls, 2);
});

test('service worker bypasses API navigation and preserves unrelated caches', async () => {
  const listeners = {}, deleted = [];
  const context = vm.createContext({ self: { addEventListener: (name, fn) => { listeners[name] = fn; }, clients: { claim: async () => {} } }, URL, location: { origin: 'https://app.test' }, caches: { keys: async () => ['other-app', 'motocloud-shell-v4', 'motocloud-app-v48', 'motocloud-app-v49'], delete: async key => { deleted.push(key); } } });
  vm.runInContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  listeners.fetch({ request: { method: 'GET', url: 'https://app.test/api/road-info', mode: 'navigate' }, respondWith() { assert.fail('API must bypass the worker'); } });
  let activation;
  listeners.activate({ waitUntil(promise) { activation = promise; } });
  await activation;
  assert.deepEqual(deleted, ['motocloud-shell-v4', 'motocloud-app-v48']);
});

// Ride persistence, retry and completion coverage now lives in ride-journal.test.mjs and ride-database.test.mjs.
