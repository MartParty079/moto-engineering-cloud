import { authenticateRequest, isUuid, json, supabaseRequest } from '../../../lib/agent-api.js';

const TARGET_REPOSITORY = 'MartParty079/moto-engineering-cloud';

async function getTask(accessToken, taskId) {
  const query = new URLSearchParams({
    select: 'id,worker,risk,title,work_package,status,provider,external_id,external_url,error_message,reconciliation_note,reconciled_at,claimed_by,lease_expires_at,started_at,finished_at,created_at,updated_at',
    id: `eq.${taskId}`,
    limit: '1'
  });
  const taskResponse = await supabaseRequest(
    accessToken,
    `/rest/v1/agent_dispatch_tasks?${query.toString()}`
  );
  if (!taskResponse.ok) throw new Error(`Supabase task detail failed with ${taskResponse.status}`);
  return (await taskResponse.json())[0] || null;
}

async function getTaskResult(accessToken, taskId) {
  const query = new URLSearchParams({
    select: 'result_status,summary,files_changed,checks_performed,evidence,decisions,remaining_risks,approval_needed,rollback,created_at,updated_at',
    task_id: `eq.${taskId}`,
    limit: '1'
  });
  const resultResponse = await supabaseRequest(
    accessToken,
    `/rest/v1/agent_task_results?${query.toString()}`
  );
  if (!resultResponse.ok) throw new Error(`Supabase task result failed with ${resultResponse.status}`);
  return (await resultResponse.json())[0] || null;
}

function githubHeaders() {
  const githubToken = process.env.GITHUB_AGENT_TOKEN;
  if (!githubToken) throw new Error('GitHub agent task control is not configured');
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${githubToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'moto-mission-agent-dispatcher',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function readGitHubIssue(issueNumber) {
  const githubResponse = await fetch(
    `https://api.github.com/repos/${TARGET_REPOSITORY}/issues/${issueNumber}`,
    { headers: githubHeaders(), signal: AbortSignal.timeout(10000) }
  );
  if (!githubResponse.ok) throw new Error(`GitHub issue read failed with ${githubResponse.status}`);
  const issue = await githubResponse.json();
  return { state: issue.state, stateReason: issue.state_reason || null, url: issue.html_url };
}

async function closeGitHubIssue(issueNumber) {
  const githubResponse = await fetch(
    `https://api.github.com/repos/${TARGET_REPOSITORY}/issues/${issueNumber}`,
    {
      method: 'PATCH',
      headers: githubHeaders(),
      body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }),
      signal: AbortSignal.timeout(10000)
    }
  );
  if (!githubResponse.ok) throw new Error(`GitHub cancellation failed with ${githubResponse.status}`);
  const issue = await githubResponse.json();
  return { state: issue.state, stateReason: issue.state_reason || null, url: issue.html_url };
}

async function callTaskRpc(accessToken, functionName, body) {
  const rpcResponse = await supabaseRequest(
    accessToken,
    `/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  const payload = await rpcResponse.json().catch(() => ({}));
  if (!rpcResponse.ok) {
    throw new Error(payload.message || `${functionName} failed with ${rpcResponse.status}`);
  }
  return payload;
}

async function reconcileCancelledTask(accessToken, task, providerState) {
  if (providerState.state !== 'closed' || providerState.stateReason !== 'not_planned') {
    const error = new Error('GitHub issue state does not prove cancellation');
    error.code = 'not_reconcilable';
    throw error;
  }
  return callTaskRpc(accessToken, 'reconcile_cancelled_agent_task', {
    requested_task_id: task.id,
    requested_provider_state: providerState.state,
    requested_provider_reason: providerState.stateReason
  });
}

async function cancelTask(accessToken, task) {
  let providerState = null;
  if (task.provider === 'github-issue' && task.external_id) {
    providerState = await closeGitHubIssue(task.external_id);
  }

  try {
    return await callTaskRpc(accessToken, 'cancel_agent_dispatch_task', {
      requested_task_id: task.id
    });
  } catch (cancellationError) {
    if (providerState?.state === 'closed' && providerState.stateReason === 'not_planned') {
      try {
        return await reconcileCancelledTask(accessToken, task, providerState);
      } catch (reconciliationError) {
        const combined = new Error(
          `Cancellation persistence failed (${cancellationError.message}); reconciliation failed (${reconciliationError.message})`
        );
        combined.code = 'reconciliation_failed';
        throw combined;
      }
    }
    throw cancellationError;
  }
}

async function reconcileTask(accessToken, task) {
  if (task.provider !== 'github-issue' || !task.external_id) {
    const error = new Error('Task has no linked GitHub issue');
    error.code = 'not_reconcilable';
    throw error;
  }
  const providerState = await readGitHubIssue(task.external_id);
  return reconcileCancelledTask(accessToken, task, providerState);
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return json(response, 405, { error: 'method_not_allowed' });
  }

  const taskId = request.query?.id;
  if (!isUuid(taskId)) return json(response, 400, { error: 'invalid_task_id' });

  let session;
  try {
    session = await authenticateRequest(request);
  } catch (error) {
    console.error('Agent task authentication failure:', error.message);
    return json(response, 503, { error: 'authentication_unavailable' });
  }
  if (session.error) return json(response, session.status, { error: session.error });

  try {
    const task = await getTask(session.accessToken, taskId);
    if (!task) return json(response, 404, { error: 'task_not_found' });

    if (request.method === 'GET') {
      const result = await getTaskResult(session.accessToken, taskId);
      return json(response, 200, { task, result });
    }

    const action = request.body?.action;
    if (!['cancel', 'reconcile'].includes(action)) {
      return json(response, 400, { error: 'unsupported_action' });
    }
    if (!['reserved', 'dispatched', 'claimed', 'running'].includes(task.status)) {
      return json(response, 409, { error: 'task_not_active', status: task.status });
    }

    if (action === 'cancel') {
      const cancelledTask = await cancelTask(session.accessToken, task);
      return json(response, 200, { cancelled: true, reconciled: Boolean(cancelledTask.reconciled_at), task: cancelledTask });
    }

    const reconciledTask = await reconcileTask(session.accessToken, task);
    return json(response, 200, { reconciled: true, task: reconciledTask });
  } catch (error) {
    console.error('Agent task operation failure:', error.message);
    if (error.code === 'not_reconcilable') {
      return json(response, 409, { error: 'task_not_reconcilable', details: error.message });
    }
    return json(response, 502, {
      error: error.code === 'reconciliation_failed' ? 'task_reconciliation_failed' : 'task_operation_failed'
    });
  }
}
