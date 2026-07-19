import { createClient } from 'npm:@supabase/supabase-js@2'

const allowed = (origin: string | null) => {
  if (!origin) return ''
  try {
    const u = new URL(origin), h = u.hostname.toLowerCase()
    if (h === 'localhost' || h === '127.0.0.1') return origin
    if (u.protocol === 'https:' && (h === 'moto-engineering-cloud-9tgr.vercel.app' || (h.startsWith('moto-engineering-cloud-') && h.endsWith('.vercel.app')))) return origin
  } catch {}
  return ''
}
const cors = (origin: string) => ({ 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
const json = (origin: string, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } })
const digest = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('')
const ip = (req: Request) => (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 128)

Deno.serve(async (req: Request) => {
  const origin = allowed(req.headers.get('origin'))
  if (!origin) return new Response('Forbidden', { status: 403 })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json(origin, { error: 'Method not allowed' }, 405)
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase().slice(0, 320)
    if (!email) return json(origin, { ok: true })
    const url = Deno.env.get('SUPABASE_URL') || '', anon = Deno.env.get('SUPABASE_ANON_KEY') || '', service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    const emailHash = await digest(`recover-email:${email}`), ipHash = await digest(`recover-ip:${ip(req)}`)
    const checks = await Promise.all([
      admin.rpc('consume_security_rate_limit', { p_scope:'recover_email',p_key_hash:emailHash,p_limit:3,p_window_seconds:3600,p_block_seconds:3600,p_daily_limit:5,p_daily_block_seconds:86400 }),
      admin.rpc('consume_security_rate_limit', { p_scope:'recover_ip',p_key_hash:ipHash,p_limit:10,p_window_seconds:3600,p_block_seconds:3600,p_daily_limit:20,p_daily_block_seconds:86400 }),
    ])
    if (checks.some(x => x.error)) return json(origin, { error: 'Recovery service unavailable.' }, 503)
    if (checks.some(x => x.data?.[0]?.allowed === false)) return json(origin, { ok: true })
    const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    await auth.auth.resetPasswordForEmail(email, { redirectTo: 'https://moto-engineering-cloud-9tgr.vercel.app' })
    return json(origin, { ok: true })
  } catch (error) {
    console.error('auth-recover error', error instanceof Error ? error.message : error)
    return json(origin, { ok: true })
  }
})
