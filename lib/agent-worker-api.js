import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ALLOWED_WORKERS = new Set([
  'software', 'firmware', 'test', 'research', 'documentation', 'security'
]);

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authenticateWorker(request, expectedWorker) {
  if (!ALLOWED_WORKERS.has(expectedWorker)) return { ok: false, status: 404, error: 'unknown_worker' };

  let tokenMap;
  try {
    tokenMap = JSON.parse(process.env.AGENT_WORKER_TOKENS_JSON || '{}');
  } catch {
    return { ok: false, status: 503, error: 'worker_authentication_unavailable' };
  }

  const supplied = String(request.headers['x-agent-worker-token'] || '');
  const expected = String(tokenMap[expectedWorker] || '');
  if (!supplied || !expected || !safeEqual(supplied, expected)) {
    return { ok: false, status: 401, error: 'invalid_worker_credential' };
  }

  return { ok: true, worker: expectedWorker };
}

export function createLeaseToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashLeaseToken(token) };
}

export function hashLeaseToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export async function workerSupabaseRpc(functionName, body) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const workerJwt = process.env.SUPABASE_AGENT_WORKER_JWT;

  if (!supabaseUrl || !anonKey || !workerJwt) {
    throw new Error('worker database gateway is not configured');
  }

  return fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${workerJwt}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
}

export function validateResultPayload(payload) {
  const allowedStatuses = new Set(['awaiting_review', 'completed', 'blocked', 'failed']);
  const status = String(payload?.status || '').trim();
  const result = payload?.result;
  const errors = [];

  if (!allowedStatuses.has(status)) errors.push('invalid result status');
  if (!result || typeof result !== 'object' || Array.isArray(result)) errors.push('result must be an object');
  if (!String(result?.summary || '').trim()) errors.push('result.summary is required');
  if (!String(result?.rollback || '').trim()) errors.push('result.rollback is required');

  const arrayFields = [
    'filesChanged', 'checksPerformed', 'evidence', 'decisions',
    'remainingRisks', 'approvalNeeded'
  ];
  for (const field of arrayFields) {
    if (result?.[field] !== undefined && !Array.isArray(result[field])) {
      errors.push(`result.${field} must be an array`);
    }
  }

  return { ok: errors.length === 0, errors, status, result };
}
