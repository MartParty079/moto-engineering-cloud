import { recordedRideGPX } from './gpx.js';

// Export reads are separate from the analytics preview, which has a display sample cap.
export async function loadRecordedGPX(client, owner, rideId, isCurrentOwner) {
  if(!owner||!rideId||!isCurrentOwner)throw new Error('Sign in before exporting a ride.');
  const check=async()=>{if(!await isCurrentOwner(owner))throw new Error('Account changed. Reopen the ride for your current account.');};
  await check();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  try {
    const {data:ride,error}=await client.from('ride_sessions').select('*').eq('user_id',owner).eq('id',rideId).single().abortSignal(controller.signal);
    await check();
    if(error||!ride||ride.user_id!==owner||ride.id!==rideId||ride.status!=='complete')throw new Error('A completed ride belonging to this account is required for GPX export.');
    const rows=[],seen=new Set(),pageSize=1000,maxRows=200000;let expected=null;
    for(let from=0;from<=maxRows;){
      const {data,count,error:sampleError}=await client.from('ride_samples').select('id,user_id,session_id,recorded_at,latitude,longitude,altitude_m',{count:'exact'}).eq('user_id',owner).eq('session_id',rideId).order('recorded_at',{ascending:true}).order('id',{ascending:true}).range(from,from+pageSize-1).abortSignal(controller.signal);
      await check();
      if(sampleError||!Array.isArray(data))throw new Error('Ride samples could not be loaded. No partial GPX was downloaded.');
      if(!Number.isSafeInteger(count)||count<0||expected!==null&&count!==expected)throw new Error('The full sample count could not be verified. Retry export after synchronization.');
      expected=count;
      if(expected>maxRows)throw new Error('This ride exceeds the 200,000-sample export limit. No partial GPX was downloaded.');
      if(data.some(row=>row.user_id!==owner||row.session_id!==rideId))throw new Error('Ride sample ownership could not be verified.');
      for(const row of data){if(row.id==null||seen.has(String(row.id)))throw new Error('Ride samples changed during export. Retry to download a consistent track.');seen.add(String(row.id))}
      rows.push(...data);
      if(rows.length>maxRows)throw new Error('This ride exceeds the 200,000-sample export limit. No partial GPX was downloaded.');
      if(rows.length===expected)break;
      if(!data.length||rows.length>expected)throw new Error('Ride track is incomplete. No partial GPX was downloaded.');
      from+=data.length;
    }
    return {name:ride.bike_name||'Ride',xml:recordedRideGPX(ride.bike_name||'Ride',rows),sampleCount:rows.length};
  } finally {clearTimeout(timeout)}
}
