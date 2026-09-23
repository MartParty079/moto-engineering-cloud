import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadCache, segmentDistance } from '../src/road-cache.js';
const geometry=[{lat:32,lon:-97},{lat:32.01,lon:-97}];
const point={latitude:32.005,longitude:-97,heading:0,accuracy:5};
const payload={geometry,roadId:'osm/way/1'};
const data={name:'Main Street',limit:'35',source:'OpenStreetMap · test',note:'Mapped data'};
function setup(){const values=new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};const cache=new RoadCache(storage);cache.scope('owner-a','dev');return {cache,storage};}

test('road cache persists only scoped OSM matches and follows heading and geometry',()=>{
 const {cache,storage}=setup();cache.remember(payload,data,point,Date.now());
 assert.equal(cache.match(point).data.limit,'35');
 assert.equal(cache.match({...point,heading:180}),null);
 assert.equal(cache.match({...point,heading:null}),null);
 assert.equal(cache.match({...point,accuracy:100}),null);
 assert.equal(cache.match({...point,longitude:-97.001}),null);
 assert.equal(segmentDistance({lat:32.02,lon:-97},geometry),Infinity,'No extrapolation');
 const loaded=new RoadCache(storage);loaded.scope('owner-a','dev');assert.equal(loaded.match(point).data.limit,'35');
 loaded.scope('owner-b','dev');assert.equal(loaded.match(point),null);
 loaded.scope('owner-a','other-backend');assert.equal(loaded.match(point),null);
 cache.remember({...payload,roadId:'paid'}, {...data,source:'Google Roads'},point,Date.now());
 assert.equal(cache.entries.length,1);
 cache.clear();const empty=new RoadCache(storage);empty.scope('owner-a','dev');assert.equal(empty.match(point),null);
});

test('ambiguous parallel roads decline cache; unknown limits invalidate old segments',()=>{
 const {cache}=setup();cache.remember(payload,data,point,Date.now());
 cache.remember({...payload,roadId:'osm/way/2'}, {...data,limit:'55'},point,Date.now());
 assert.equal(cache.match(point),null);
 const single=setup().cache;single.remember(payload,data,point,Date.now());
 single.remember(payload,{...data,limit:'--'},point,Date.now());
 assert.equal(single.match(point),null);
});

test('zones mark same-road observations, not opposite-direction or unrelated-road transitions',()=>{
 const {cache}=setup();const now=Date.now();
 cache.remember(payload,data,point,now-10000);
 cache.remember({...payload,roadId:'osm/way/2'}, {...data,limit:'45'},{...point,latitude:32.006},now);
 assert.equal(cache.zones.length,1);assert.equal(cache.zones[0].to,'45');
 assert.equal(cache.nearZone({...point,latitude:32.006}),true);
 assert.equal(cache.nearZone({...point,latitude:32.006,heading:180}),false);
 cache.remember(payload,{...data,name:'Side Street',limit:'25'},point,now);
 assert.equal(cache.zones.length,1);
 cache.entries[0].at=now-31*86400000;
 assert.equal(cache.valid(cache.entries[0]),false);
});

import { roadCache } from '../src/road-cache.js';
import { createRideRoadData } from '../src/ride-road-data.js';
test('cached road appears immediately and turning accelerates the next live check', async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:2000000});
 roadCache.scope('coordinator-test','local');roadCache.remember(payload,data,point,Date.now());
 const changes=[];let calls=0;
 const tracker=createRideRoadData((d,status,label)=>changes.push({d,label}),{requestRoad:async()=>{calls++;return {status:'no-road'};}});
 try {
  tracker.start();tracker.update(point);
  assert.equal(changes.at(-1).d.limit,'35','Cache publishes without awaiting network');
  assert.ok(changes.at(-1).d.cachedAt);
  await Promise.resolve();await Promise.resolve();
  t.mock.timers.tick(10000);tracker.update(point);
  assert.equal(calls,1,'Same cached segment does not poll every 15 seconds');
  tracker.update({...point,heading:90});
  assert.equal(calls,2,'Turn triggers a live recheck without waiting a minute');
 } finally {tracker.clear();roadCache.clear();roadCache.scope(null,'local');}
});
