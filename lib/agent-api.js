export function json(response, status, payload) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

export function getBearerToken(request) {
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('agent API authentication is not configured');
  return { url, anonKey };
}

export async function supabaseRequest(accessToken, path, options = {}) {
  const { url, anonKey } = getSupabaseConfig();
  return fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(8000)
  });
}

export async function authenticateRequest(request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) return { error: 'authentication_required', status: 401 };

  const authResponse = await supabaseRequest(accessToken, '/auth/v1/user');
  if (!authResponse.ok) return { error: 'invalid_session', status: 401 };

  const user = await authResponse.json();
  if (!user?.id) return { error: 'invalid_session', status: 401 };
  return { accessToken, user };
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
}
