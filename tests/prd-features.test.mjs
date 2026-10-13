import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {editRoute,summarizeGeometry} from '../src/route-editing.js';
import {MissionStore} from '../src/mission-store.js';
import {RouteStore} from '../src/route-store.js';
import {weatherTimeline,weatherAtArrival,rainCoverage,surfacePotential} from '../src/route-weather.js';
import {osmGraph,routeOffline,nearestNode} from '../src/offline-routing.js';
import {rideJournal} from '../src/ride-journal.js';
import {RideRecorder} from '../src/ride-recorder.js';
import {analyzeRide,reduceReviewCache} from '../src/ride-analysis.js';

test('derived routes preserve originals, gaps and ownership; editing validates coordinates and indices',async()=>{
  const geometry=summarizeGeometry([[{lat:30,lon:-97,ele:1},{lat:30.001,lon:-97,ele:4}],[{lat:30.01,lon:-97},{lat:30.02,lon:-97}]],[]),route={...geometry,name:'Source',kind:'track'};
  const store=new RouteStore('https://route-edits.test'),blob=new Blob(['original bytes']),saved=await store.import('owner','original.gpx',blob,route);
  const edited=editRoute(route,{reverse:true,splitAt:1});assert.equal(edited.segments.length,3);assert.equal(route.segments[0][0].lat,30);
  const derived=await store.derive('owner',[saved.id],'Reversed',edited,'reverse');assert.equal((await store.list('owner')).length,2);assert.equal(await (await store.original('owner',saved.id)).text(),'original bytes');assert.deepEqual(derived.sourceIds,[saved.id]);
  await assert.rejects(store.derive('other',[saved.id],'Bad',edited,'reverse'),/belong/);
  assert.throws(()=>editRoute(route,{point:{index:0,lat:91,lon:0}}),/valid/);
  assert.throws(()=>editRoute(route,{from:2,to:2}),/range/);
});

test('atomic local weather reservations cannot exceed cap across 100 concurrent requests',async()=>{
  const store=new MissionStore('https://budget.test');
  const reservations=await Promise.allSettled(Array.from({length:100},()=>store.update('device','budget',n=>{n=n||0;if(n>=10)throw new Error('cap');return n+1})));
  assert.equal(reservations.filter(r=>r.status==='fulfilled').length,10);assert.equal(await store.get('device','budget'),10);assert.equal(await store.get('other','budget'),undefined);
});

test('route weather uses arrival time, local full days, separate rolling hours and unknown surface factors',()=>{
  const departure=Date.parse('2026-10-09T12:00:00Z'),route={segments:[[{lat:30,lon:-97},{lat:31,lon:-97}]]};
  const samples=weatherTimeline(route,departure,30,3);assert.equal(samples.length,3);assert.ok(samples[2].arrival>samples[0].arrival);
  const now=Date.parse('2026-10-09T12:30:00Z'),time=Array.from({length:120},(_,i)=>(Date.parse('2026-10-05T00:00:00Z')+i*3600000)/1000);
  const data={timezone:'America/Chicago',hourly:{time,precipitation:time.map(()=>1),precipitation_probability:time.map((t)=>t*1000>=departure?90:0),temperature_2m:time.map(()=>20),wind_speed_10m:time.map(()=>12)},daily:{time:[6,7,8,9].map(d=>Date.parse(`2026-10-${String(d).padStart(2,'0')}T05:00:00Z`)/1000),precipitation_sum:[1,2,3,4]}};
  const condition=weatherAtArrival(samples[0],data,now);assert.equal(condition.probability,90);assert.equal(condition.rolling72Mm,72);assert.deepEqual(condition.previousDays.map(d=>d.date),['2026-10-08','2026-10-07','2026-10-06']);assert.deepEqual(condition.previousDays.map(d=>d.mm),[3,2,1]);
  assert.equal(rainCoverage([condition]).percent,100);assert.equal(rainCoverage([{...condition,probability:null}]).percent,null);assert.equal(surfacePotential(condition).mud,'unknown');assert.equal(surfacePotential(condition,{surface:'unpaved',drainage:'poor',soil:'clay'}).dust,'unknown');
});

test('offline routing obeys one-way, turn restrictions, access and missing coverage without network',()=>{
  const elements=[{type:'node',id:1,lat:30,lon:-97},{type:'node',id:2,lat:30,lon:-96.999},{type:'node',id:3,lat:30.001,lon:-96.999},
    {type:'way',id:10,nodes:[1,2],tags:{highway:'residential',oneway:'yes',surface:'asphalt'}},{type:'way',id:20,nodes:[2,3],tags:{highway:'residential',surface:'asphalt'}}];
  const graph=osmGraph({elements},[29.99,-97.01,30.01,-96.99]);
  const route=routeOffline(graph,graph.nodes.find(n=>n.id==='1'),graph.nodes.find(n=>n.id==='3'));assert.equal(route.points.length,3);assert.match(route.instructions[1].text,/left/);
  assert.throws(()=>routeOffline(graph,graph.nodes.find(n=>n.id==='3'),graph.nodes.find(n=>n.id==='1')),/No route/);
  assert.throws(()=>nearestNode(graph,{lat:50,lon:0}),/Outside/);
  const restricted=osmGraph({elements:[...elements,{type:'relation',id:30,tags:{type:'restriction',restriction:'no_left_turn'},members:[{role:'from',type:'way',ref:10},{role:'to',type:'way',ref:20},{role:'via',type:'node',ref:2}]}]},graph.bounds);
  assert.throws(()=>routeOffline(restricted,graph.nodes[0],graph.nodes[2]),/No route/);
});

