import { createClient } from 'npm:@supabase/supabase-js@2'

const originAllowed = (origin: string | null) => {
  if (!origin) return ''
  try {
    const u = new URL(origin)
    const h = u.hostname.toLowerCase()
    if (h === 'localhost' || h === '127.0.0.1') return origin
    if (u.protocol === 'https:' && (h === 'moto-engineering-cloud-9tgr.vercel.app' || (h.startsWith('moto-engineering-cloud-') && h.endsWith('.vercel.app')))) return origin
  } catch {}
  return ''
}
const headers = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
})
const json = (origin: string, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers(origin), 'Content-Type': 'application/json' } })
const hash = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  const origin = originAllowed(req.headers.get('origin'))
  if (!origin) return new Response('Forbidden', { status: 403 })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) })
  if (req.method !== 'POST') return json(origin, { error: 'Method not allowed' }, 405)
  try {
    const authorization = req.headers.get('authorization') || ''
    const token = authorization.replace(/^Bearer\s+/i, '')
    if (!token) return json(origin, { error: 'Unauthorized' }, 401)
    const url = Deno.env.get('SUPABASE_URL') || ''
    const anon = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
    const serviceClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user) return json(origin, { error: 'Unauthorized' }, 401)
    const body = await req.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase().slice(0, 320)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(origin, { error: 'A valid email is required.' }, 400)
    const key = await hash(`admin-invite:${userData.user.id}`)
    const { data: limitData, error: limitError } = await serviceClient.rpc('consume_security_rate_limit', {
      p_scope: 'admin_invite', p_key_hash: key, p_limit: 10, p_window_seconds: 3600,
      p_block_seconds: 3600, p_daily_limit: 20, p_daily_block_seconds: 86400,
    })
    if (limitError) return json(origin, { error: 'Invite service unavailable.' }, 503)
    if (limitData?.[0]?.allowed === false) return json(origin, { error: 'Invite limit reached. Try again later.' }, 429)
    const { error: gateError } = await userClient.rpc('admin_create_invite', { requested_email: email, expires_hours: 168 })
    if (gateError) return json(origin, { error: gateError.message.includes('MFA') ? 'Recent MFA verification is required.' : 'Unable to create invitation.' }, 403)
    const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, { redirectTo: 'https://moto-engineering-cloud-9tgr.vercel.app' })
    if (inviteError) {
      console.error('inviteUserByEmail failed', inviteError.message)
      return json(origin, { error: 'Unable to send invitation.' }, 400)
    }
    return json(origin, { ok: true })
  } catch (error) {
    console.error('admin-invite-user error', error instanceof Error ? error.message : error)
    return json(origin, { error: 'Invite service unavailable.' }, 503)
  }
})
