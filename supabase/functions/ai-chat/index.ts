import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Missing authorization token' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
    const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5-mini'
    if (!openaiKey) return json({ error: 'OPENAI_API_KEY is not configured' }, 500)

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)
    const userId = userData.user.id

    const body = await req.json()
    const message = String(body?.message ?? '').trim()
    const taskId = body?.taskId ? String(body.taskId) : null
    if (!message) return json({ error: 'Message is required' }, 400)

    const [tasksRes, partsRes, notesRes, maintRes, ridesRes, engRes, attachRes, historyRes] = await Promise.all([
      supabase.from('tasks').select('*').order('sort_order', { ascending: true }).limit(250),
      supabase.from('parts').select('*').order('created_at', { ascending: false }).limit(250),
      supabase.from('notes').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('maintenance').select('*').order('service_date', { ascending: false }).limit(100),
      supabase.from('rides').select('*').order('ride_date', { ascending: false }).limit(100),
      supabase.from('engineering_items').select('*').order('created_at', { ascending: false }).limit(250),
      taskId ? supabase.from('task_attachments').select('id,task_id,file_name,extension,mime_type,proof_category,attachment_kind,description,created_at').eq('task_id', taskId).limit(100) : Promise.resolve({ data: [], error: null }),
      supabase.from('ai_messages').select('role,content,created_at').order('created_at', { ascending: false }).limit(12),
    ])

    const firstError = [tasksRes, partsRes, notesRes, maintRes, ridesRes, engRes, attachRes, historyRes].find((r: any) => r?.error)?.error
    if (firstError) return json({ error: firstError.message }, 400)

    const selectedTask = taskId ? (tasksRes.data ?? []).find((t: any) => t.id === taskId) ?? null : null
    const context = {
      selected_task: selectedTask,
      selected_task_attachments: attachRes.data ?? [],
      roadmap: tasksRes.data ?? [],
      parts: partsRes.data ?? [],
      notes: notesRes.data ?? [],
      maintenance: maintRes.data ?? [],
      rides: ridesRes.data ?? [],
      engineering_records: engRes.data ?? [],
      recent_chat: [...(historyRes.data ?? [])].reverse(),
    }

    await supabase.from('ai_messages').insert({ user_id: userId, role: 'user', content: message, task_id: taskId })

    const systemPrompt = `You are the Moto Engineering Cloud project assistant. You help manage a motorcycle engineering project involving a Honda CRF450RL, BMW F800GS, ESP32 electronics, K-line, CAN, suspension telemetry, GNSS, IMU, maintenance, and product development.

Rules:
- Use only the supplied project context for project-specific facts.
- Never claim a file proves something unless its metadata or project record supports that claim.
- Proof gates remain authoritative. Never recommend bypassing them.
- Prefer the easiest safe setup work before advanced features.
- Safety-critical changes, engine-control actions, deletions, completion approval, dependency removal, and proof-gate changes must be proposed for human approval, never silently applied.
- You may propose low-risk changes using the allowed action types.
- Keep answers practical and clearly identify missing evidence or uncertainty.

Allowed proposed action types:
1. update_task: payload may include task_id and any of these fields: title, stage, priority, status, progress, owner_name, target_date, objective, background, prerequisites, safety_notes, procedure, acceptance_criteria, deliverables, test_procedure, results, lessons_learned, notes.
2. create_task: payload may include title, stage, priority, status, owner_name, objective, prerequisites, procedure, acceptance_criteria, deliverables, test_procedure, notes.
3. create_note: payload may include title, category, bike, body.
4. update_part: payload may include part_id and any of: status, owned, installed, tested, notes, unit_cost, qty.

Return a helpful answer plus zero or more precise change proposals. For each proposal, payload_json must be a valid JSON object encoded as a string.`

    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['answer', 'proposals'],
      properties: {
        answer: { type: 'string' },
        proposals: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['action_type', 'title', 'explanation', 'payload_json'],
            properties: {
              action_type: { type: 'string', enum: ['update_task', 'create_task', 'create_note', 'update_part'] },
              title: { type: 'string' },
              explanation: { type: 'string' },
              payload_json: { type: 'string', description: 'A valid JSON object string containing only the allowed fields for this action.' },
            },
          },
        },
      },
    }

    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: systemPrompt,
        input: `User request:\n${message}\n\nProject context JSON:\n${JSON.stringify(context)}`,
        text: {
          format: {
            type: 'json_schema',
            name: 'moto_ai_response',
            strict: true,
            schema,
          },
        },
      }),
    })

    const openaiJson = await openaiRes.json()
    if (!openaiRes.ok) return json({ error: openaiJson?.error?.message ?? 'OpenAI request failed' }, 502)

    const outputText = openaiJson.output_text ?? openaiJson.output?.flatMap((o: any) => o.content ?? []).find((c: any) => c.type === 'output_text')?.text
    if (!outputText) return json({ error: 'OpenAI returned no text output' }, 502)

    let parsed
    try { parsed = JSON.parse(outputText) } catch { return json({ error: 'Could not parse model response' }, 502) }

    await supabase.from('ai_messages').insert({ user_id: userId, role: 'assistant', content: parsed.answer, task_id: taskId })

    const insertedProposals = []
    for (const p of parsed.proposals ?? []) {
      let proposalPayload: Record<string, unknown> = {}
      try { proposalPayload = JSON.parse(p.payload_json ?? '{}') } catch { proposalPayload = {} }
      const proposalTaskId = (proposalPayload as any)?.task_id ?? taskId ?? null
      const { data, error } = await supabase.from('ai_change_proposals').insert({
        user_id: userId,
        task_id: proposalTaskId,
        action_type: p.action_type,
        title: p.title,
        explanation: p.explanation,
        payload: proposalPayload,
      }).select().single()
      if (!error && data) insertedProposals.push(data)
    }

    const usage = openaiJson.usage ?? {}
    await supabase.from('ai_usage').insert({
      user_id: userId,
      model,
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
      request_kind: taskId ? 'task_chat' : 'project_chat',
    })

    return json({ answer: parsed.answer, proposals: insertedProposals })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
