import { isUuid, json } from '../../../lib/agent-api.js';
import {
  authenticateWorker,
  createLeaseToken,
  hashLeaseToken,
  validateResultPayload,
  workerSupabaseRpc
} from '../../../lib/agent-worker-api.js';

async function parseRpc(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || fallbackMessage);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function claimTask(worker, body) {
  const taskId = body?.taskId;
  const claimedBy = String(body?.claimedBy || '').trim();
  if (!isUuid(taskId)) return { error: 'invalid_task_id', status: 400 };
  if (claimedBy.length < 3 || claimedBy.length > 200) {
    return { error: 'invalid_worker_identity', status: 400 };
  }

  const lease = createLeaseToken();
  const response = await workerSupabaseRpc('claim_agent_dispatch_task', {
    requested_task_id: taskId,
    requested_worker: worker,
    requested_claimed_by: claimedBy,
    requested_lease_token_hash: lease.hash
  });
  const task = await parseRpc(response, 'task claim failed');
  return { status: 200, payload: { claimed: true, leaseToken: lease.token, task } };
}

async function heartbeatTask(worker, body) {
  const taskId = body?.taskId;
  const leaseToken = String(body?.leaseToken || '');
  const status = String(body?.status || 'running');
  if (!isUuid(taskId) || leaseToken.length < 32) {
    return { error: 'invalid_lease_request', status: 400 };
  }

  const response = await workerSupabaseRpc('heartbeat_agent_dispatch_task', {
    requested_task_id: taskId,
    requested_worker: worker,
    requested_lease_token_hash: hashLeaseToken(leaseToken),
    requested_status: status
  });
  const task = await parseRpc(response, 'task heartbeat failed');
  return { status: 200, payload: { renewed: true, task } };
}

async function submitResult(worker, body) {
  const taskId = body?.taskId;
  const leaseToken = String(body?.leaseToken || '');
  if (!isUuid(taskId) || leaseToken.length < 32) {
    return { error: 'invalid_lease_request', status: 400 };
  }

  const validation = validateResultPayload(body);
  if (!validation.ok) {
    return { error: 'invalid_result', details: validation.errors, status: 400 };
  }

  const response = await workerSupabaseRpc('submit_agent_task_result', {
    requested_task_id: taskId,
    requested_worker: worker,
    requested_lease_token_hash: hashLeaseToken(leaseToken),
    requested_result_status: validation.status,
    requested_result: validation.result
  });
  const task = await parseRpc(response, 'result submission failed');
  return { status: 200, payload: { accepted: true, task } };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'method_not_allowed' });
  }

  const worker = String(request.query?.worker || '').toLowerCase();
  const authentication = authenticateWorker(request, worker);
  if (!authentication.ok) return json(response, authentication.status, { error: authentication.error });

  const action = String(request.body?.action || '').toLowerCase();

  try {
    let result;
    if (action === 'claim') result = await claimTask(worker, request.body);
    else if (action === 'heartbeat') result = await heartbeatTask(worker, request.body);
    else if (action === 'result') result = await submitResult(worker, request.body);
    else return json(response, 400, { error: 'unsupported_worker_action' });

    if (result.error) {
      return json(response, result.status, {
        error: result.error,
        ...(result.details ? { details: result.details } : {})
      });
    }
    return json(response, result.status, result.payload);
  } catch (error) {
    console.error(`Agent ${worker} gateway failure:`, error.message);
    const status = error.status === 409 ? 409 : error.status === 400 ? 400 : 502;
    return json(response, status, { error: 'worker_gateway_failed' });
  }
}