test('explicit pause persists through reload, rejects samples and resumes without joining the pause gap',async()=>{
  let receive;const owner=crypto.randomUUID(),deps={journal:rideJournal,synchronize:async()=>{},acquireCapture:async()=>()=>{},watch:callback=>{receive=callback;return 1},unwatch(){}};
  const first=new RideRecorder(deps);await first.setOwner(owner);await first.start({id:'bike',name:'Test bike'});
  receive({timestamp:Date.now(),coords:{latitude:30,longitude:-97,accuracy:5}});await first.writeQueue;await first.pause();assert.equal(first.recording,false);assert.ok(first.ride.pausedAt);
  const restored=new RideRecorder(deps);await restored.setOwner(owner);assert.ok(restored.ride.pausedAt);
  await assert.rejects(rideJournal.append(owner,restored.ride.id,{timestamp:Date.now(),coords:{latitude:30,longitude:-97,accuracy:5}}),/not capturing/);
  await restored.resume();assert.equal(restored.ride.pausedAt,null);assert.equal(restored.recording,true);assert.equal(restored.ride.previous,null);assert.equal(restored.ride.interruptions.length,1);restored.release();
});

test('ride analysis weights time correctly, excludes unknown limits and suppresses unverifiable lean',()=>{
  const start=Date.parse('2026-10-09T12:00:00Z');
  const rows=[0,1,11,60].map((seconds,i)=>({recorded_at:new Date(start+seconds*1000).toISOString(),latitude:30+i*.00001,longitude:-97,accuracy_m:5,speed_mps:[0,10,10,20][i],lean_deg:60}));
  const analysis=analyzeRide(rows);assert.equal(analysis.summary.knownSpeedSeconds,11);assert.ok(Math.abs(analysis.summary.averageSpeedMph-105/11*2.236936)<.0001);assert.equal(analysis.summary.speedingSeconds,0);assert.equal(analysis.summary.unknownLimitSeconds,11);assert.equal(analysis.events[0].type,'Capture gap');assert.match(analysis.summary.lean,/unavailable/);
  const trusted=analyzeRide(rows.map(r=>({...r,matched_limit_mph:10,limit_confidence:'high',limit_provider:'OSM',limit_valid_at:r.recorded_at})));assert.equal(trusted.summary.speedingSeconds,11);
});

test('ride 11 compacts only verified backed-up local detail and preserves pinned, recent and pending copies',()=>{
  const entries=Array.from({length:12},(_,i)=>({id:String(i),startedAt:i,detail:'full',rows:[{}],trace:[[{lat:30,lon:-97,time:0},{lat:30.001,lon:-97,time:1}]],summary:{sampleCount:1,invalidGPS:0},backupConfirmed:true,pinned:i===0}));
  const reduced=reduceReviewCache(entries,10);assert.equal(reduced.find(e=>e.id==='0').detail,'full');assert.equal(reduced.find(e=>e.id==='1').detail,'compact');assert.equal(reduced.find(e=>e.id==='2').detail,'full');assert.equal(entries[1].detail,'full');
  entries[1].backupConfirmed=false;assert.equal(reduceReviewCache(entries,10).find(e=>e.id==='1').detail,'full');entries[1].backupConfirmed=true;entries[1].summary.invalidGPS=1;assert.equal(reduceReviewCache(entries,10).find(e=>e.id==='1').detail,'full');
});

test('free-only API policy dispatches zero paid requests even with keys and 100 concurrent calls',async()=>{
  const previousFetch=globalThis.fetch;const calls=[];
  process.env.GOOGLE_ROADS_API_KEY='local-test-only';process.env.TOMTOM_API_KEY='local-test-only';
  globalThis.fetch=async url=>{calls.push(String(url));return new Response(JSON.stringify({elements:[]}))};
  const {default:handler}=await import('../api/road-info-live.js');
  try{await Promise.all(Array.from({length:100},async()=>{const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this},json(){return this}};await handler({method:'GET',query:{lat:'30',lon:'-97',provider:'auto'},headers:{authorization:'Bearer local-test'}},res);assert.equal(res.statusCode,403)}));assert.equal(calls.length,0)}finally{globalThis.fetch=previousFetch;delete process.env.GOOGLE_ROADS_API_KEY;delete process.env.TOMTOM_API_KEY}
});
