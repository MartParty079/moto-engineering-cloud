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

async function authenticateSupabaseUser(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('dispatcher authentication is not configured');
  }

  const authResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!authResponse.ok) return null;
  return authResponse.json();
}

async function createGitHubTask(workPackage, requestedBy) {
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
        title: `[agent:${workPackage.worker}] ${workPackage.title}`,
        body: formatGitHubIssueBody(workPackage, requestedBy),
        labels: [`agent:${workPackage.worker}`, `risk:${workPackage.risk}`, 'agent-task']
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

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'method_not_allowed' });
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) return json(response, 401, { error: 'authentication_required' });

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

  try {
    const task = await createGitHubTask(
      validation.workPackage,
      user.email || user.id
    );

    return json(response, 201, {
      dispatched: true,
      provider: 'github-issue',
      worker: validation.workPackage.worker,
      risk: validation.workPackage.risk,
      task
    });
  } catch (error) {
    console.error('Agent task dispatch failure:', error.message);
    return json(response, error.status === 422 ? 422 : 502, {
      error: 'dispatch_failed',
      details: error.details || 'provider request failed'
    });
  }
}
