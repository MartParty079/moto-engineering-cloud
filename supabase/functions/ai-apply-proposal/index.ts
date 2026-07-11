import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const taskFields = ['title','stage','priority','status','progress','owner_name','target_date','objective','background','prerequisites','safety_notes','procedure','acceptance_criteria','deliverables','test_procedure','results','lessons_learned','notes']
const partFields = ['status','owned','installed','tested','notes','unit_cost','qty']
const pick = (obj: Record<string, unknown>, fields: string[]) => Object.fromEntries(fields.filter(f => Object.prototype.hasOwnProperty.call(obj, f)).map(f => [f, obj[f]]))

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Missing authorization token' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)

    const { proposalId, decision } = await req.json()
    if (!proposalId || !['approve','reject'].includes(decision)) return json({ error: 'proposalId and valid decision are required' }, 400)

    const { data: proposal, error: proposalError } = await supabase.from('ai_change_proposals').select('*').eq('id', proposalId).single()
    if (proposalError || !proposal) return json({ error: 'Proposal not found' }, 404)
    if (proposal.status !== 'pending') return json({ error: 'Proposal already reviewed' }, 409)

    if (decision === 'reject') {
      await supabase.from('ai_change_proposals').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', proposalId)
      return json({ ok: true, status: 'rejected' })
    }

    const payload = proposal.payload ?? {}
    let applyError = null

    if (proposal.action_type === 'update_task') {
      const taskId = payload.task_id ?? proposal.task_id
      if (!taskId) return json({ error: 'Missing task_id' }, 400)
      const changes = pick(payload, taskFields)
      delete (changes as any).task_id
      const { error } = await supabase.from('tasks').update(changes).eq('id', taskId)
      applyError = error
    } else if (proposal.action_type === 'create_task') {
      const changes = pick(payload, taskFields)
      const { error } = await supabase.from('tasks').insert({ ...changes, user_id: userData.user.id, status: changes.status ?? 'Not Started' })
      applyError = error
    } else if (proposal.action_type === 'create_note') {
      const { title, category, bike, body } = payload
      const { error } = await supabase.from('notes').insert({ user_id: userData.user.id, title, category: category ?? 'AI', bike: bike ?? 'Universal', body })
      applyError = error
    } else if (proposal.action_type === 'update_part') {
      const partId = payload.part_id
      if (!partId) return json({ error: 'Missing part_id' }, 400)
      const changes = pick(payload, partFields)
      const { error } = await supabase.from('parts').update(changes).eq('id', partId)
      applyError = error
    } else {
      return json({ error: 'Unsupported action type' }, 400)
    }

    if (applyError) {
      await supabase.from('ai_change_proposals').update({ status: 'failed', error_message: applyError.message, reviewed_at: new Date().toISOString() }).eq('id', proposalId)
      return json({ error: applyError.message }, 400)
    }

    await supabase.from('ai_change_proposals').update({ status: 'applied', reviewed_at: new Date().toISOString(), applied_at: new Date().toISOString() }).eq('id', proposalId)
    return json({ ok: true, status: 'applied' })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
