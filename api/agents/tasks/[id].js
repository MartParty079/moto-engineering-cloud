import { authenticateRequest, isUuid, json, supabaseRequest } from '../../../lib/agent-api.js';

const TARGET_REPOSITORY = 'MartParty079/moto-engineering-cloud';

async function getTask(accessToken, taskId) {
  const query = new URLSearchParams({
    select: 'id,worker,risk,title,work_package,status,provider,external_id,external_url,error_message,created_at,updated_at',
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

async function closeGitHubIssue(issueNumber) {
  const githubToken = process.env.GITHUB_AGENT_TOKEN;
  if (!githubToken) throw new Error('GitHub agent cancellation is not configured');

  const githubResponse = await fetch(
    `https://api.github.com/repos/${TARGET_REPOSITORY}/issues/${issueNumber}`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'moto-mission-agent-dispatcher',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }),
      signal: AbortSignal.timeout(10000)
    }
  );
  if (!githubResponse.ok) throw new Error(`GitHub cancellation failed with ${githubResponse.status}`);
}

async function cancelTask(accessToken, task) {
  if (task.provider === 'github-issue' && task.external_id) {
    await closeGitHubIssue(task.external_id);
  }

  const cancelResponse = await supabaseRequest(
    accessToken,
    '/rest/v1/rpc/cancel_agent_dispatch_task',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requested_task_id: task.id })
    }
  );
  const payload = await cancelResponse.json().catch(() => ({}));
  if (!cancelResponse.ok) {
    throw new Error(payload.message || `Supabase cancellation failed with ${cancelResponse.status}`);
  }
  return payload;
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

    if (request.method === 'GET') return json(response, 200, { task });

    if (request.body?.action !== 'cancel') {
      return json(response, 400, { error: 'unsupported_action' });
    }
    if (!['reserved', 'dispatched'].includes(task.status)) {
      return json(response, 409, { error: 'task_not_cancellable', status: task.status });
    }

    const cancelledTask = await cancelTask(session.accessToken, task);
    return json(response, 200, { cancelled: true, task: cancelledTask });
  } catch (error) {
    console.error('Agent task operation failure:', error.message);
    return json(response, 502, { error: 'task_operation_failed' });
  }
}
