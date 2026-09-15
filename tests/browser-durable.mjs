import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = process.env.PLAYWRIGHT_CDP_URL ? await chromium.connectOverCDP(process.env.PLAYWRIGHT_CDP_URL) : await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'block', userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const ownerA = '00000000-0000-4000-8000-000000000001', ownerB = '00000000-0000-4000-8000-000000000002';
const bike = { id: '00000000-0000-4000-8000-000000000003', user_id: ownerA, name: 'Local test motorcycle', odometer: 20 };
let accessUnavailable = false;
let owner = ownerA, writesAvailable = false, loseSampleResponse = true;
const samples = new Map(), sessions = new Map();
try {
  await context.addInitScript(() => {
    localStorage.setItem('moto-startup-permissions-v1',JSON.stringify({location:'granted',motion:'granted'}));
    localStorage.setItem('motocloud-install-seen','1');
    let watch;
    Object.defineProperties(navigator.geolocation, {
      getCurrentPosition: { configurable: true, value() {} },
      watchPosition: { configurable: true, value(callback) { watch = callback; return 1; } },
      clearWatch: { configurable: true, value() { watch = null; } }
    });
    window.deliverTestGPS = () => watch?.({ timestamp: Date.now(), coords: { latitude: 32, longitude: -97, accuracy: 5, altitude: null, speed: null, heading: null } });
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.port === '5173') return route.continue();
    if (url.hostname !== '127.0.0.1' || url.port !== '54321') return route.abort();
    const table = url.pathname.split('/').at(-1), method = route.request().method();
    let body = [];
    if (url.pathname === '/auth/v1/user') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:owner,email:'local@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false,factors:[]})});
    if (table === 'feature_flags' && accessUnavailable) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({message:'Local test access outage'}) });
    if (method === 'POST' && ['ride_sessions', 'ride_samples', 'complete_ride_v1'].includes(table)) {
      if (!writesAvailable) return route.abort();
      const input = route.request().postDataJSON();
      if (table === 'complete_ride_v1') body = { session_id: input.p_session_id, status: 'complete' };
      else {
        for (const row of Array.isArray(input) ? input : [input]) (table === 'ride_samples' ? samples : sessions).set(row.client_sample_id || row.id, row);
        if (table === 'ride_samples' && loseSampleResponse) { loseSampleResponse = false; return route.abort(); }
      }
    } else if (table === 'user_profiles') body = [{ user_id: owner, role: 'owner', display_name: 'Local test' }];
    else if (table === 'bikes') body = owner === ownerA ? [bike] : [];
    else if (table === 'feature_flags') body = ['dashboard','garage_mode','motorcycles','maintenance','ride_log','parts','work_packages','engineering','pcb','firmware','notebook','project_files','ai_assistant'].map(feature_key => ({ id: feature_key, feature_key, name: feature_key, enabled: true, minimum_role: 'rider', release_stage: 'production' }));
    if (route.request().headers().accept?.includes('vnd.pgrst.object') && Array.isArray(body)) body = body[0] || null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('http://127.0.0.1:5173');
  const login = async nextOwner => {
    owner = nextOwner;
    await page.evaluate(id => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:id,role:'authenticated',aal:'aal1',exp:Math.floor(Date.now()/1000)+3600}))+'.local-test-signature', refresh_token: 'local-test-refresh', expires_at: Math.floor(Date.now()/1000)+3600, token_type:'bearer', user: { id, email:'local@example.test', role:'authenticated',aud:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false } })), nextOwner);
    await page.reload(); await page.locator('#nav').waitFor({state:'attached'});
    await page.waitForFunction(() => window.MotoRide?.getState());
  };
  await login(ownerA);
  await page.waitForFunction(() => window.MotoRide.getBikes().length === 1);
  await page.evaluate(id => window.MotoRide.start(id), bike.id);
  await page.evaluate(() => window.deliverTestGPS());
  await page.waitForFunction(() => window.MotoRide.getState().bufferedSamples === 1);
  const rideId = await page.evaluate(() => window.MotoRide.getState().sessionId);
  await page.reload(); await page.locator('#nav').waitFor({state:'attached'});
  await page.waitForFunction(() => window.MotoRide?.getState().status === 'interrupted');
  assert.equal(await page.evaluate(() => window.MotoRide.getState().sessionId), rideId);
  assert.equal(await page.evaluate(() => window.MotoRide.getState().bufferedSamples), 1);
  await page.locator('#menu').click();
  await page.locator('#rideCenterNav').click();
  assert.equal(await page.locator('#dashRideStatus').textContent(), 'RECORDING INTERRUPTED');
  assert.equal(await page.locator('#dashRideToggle').textContent(), 'RESUME RIDE');
  await page.locator('#dashClose').click();
  await page.evaluate(() => window.MotoRide.resume());
  await page.evaluate(() => window.deliverTestGPS());
  await page.waitForFunction(() => window.MotoRide.getState().bufferedSamples === 2);
  await login(ownerB);
  assert.equal(await page.evaluate(() => window.MotoRide.getState().sessionId), null);
  await login(ownerA);
  await page.waitForFunction(() => window.MotoRide.getState().status === 'interrupted');
  await page.evaluate(() => window.MotoRide.stop());
  assert.equal(await page.evaluate(() => window.MotoRide.getState().status), 'pending');
  await page.reload(); await page.locator('#nav').waitFor({state:'attached'});
  await page.waitForFunction(() => window.MotoRide?.getState().status === 'pending');
  await page.locator('#menu').click();
  await page.locator('#rideCenterNav').click();
  assert.equal(await page.locator('#dashRideStatus').textContent(), 'UPLOAD PENDING');
  assert.equal(await page.locator('#dashRideToggle').textContent(), 'RETRY UPLOAD');
  await page.locator('#dashClose').click();
  writesAvailable = true;
  await page.evaluate(() => window.MotoRide.retry());
  assert.equal(samples.size, 2);
  assert.equal(await page.evaluate(() => window.MotoRide.getState().bufferedSamples), 2, 'Lost receipt must retain the batch');
  await page.evaluate(() => window.MotoRide.retry());
  await page.waitForFunction(() => window.MotoRide.getState().sessionId === null);
  assert.equal(samples.size, 2); assert.equal(sessions.size, 1);
  accessUnavailable = true;
  await page.reload();
  await page.locator('#retryWorkspaceAccess').waitFor();
  assert.equal(await page.locator('#main').getByRole('heading', {name:'Workspace access unavailable'}).count(), 1);
  accessUnavailable = false;
  await page.locator('#retryWorkspaceAccess').click();
  await page.waitForFunction(() => !document.querySelector('#main')?.dataset.accessBlocked);
  assert.deepEqual(errors, []);
  console.log('PASS: browser IndexedDB survives reload, interrupted recovery is explicit, accounts are isolated, lost upload receipts retry without duplicate sample IDs, and completion clears pending state.');
} finally { await context.close(); await browser.close(); }
