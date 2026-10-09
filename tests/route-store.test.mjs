import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { RouteStore } from '../src/route-store.js';

const parsed={name:'Original',kind:'track',segments:[[{lat:0,lon:0,ele:0,time:'2026-10-08T12:00:00Z'},{lat:0,lon:1}],[{lat:2,lon:2},{lat:2,lon:3}]],waypoints:[{lat:0,lon:0,name:'Start'}],distanceMiles:138,gainFeet:0};

test('local route storage preserves original bytes and segments, isolates owners and backend projects',async()=>{
  const store=new RouteStore(`https://${crypto.randomUUID()}.example.test`),file=new Blob(['original\r\nbytes'],{type:'application/gpx+xml'});
  const record=await store.import('owner-a','source.gpx',file,parsed);
  assert.equal((await store.list('owner-a')).length,1);assert.deepEqual(await store.list('owner-b'),[]);
  await assert.rejects(store.get('owner-b',record.id),/belongs/);await assert.rejects(store.original('owner-b',record.id),/unavailable/);await assert.rejects(store.list(null),/Sign in/);
  const route=await store.get('owner-a',record.id);assert.equal(route.segments.length,2);assert.equal(route.segments[0][0].ele,0);assert.equal(route.waypoints[0].name,'Start');
  route.segments[0][0].lat=50;assert.equal((await store.get('owner-a',record.id)).segments[0][0].lat,0);
  assert.deepEqual(await (await store.original('owner-a',record.id)).arrayBuffer(),await file.arrayBuffer());
  const anotherProject=new RouteStore(`https://${crypto.randomUUID()}.example.test`);assert.deepEqual(await anotherProject.list('owner-a'),[]);
});

test('invalid route imports leave no partial records',async()=>{
  const store=new RouteStore(`https://${crypto.randomUUID()}.example.test`);
  await assert.rejects(store.import('owner','bad.gpx',new Blob(['bad']),{...parsed,segments:[[{lat:0,lon:0},{lat:91,lon:0}]]}),/Invalid/);
  await assert.rejects(store.import('owner','empty.gpx',new Blob([]),parsed),/Invalid/);
  assert.deepEqual(await store.list('owner'),[]);
});
