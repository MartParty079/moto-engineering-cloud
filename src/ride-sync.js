// Retries use stable primary keys. No fallback to non-idempotent inserts or
// separate odometer writes is allowed when the backend contract is missing.
export async function syncRide({ journal, client, owner, id, isCurrentOwner }) {
  const checkOwner = () => { if (!isCurrentOwner(owner)) throw new Error('Sign in to the ride owner account to synchronize.'); };
  checkOwner();
  let ride = (await journal.list(owner)).find(r => r.id === id);
  if (!ride || ride.status === 'synced') return ride;
  const checked = async request => {
    checkOwner();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let result;
    try { result = await (request.abortSignal ? request.abortSignal(controller.signal) : request); }
    finally { clearTimeout(timer); }
    checkOwner();
    if (result.error) throw new Error(result.error.message || 'Ride synchronization failed.');
    return result.data;
  };
  if (ride.status === 'discarding') {
    // Even an unacknowledged create may have reached the server.
    await checked(client.from('ride_samples').delete().eq('session_id', id).eq('user_id', owner));
    await checked(client.from('ride_sessions').delete().eq('id', id).eq('user_id', owner));
    await journal.remove(owner, id);
    return null;
  }
  if (!ride.cloudCreated) {
    await checked(client.from('ride_sessions').upsert({ id, user_id: owner, bike_id: ride.bike.id, bike_name: ride.bikeName,
      started_at: new Date(ride.startedAt).toISOString(), status: 'recording', client_sync_version: 1 }, { onConflict: 'id', ignoreDuplicates: true }));
    await journal.markCreated(owner, id);
  }
  let batch;
  while ((batch = await journal.batch(owner, id)).length) {
    checkOwner();
    // Preserve the server's bigint identity; the separate client UUID makes retries safe.
    await checked(client.from('ride_samples').upsert(batch.map(({row: {id: client_sample_id, ...row}}) => ({...row, client_sample_id})), { onConflict: 'client_sample_id', ignoreDuplicates: true }));
    await journal.acknowledge(owner, id, batch);
  }
  ride = (await journal.list(owner)).find(r => r.id === id);
  if (ride.status === 'pending') {
    // Persist intent before sending: a lost receipt must not permit deletion of
    // a session whose odometer transaction may already have committed.
    await journal.markCompletionRequested(owner, id);
    const receipt = await checked(client.rpc('complete_ride_v1', {
      p_session_id: id, p_ended_at: new Date(ride.stoppedAt).toISOString(),
      p_duration_seconds: Math.max(0, Math.floor((ride.stoppedAt - ride.startedAt) / 1000)),
      p_distance_miles: ride.distanceMiles, p_max_speed_mph: ride.maxSpeedMph,
      p_average_speed_mph: ride.speedCount ? ride.speedSum / ride.speedCount : 0,
      p_end_lat: ride.latest?.latitude ?? null, p_end_lng: ride.latest?.longitude ?? null, p_sample_count: ride.sequence
    }));
    if (receipt?.session_id !== id || receipt?.status !== 'complete') throw new Error('The backend did not acknowledge ride completion.');
    ride = await journal.markSynced(owner, id);
  }
  return ride;
}
