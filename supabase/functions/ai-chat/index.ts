import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigin = (origin: string | null) => {
  if (!origin) return ''
  try { const u=new URL(origin),h=u.hostname.toLowerCase(); if(h==='localhost'||h==='127.0.0.1')return origin; if(u.protocol==='https:'&&(h==='moto-engineering-cloud-9tgr.vercel.app'||(h.startsWith('moto-engineering-cloud-')&&h.endsWith('.vercel.app'))))return origin } catch {}
  return ''
}
const cors=(origin:string)=>({'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
const json=(origin:string,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),'Content-Type':'application/json'}})
const hash=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('')

Deno.serve(async(req:Request)=>{
 const origin=allowedOrigin(req.headers.get('origin'));if(!origin)return new Response('Forbidden',{status:403});if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});if(req.method!=='POST')return json(origin,{error:'Method not allowed'},405)
 try{
  const authHeader=req.headers.get('Authorization')??'',token=authHeader.replace(/^Bearer\s+/i,'');if(!token)return json(origin,{error:'Unauthorized'},401)
  const supabaseUrl=Deno.env.get('SUPABASE_URL')??'',supabaseAnon=Deno.env.get('SUPABASE_ANON_KEY')??'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',openaiKey=Deno.env.get('OPENAI_API_KEY')??'',model=Deno.env.get('OPENAI_MODEL')??'gpt-5-mini'
  if(!openaiKey||!serviceKey)return json(origin,{error:'AI service unavailable'},503)
  const supabase=createClient(supabaseUrl,supabaseAnon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}})
  const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const{data:userData,error:userError}=await supabase.auth.getUser(token);if(userError||!userData.user||!userData.user.email_confirmed_at||userData.user.is_anonymous)return json(origin,{error:'Unauthorized'},401)
  const key=await hash(`ai-chat:${userData.user.id}`)
  const{data:limit,error:limitError}=await service.rpc('consume_security_rate_limit',{p_scope:'ai_chat',p_key_hash:key,p_limit:10,p_window_seconds:60,p_block_seconds:300,p_daily_limit:60,p_daily_block_seconds:86400})
  if(limitError)return json(origin,{error:'AI service unavailable'},503);if(limit?.[0]?.allowed===false)return json(origin,{error:'AI request limit reached. Try again later.'},429)
  const body=await req.json(),message=String(body?.message??'').trim(),taskId=body?.taskId?String(body.taskId):null
  if(!message||message.length>8000)return json(origin,{error:'Message must be between 1 and 8,000 characters.'},400)
  const[tasksRes,partsRes,notesRes,maintRes,ridesRes,engRes,attachRes,historyRes]=await Promise.all([
   supabase.from('tasks').select('*').order('sort_order',{ascending:true}).limit(250),supabase.from('parts').select('*').order('created_at',{ascending:false}).limit(250),supabase.from('notes').select('*').order('created_at',{ascending:false}).limit(100),supabase.from('maintenance').select('*').order('service_date',{ascending:false}).limit(100),supabase.from('rides').select('*').order('ride_date',{ascending:false}).limit(100),supabase.from('engineering_items').select('*').order('created_at',{ascending:false}).limit(250),taskId?supabase.from('task_attachments').select('id,task_id,file_name,extension,mime_type,proof_category,attachment_kind,description,created_at').eq('task_id',taskId).limit(100):Promise.resolve({data:[],error:null}),supabase.from('ai_messages').select('role,content,created_at').order('created_at',{ascending:false}).limit(12)])
  const firstError=[tasksRes,partsRes,notesRes,maintRes,ridesRes,engRes,attachRes,historyRes].find((r:any)=>r?.error)?.error;if(firstError)return json(origin,{error:'Project context unavailable'},400)
  const context={selected_task:taskId?(tasksRes.data??[]).find((t:any)=>t.id===taskId)??null:null,selected_task_attachments:attachRes.data??[],roadmap:tasksRes.data??[],parts:partsRes.data??[],notes:notesRes.data??[],maintenance:maintRes.data??[],rides:ridesRes.data??[],engineering_records:engRes.data??[],recent_chat:[...(historyRes.data??[])].reverse()}
  await supabase.from('ai_messages').insert({user_id:userData.user.id,role:'user',content:message,task_id:taskId})
  const instructions=`You are the Moto Engineering Cloud project assistant. Use only supplied project context for project-specific facts. Never claim evidence that is not present. Proof gates remain authoritative. Prefer easy safe setup before advanced work. Safety-critical changes, deletions, completion approval, dependency removal, and proof-gate changes require human approval. Return a practical answer and zero or more precise low-risk proposals using only update_task, create_task, create_note, or update_part.`
  const schema={type:'object',additionalProperties:false,required:['answer','proposals'],properties:{answer:{type:'string'},proposals:{type:'array',items:{type:'object',additionalProperties:false,required:['action_type','title','explanation','payload_json'],properties:{action_type:{type:'string',enum:['update_task','create_task','create_note','update_part']},title:{type:'string'},explanation:{type:'string'},payload_json:{type:'string'}}}}}}
  const openaiRes=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${openaiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input:`User request:\n${message}\n\nProject context JSON:\n${JSON.stringify(context)}`,text:{format:{type:'json_schema',name:'moto_ai_response',strict:true,schema}}})})
  const openaiJson=await openaiRes.json();if(!openaiRes.ok)return json(origin,{error:'AI request failed'},502)
  const outputText=openaiJson.output_text??openaiJson.output?.flatMap((o:any)=>o.content??[]).find((c:any)=>c.type==='output_text')?.text;if(!outputText)return json(origin,{error:'AI returned no output'},502)
  let parsed:any;try{parsed=JSON.parse(outputText)}catch{return json(origin,{error:'AI response could not be parsed'},502)}
  await supabase.from('ai_messages').insert({user_id:userData.user.id,role:'assistant',content:parsed.answer,task_id:taskId})
  const inserted=[];for(const p of parsed.proposals??[]){let proposalPayload:Record<string,unknown>={};try{proposalPayload=JSON.parse(p.payload_json??'{}')}catch{}const{data,error}=await supabase.from('ai_change_proposals').insert({user_id:userData.user.id,task_id:(proposalPayload as any)?.task_id??taskId??null,action_type:p.action_type,title:p.title,explanation:p.explanation,payload:proposalPayload}).select().single();if(!error&&data)inserted.push(data)}
  const usage=openaiJson.usage??{};await supabase.from('ai_usage').insert({user_id:userData.user.id,model,input_tokens:usage.input_tokens??null,output_tokens:usage.output_tokens??null,total_tokens:usage.total_tokens??null,request_kind:taskId?'task_chat':'project_chat'})
  return json(origin,{answer:parsed.answer,proposals:inserted})
 }catch(error){console.error('ai-chat error',error instanceof Error?error.message:error);return json(origin,{error:'AI service unavailable'},503)}
})
