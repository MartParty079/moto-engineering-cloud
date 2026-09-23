import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewStats, rideGpx, setReviewLean, setReviewRoad, reviewContext, clearReviewContext } from '../src/ride-review-data.js';
import { rideJournal, configureRideJournal } from '../src/ride-journal.js';

const row=(seconds,more={})=>({latitude:0,longitude:0,altitude_m:0,accuracy_m:5,speed_mps:20,recorded_at:new Date(100000+seconds*1000).toISOString(),segment:0,...more});
test('review statistics exclude unknown/stale limits and sampling gaps, preserving lean and zero elevation',()=>{
 const rows=[row(0,{limit_mph:35,lean_estimate_deg:-20}),row(1,{limit_mph:35,lean_estimate_deg:25}),row(20,{limit_mph:35}),row(21,{limit_mph:null})];
 const stats=reviewStats(rows);
 assert.equal(stats.checked,3);assert.equal(stats.over,3);assert.equal(stats.coveredSeconds,1);assert.equal(stats.overSeconds,1);
 assert.equal(stats.left,20);assert.equal(stats.right,25);assert.equal(stats.minAltitude,0);assert.equal(stats.leanCount,2);
 assert.equal(reviewStats([row(0)]).checked,0);assert.equal(reviewStats([row(0)]).maxOver,null);
 clearReviewContext();setReviewLean(10,1000);setReviewRoad({limit:'35',source:'OSM'},'',1000);
 assert.equal(reviewContext(1500).lean,10);assert.equal(reviewContext(4000).lean,null);assert.equal(reviewContext(7000).road,null);
 setReviewRoad({limit:'35'},'Last known',7000);assert.equal(reviewContext(7001).road,null);clearReviewContext();
});
test('GPX export preserves times and elevation and splits interruption/gap segments',()=>{
 const xml=rideGpx('Bike & <ride>',[row(0),row(1),row(2,{segment:1}),row(30,{segment:1})]);
 assert.equal((xml.match(/<trkseg>/g)||[]).length,3);
 assert.equal((xml.match(/<trkpt /g)||[]).length,4);
 assert.match(xml,/<ele>0<\/ele>/);assert.match(xml,/<time>/);assert.match(xml,/Bike &amp; &lt;ride&gt;/);
});
test('v1 upgrade preserves pending samples; review survives acknowledgement and is owner isolated',async()=>{
 const backend='https://review-upgrade.test';configureRideJournal(backend);
 const owner='review-owner',id='legacy-ride';
 await new Promise((resolve,reject)=>{
  const request=indexedDB.open(`moto-ride-journal-v1:${backend}`,1);
  request.onupgradeneeded=()=>{request.result.createObjectStore('rides',{keyPath:['owner','id']}).createIndex('owner','owner');request.result.createObjectStore('samples',{keyPath:['owner','rideId','sequence']});};
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result;const tx=db.transaction(['rides','samples'],'readwrite');tx.objectStore('rides').put({owner,id,status:'pending',sequence:1,acknowledged:0});tx.objectStore('samples').put({owner,rideId:id,sequence:1,row:row(0)});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
 });
 assert.equal((await rideJournal.batch(owner,id)).length,1);
 assert.equal((await rideJournal.review(owner,id)).rows.length,1);
 await rideJournal.acknowledge(owner,id,await rideJournal.batch(owner,id));
 assert.equal((await rideJournal.batch(owner,id)).length,0);
 assert.equal((await rideJournal.review(owner,id)).rows.length,1);
 await assert.rejects(rideJournal.review('other',id),/No local review/);
 const now=Date.now();const ride=await rideJournal.create(owner,{id:'bike',name:'Bike'},now-1000);
 await rideJournal.append(owner,ride.id,{timestamp:now,coords:{latitude:32,longitude:-97,speed:20,accuracy:5,altitude:0,heading:10}},{lean:-12,road:{limit:35,source:'OSM',cached:true}});
 const sample=(await rideJournal.review(owner,ride.id)).rows[0];assert.equal(sample.lean_estimate_deg,-12);assert.equal(sample.limit_mph,35);
 assert.equal((await rideJournal.batch(owner,ride.id))[0].row.limit_mph,undefined,'Local metadata must not break server sample schema');
 await rideJournal.remove(owner,ride.id);await assert.rejects(rideJournal.review(owner,ride.id),/No local review/);
});
