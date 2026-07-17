import { formatGitHubIssueBody, validateWorkPackage } from '../../lib/agent-dispatch.js';

const TARGET_REPOSITORY = 'MartParty079/moto-engineering-cloud';

function json(response, status, payload) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function getIdempotencyKey(request) {
  const value = request.headers['idempotency-key'];
  return typeof value === 'string' ? value.trim() : '';
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('dispatcher authentication is not configured');
  return { url, anonKey };
}

async function supabaseRequest(path, accessToken, options = {}) {
  const { url, anonKey } = getSupabaseConfig();
  return fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    signal: AbortSignal.timeout(8000)
  });
}

async function authenticateSupabaseUser(accessToken) {
  const authResponse = await supabaseRequest('/auth/v1/user', accessToken);
  if (!authResponse.ok) return null;
  return authResponse.json();
}

async function reserveTask(accessToken, idempotencyKey, workPackage) {
  const reserveResponse = await supabaseRequest(
    '/rest/v1/rpc/reserve_agent_dispatch_task',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        requested_idempotency_key: idempotencyKey,
        requested_worker: workPackage.worker,
        requested_risk: workPackage.risk,
        requested_title: workPackage.title,
        requested_work_package: workPackage
      })
    }
  );

  const payload = await reserveResponse.json().catch(() => ({}));
  if (!reserveResponse.ok) {
    const error = new Error('task reservation failed');
    error.status = String(payload.message || '').includes('rate limit') ? 429 : 503;
    error.details = payload.message || 'task state is unavailable';
    throw error;
  }

  const reservation = Array.isArray(payload) ? payload[0] : payload;
  if (!reservation?.task_id) throw new Error('task reservation returned no task id');
  return reservation;
}

async function finalizeTask(accessToken, taskId, changes) {
  const finalizeResponse = await supabaseRequest(
    '/rest/v1/rpc/finalize_agent_dispatch_task',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        requested_task_id: taskId,
        requested_status: changes.status,
        requested_provider: changes.provider,
        requested_external_id: changes.externalId || null,
        requested_external_url: changes.externalUrl || null,
        requested_error_message: changes.errorMessage || null
      })
    }
  );

  const payload = await finalizeResponse.json().catch(() => ({}));
  if (!finalizeResponse.ok) {
    const error = new Error('task state finalization failed');
    error.details = payload.message || 'unknown task-state error';
    throw error;
  }
  return payload;
}

async function createGitHubTask(workPackage, requestedBy, taskId) {
  const githubToken = process.env.GITHUB_AGENT_TOKEN;
  if (!githubToken) throw new Error('GitHub agent dispatch is not configured');

  const githubResponse = await fetch(
    `https://api.github.com/repos/${TARGET_REPOSITORY}/issues`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'moto-mission-agent-dispatcher',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        title: `[agent:${workPackage.worker}][risk:${workPackage.risk}] ${workPackage.title}`,
        body: `<!-- agent-dispatch-task:${taskId} -->\n${formatGitHubIssueBody(workPackage, requestedBy)}`
      }),
      signal: AbortSignal.timeout(10000)
    }
  );

  const payload = await githubResponse.json().catch(() => ({}));
  if (!githubResponse.ok) {
    const error = new Error('GitHub rejected the agent task');
    error.status = githubResponse.status;
    error.details = payload.message || 'unknown GitHub error';
    throw error;
  }

  return {
    issueNumber: payload.number,
    issueUrl: payload.html_url,
    state: payload.state
  };
}

function duplicateResponse(response, reservation) {
  if (reservation.task_status === 'dispatched') {
    return json(response, 200, {
      dispatched: true,
      duplicate: true,
      task: {
        id: reservation.task_id,
        provider: reservation.provider,
        externalId: reservation.external_id,
        issueUrl: reservation.external_url
      }
    });
  }

  return json(response, 409, {
    error: reservation.task_status === 'failed' ? 'previous_dispatch_failed' : 'dispatch_in_progress',
    duplicate: true,
    taskId: reservation.task_id,
    status: reservation.task_status
  });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'method_not_allowed' });
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) return json(response, 401, { error: 'authentication_required' });

  const idempotencyKey = getIdempotencyKey(request);
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return json(response, 400, { error: 'valid_idempotency_key_required' });
  }

  let user;
  try {
    user = await authenticateSupabaseUser(accessToken);
  } catch (error) {
    console.error('Agent dispatcher authentication failure:', error.message);
    return json(response, 503, { error: 'authentication_unavailable' });
  }

  if (!user?.id) return json(response, 401, { error: 'invalid_session' });

  const validation = validateWorkPackage(request.body);
  if (!validation.ok) {
    return json(response, 400, {
      error: 'invalid_work_package',
      details: validation.errors
    });
  }

  let reservation;
  try {
    reservation = await reserveTask(accessToken, idempotencyKey, validation.workPackage);
  } catch (error) {
    console.error('Agent task reservation failure:', error.message);
    return json(response, error.status || 503, {
      error: error.status === 429 ? 'rate_limit_exceeded' : 'task_state_unavailable',
      details: error.details || 'task reservation failed'
    });
  }

  if (reservation.is_duplicate) return duplicateResponse(response, reservation);

  let task;
  try {
    task = await createGitHubTask(
      validation.workPackage,
      user.email || user.id,
      reservation.task_id
    );
  } catch (error) {
    console.error('Agent task dispatch failure:', error.message);
    await finalizeTask(accessToken, reservation.task_id, {
      status: 'failed',
      provider: 'github-issue',
      errorMessage: error.details || error.message
    }).catch((stateError) => {
      console.error('Agent task failure-state update failed:', stateError.message);
    });

    return json(response, error.status === 422 ? 422 : 502, {
      error: 'dispatch_failed',
      taskId: reservation.task_id,
      details: error.details || 'provider request failed'
    });
  }

  try {
    await finalizeTask(accessToken, reservation.task_id, {
      status: 'dispatched',
      provider: 'github-issue',
      externalId: String(task.issueNumber),
      externalUrl: task.issueUrl
    });
  } catch (error) {
    console.error('Agent task finalization failure:', error.message);
    return json(response, 202, {
      dispatched: true,
      statePending: true,
      taskId: reservation.task_id,
      provider: 'github-issue',
      task
    });
  }

  return json(response, 201, {
    dispatched: true,
    duplicate: false,
    provider: 'github-issue',
    worker: validation.workPackage.worker,
    risk: validation.workPackage.risk,
    task: { id: reservation.task_id, ...task }
  });
}
