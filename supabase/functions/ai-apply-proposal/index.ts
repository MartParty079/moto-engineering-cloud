import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigin=(origin:string|null)=>{if(!origin)return'';try{const u=new URL(origin),h=u.hostname.toLowerCase();if(h==='localhost'||h==='127.0.0.1')return origin;if(u.protocol==='https:'&&(h==='moto-engineering-cloud-9tgr.vercel.app'||(h.startsWith('moto-engineering-cloud-')&&h.endsWith('.vercel.app'))))return origin}catch{}return''}
const cors=(origin:string)=>({'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
const json=(origin:string,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),'Content-Type':'application/json'}})
const hash=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('')
const taskFields=['title','stage','priority','status','progress','owner_name','target_date','objective','background','prerequisites','safety_notes','procedure','acceptance_criteria','deliverables','test_procedure','results','lessons_learned','notes']
const partFields=['status','owned','installed','tested','notes','unit_cost','qty']
const pick=(obj:Record<string,unknown>,fields:string[])=>Object.fromEntries(fields.filter(f=>Object.prototype.hasOwnProperty.call(obj,f)).map(f=>[f,obj[f]]))

Deno.serve(async(req:Request)=>{
 const origin=allowedOrigin(req.headers.get('origin'));if(!origin)return new Response('Forbidden',{status:403});if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});if(req.method!=='POST')return json(origin,{error:'Method not allowed'},405)
 try{
  const token=(req.headers.get('Authorization')??'').replace(/^Bearer\s+/i,'');if(!token)return json(origin,{error:'Unauthorized'},401)
  const url=Deno.env.get('SUPABASE_URL')??'',anon=Deno.env.get('SUPABASE_ANON_KEY')??'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??''
  const supabase=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}}),service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const{data:userData,error:userError}=await supabase.auth.getUser(token);if(userError||!userData.user||!userData.user.email_confirmed_at||userData.user.is_anonymous)return json(origin,{error:'Unauthorized'},401)
  const key=await hash(`ai-apply:${userData.user.id}`),{data:limit,error:limitError}=await service.rpc('consume_security_rate_limit',{p_scope:'ai_apply',p_key_hash:key,p_limit:10,p_window_seconds:3600,p_block_seconds:3600,p_daily_limit:20,p_daily_block_seconds:86400})
  if(limitError)return json(origin,{error:'Proposal service unavailable'},503);if(limit?.[0]?.allowed===false)return json(origin,{error:'Proposal approval limit reached. Try again later.'},429)
  const{proposalId,decision}=await req.json();if(!proposalId||!['approve','reject'].includes(decision))return json(origin,{error:'A valid proposal and decision are required'},400)
  const{data:proposal,error:proposalError}=await supabase.from('ai_change_proposals').select('*').eq('id',proposalId).single();if(proposalError||!proposal)return json(origin,{error:'Proposal not found'},404);if(proposal.status!=='pending')return json(origin,{error:'Proposal already reviewed'},409)
  if(decision==='reject'){await supabase.from('ai_change_proposals').update({status:'rejected',reviewed_at:new Date().toISOString()}).eq('id',proposalId);return json(origin,{ok:true,status:'rejected'})}
  const payload=proposal.payload??{};let applyError:any=null
  if(proposal.action_type==='update_task'){const taskId=payload.task_id??proposal.task_id;if(!taskId)return json(origin,{error:'Missing task'},400);const changes=pick(payload,taskFields);delete(changes as any).task_id;applyError=(await supabase.from('tasks').update(changes).eq('id',taskId)).error}
  else if(proposal.action_type==='create_task'){const changes=pick(payload,taskFields);applyError=(await supabase.from('tasks').insert({...changes,user_id:userData.user.id,status:changes.status??'Not Started'})).error}
  else if(proposal.action_type==='create_note'){const{title,category,bike,body}=payload;applyError=(await supabase.from('notes').insert({user_id:userData.user.id,title,category:category??'AI',bike:bike??'Universal',body})).error}
  else if(proposal.action_type==='update_part'){const partId=payload.part_id;if(!partId)return json(origin,{error:'Missing part'},400);applyError=(await supabase.from('parts').update(pick(payload,partFields)).eq('id',partId)).error}
  else return json(origin,{error:'Unsupported proposal type'},400)
  if(applyError){await supabase.from('ai_change_proposals').update({status:'failed',error_message:applyError.message,reviewed_at:new Date().toISOString()}).eq('id',proposalId);return json(origin,{error:'Proposal could not be applied'},400)}
  await supabase.from('ai_change_proposals').update({status:'applied',reviewed_at:new Date().toISOString(),applied_at:new Date().toISOString()}).eq('id',proposalId)
  return json(origin,{ok:true,status:'applied'})
 }catch(error){console.error('ai-apply-proposal error',error instanceof Error?error.message:error);return json(origin,{error:'Proposal service unavailable'},503)}
})
