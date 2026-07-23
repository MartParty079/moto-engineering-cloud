import { authenticateRequest, json, supabaseRequest } from '../../../lib/agent-api.js';

async function reconcileStaleReservations(accessToken) {
  await supabaseRequest(accessToken, '/rest/v1/rpc/reconcile_stale_agent_dispatch_tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return json(response, 405, { error: 'method_not_allowed' });
  }

  let session;
  try {
    session = await authenticateRequest(request);
  } catch (error) {
    console.error('Agent task authentication failure:', error.message);
    return json(response, 503, { error: 'authentication_unavailable' });
  }
  if (session.error) return json(response, session.status, { error: session.error });

  const requestedLimit = Number.parseInt(request.query?.limit || '25', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 25;

  try {
    await reconcileStaleReservations(session.accessToken);
    const query = new URLSearchParams({
      select: 'id,worker,risk,title,status,provider,external_id,external_url,error_message,created_at,updated_at',
      order: 'created_at.desc',
      limit: String(limit)
    });
    const taskResponse = await supabaseRequest(
      session.accessToken,
      `/rest/v1/agent_dispatch_tasks?${query.toString()}`
    );
    if (!taskResponse.ok) throw new Error(`Supabase task list failed with ${taskResponse.status}`);
    return json(response, 200, { tasks: await taskResponse.json() });
  } catch (error) {
    console.error('Agent task list failure:', error.message);
    return json(response, 502, { error: 'task_list_failed' });
  }
}
