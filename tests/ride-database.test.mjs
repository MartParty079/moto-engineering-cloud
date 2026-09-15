import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const fixture = await readFile(new URL('./fixtures/ride-schema.sql', import.meta.url), 'utf8');
const owner = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
const bike = '00000000-0000-4000-8000-000000000003', ride = '00000000-0000-4000-8000-000000000004';
const migration = await readFile(new URL('../supabase/migrations/20260914210109_durable_ride_sync.sql', import.meta.url), 'utf8');
const complete = `select public.complete_ride_v1('${ride}','2026-09-01T00:10:00Z',600,2,25,12,32,-97,0) as result`;

test('completion is atomic, idempotent, owner-scoped, and denied to anonymous callers', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture); await db.exec(migration); await db.exec(migration);
    await db.exec(`insert into auth.users values('${owner}',now(),false),('${other}',now(),false)`);
    await db.exec(`insert into bikes(id,user_id,odometer,name) values('${bike}','${owner}',20,'Fixture bike');
      insert into ride_sessions(id,user_id,bike_id,started_at,status,client_sync_version,bike_name) values('${ride}','${owner}','${bike}','2026-09-01T00:00:00Z','recording',1,'Fixture bike');`);
    await db.exec(`set role anon`); await assert.rejects(db.query(complete), /permission denied/); await db.exec('reset role');
    await db.exec(`set role authenticated;set test.user_id='${other}'`);
    assert.equal((await db.query('select * from bikes')).rows.length, 0);
    await assert.rejects(db.query(complete), /unavailable/);
    await db.exec(`set test.user_id='${owner}'`);
    await assert.rejects(db.query(complete.replace(',32,-97,0)', ',91,-97,0)')), /Invalid/);
    await assert.rejects(db.query(complete.replace(',-97,0)', ',-97,1)')), /incomplete/);
    assert.equal((await db.query(complete)).rows[0].result.status, 'complete');
    await db.query(complete);
    assert.equal(Number((await db.query('select odometer from bikes')).rows[0].odometer), 22);
    assert.equal((await db.query('select rides_since_odometer_confirm from bikes')).rows[0].rides_since_odometer_confirm, 1);
    // A late session-update failure must roll back the bike increment too.
    await db.exec(`reset role;update ride_sessions set status='recording',completion_applied_at=null;
      create function public.reject_summary() returns trigger language plpgsql as $$begin raise exception 'summary rejected';end$$;
      create trigger reject_summary before update on ride_sessions for each row execute function public.reject_summary();
      set role authenticated;set test.user_id='${owner}';`);
    await assert.rejects(db.query(complete), /summary rejected/);
    assert.equal(Number((await db.query('select odometer from bikes')).rows[0].odometer), 22);
    assert.equal((await db.query('select status from ride_sessions')).rows[0].status, 'recording');
  } finally { await db.close(); }
});

test('migration rejects missing baseline tables instead of fabricating them', async () => {
  const db = new PGlite();
  try { await assert.rejects(db.exec(migration), /recover the authoritative/); }
  finally { await db.close(); }
});

test('numeric legacy samples coexist with retry UUIDs and verified-account policies', async () => {
  const db = new PGlite();
  const sample = '00000000-0000-4000-8000-000000000005';
  try {
    await db.exec(fixture);
    await db.exec(`insert into auth.users values('${owner}',now(),false);
      insert into bikes(id,user_id,name) values('${bike}','${owner}','Fixture bike');
      insert into ride_sessions(id,user_id,bike_id,bike_name) values('${ride}','${owner}','${bike}','Fixture bike');
      insert into ride_samples(session_id,user_id) values('${ride}','${owner}');`);
    const legacy = (await db.query('select id from ride_samples')).rows[0].id;
    await db.exec(migration);
    await db.exec(`set role authenticated;set test.user_id='${owner}'`);
    const upsert = `insert into ride_samples(session_id,user_id,client_sample_id) values('${ride}','${owner}','${sample}') on conflict(client_sample_id) do nothing`;
    await db.exec(upsert); await db.exec(upsert);
    await db.exec(`insert into ride_samples(session_id,user_id) values('${ride}','${owner}')`);
    const rows = (await db.query('select id,client_sample_id from ride_samples order by id')).rows;
    assert.equal(rows.length,3);
    assert.equal(rows[0].id,legacy);
    assert.equal(rows[0].client_sample_id,null);
    assert.equal(rows[1].client_sample_id,sample);
    await assert.rejects(db.exec('truncate ride_samples'),/permission denied/);
    await db.exec('reset role; update auth.users set email_confirmed_at=null; set role authenticated');
    assert.equal((await db.query('select * from ride_samples')).rows.length,0);
    await assert.rejects(db.exec(upsert),/row-level security/);
  } finally { await db.close(); }
});
