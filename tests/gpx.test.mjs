import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeGPX, recordedRideGPX, segmentMiles } from '../src/gpx.js';
import { loadRecordedGPX } from '../src/ride-gpx.js';

const owner='test-owner',id='test-ride';
const row=(i,time=Date.UTC(2026,9,8)+i*1000)=>({id:i,user_id:owner,session_id:id,latitude:0,longitude:i/100000,altitude_m:i===0?0:null,recorded_at:new Date(time).toISOString()});

test('GPX serialization preserves zero coordinates, order, UTC times, elevation, segments and escaped names',()=>{
  const xml=serializeGPX({name:'A & B <ride>',segments:[[{lat:0,lon:0,ele:0,time:'2026-10-08T12:00:00Z'},{lat:0,lon:1}],[{lat:1,lon:1},{lat:1,lon:2}]],waypoints:[{lat:0,lon:0,name:'A"B'}]});
  assert.match(xml,/A &amp; B &lt;ride&gt;/);assert.match(xml,/<ele>0<\/ele>/);assert.match(xml,/<time>2026-10-08T12:00:00Z<\/time>/);
  assert.equal((xml.match(/<trkseg>/g)||[]).length,2);assert.equal((xml.match(/<trkpt /g)||[]).length,4);assert.match(xml,/A&quot;B/);
  assert.throws(()=>serializeGPX({segments:[[{lat:null,lon:0},{lat:1,lon:1}]]}),/invalid/);
  assert.throws(()=>serializeGPX({segments:[[{lat:91,lon:0},{lat:1,lon:1}]]}),/invalid/);
  assert.throws(()=>serializeGPX({segments:[[{lat:0,lon:0}]]}),/two/);
});

test('recorded GPX shows capture gaps, excludes motion-only rows and rejects invalid/out-of-order GPS',()=>{
  const xml=recordedRideGPX('Ride',[row(0),{latitude:null,longitude:null},row(1),row(2,Date.UTC(2026,9,8)+40000),row(3,Date.UTC(2026,9,8)+41000)]);
  assert.equal((xml.match(/<trkseg>/g)||[]).length,2);assert.equal((xml.match(/<trkpt /g)||[]).length,4);
  const resumed=recordedRideGPX('Ride',[row(0),row(1),row(2),row(3)],[{from:Date.parse(row(1).recorded_at),to:Date.parse(row(2).recorded_at)}]);
  assert.equal((resumed.match(/<trkseg>/g)||[]).length,2);
  assert.throws(()=>recordedRideGPX('Ride',[row(2),row(1)]),/out of order/);
  assert.throws(()=>recordedRideGPX('Ride',[row(0),{...row(1),longitude:null}]),/invalid/);
  assert.equal(segmentMiles([{lat:0,lon:0},{lat:0,lon:0}]),0);
});

function clientFor(rows,{faultPage=-1,cap=1000,foreign=false}={}) {
  const calls=[];
  const client={from(table){const filters={},orders=[];let start=0,end=999;const query={
    select(){return query},eq(key,value){filters[key]=value;return query},single(){return query},order(key){orders.push(key);return query},range(a,b){start=a;end=b;return query},
    abortSignal(){calls.push({table,filters,orders,start,end});return Promise.resolve(table==='ride_sessions'?{data:{id,user_id:owner,bike_name:'Test',status:'complete'},error:null}:start===faultPage?{data:null,error:{message:'failure'}}:{data:rows.slice(start,Math.min(end+1,start+cap)).map(r=>foreign?{...r,user_id:'another-owner'}:r),count:rows.length,error:null})}
  };return query}};
  return {client,calls};
}

test('ride export paginates server-capped rows with exact count, stable order and explicit owner filters',async()=>{
  const {client,calls}=clientFor(Array.from({length:2501},(_,i)=>row(i)),{cap:800});
  const result=await loadRecordedGPX(client,owner,id,async()=>true);
  assert.equal((result.xml.match(/<trkpt /g)||[]).length,2501);
  assert.deepEqual(calls.filter(c=>c.table==='ride_samples').map(c=>c.start),[0,800,1600,2400]);
  for(const call of calls)assert.equal(call.filters.user_id,owner);
  for(const call of calls.filter(c=>c.table==='ride_samples')){assert.equal(call.filters.session_id,id);assert.deepEqual(call.orders,['recorded_at','id'])}
});

test('ride export refuses partial, foreign, changing-account and invalid sample data',async()=>{
  const rows=Array.from({length:1001},(_,i)=>row(i));
  await assert.rejects(loadRecordedGPX(clientFor(rows,{faultPage:1000}).client,owner,id,async()=>true),/No partial/);
  await assert.rejects(loadRecordedGPX(clientFor(rows,{foreign:true}).client,owner,id,async()=>true),/ownership/);
  let checks=0;await assert.rejects(loadRecordedGPX(clientFor(rows).client,owner,id,async()=>++checks<3),/Account changed/);
  await assert.rejects(loadRecordedGPX(clientFor([row(0),{...row(1),latitude:100}]).client,owner,id,async()=>true),/invalid/);
});
