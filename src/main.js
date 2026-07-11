import './styles.css'
import { supabase } from './supabase'

const app=document.querySelector('#app')
let session=null,state={bikes:[],tasks:[],parts:[],notes:[],maintenance:[],rides:[],firmware:[],media:[]},current='dashboard',modal=null
const statusList=['Not Started','Researching','Ordered','In Progress','Blocked','Testing','Validated','Deferred','Complete']
const esc=(s='')=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n||0)
const toast=t=>{const e=document.querySelector('#toast');if(!e)return;e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}
const uid=()=>session?.user?.id

async function authView(){
 app.innerHTML=`<div class="auth card"><span class="eyebrow">MOTO ENGINEERING CLOUD</span><h2>Sign in to your garage</h2><p class="muted">Your motorcycles, maintenance, engineering project, notes, rides, and media sync across devices.</p><div class="notice">Create an account with email and password. Supabase may require email confirmation depending on your project settings.</div><form id="authForm"><input name="email" type="email" placeholder="Email" required><input name="password" type="password" placeholder="Password" minlength="6" required><button class="primary" name="action" value="signin">Sign in</button><button class="secondary" name="action" value="signup">Create account</button></form><p id="authMsg" class="muted"></p></div>`
 document.querySelector('#authForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target),email=fd.get('email'),password=fd.get('password'),action=e.submitter.value;const result=action==='signup'?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});document.querySelector('#authMsg').textContent=result.error?.message||(action==='signup'?'Account created. Check email if confirmation is enabled.':'Signed in.')})
}

function shell(){
 app.innerHTML=`<header class="topbar"><button id="menu" class="icon">☰</button><div><h1>Moto Engineering Cloud</h1><p>${esc(session.user.email)}</p></div><div class="spacer"></div><button id="signout" class="secondary">Sign out</button></header><div class="layout"><nav id="sidebar" class="sidebar">${[['dashboard','Dashboard'],['garage','Garage'],['project','Project'],['parts','Parts'],['notes','Notebook'],['rides','Rides'],['maintenance','Maintenance'],['media','Media'],['firmware','Firmware']].map(([id,l])=>`<button data-view="${id}" class="${current===id?'active':''}">${l}</button>`).join('')}</nav><main id="main"></main></div><div id="modal" class="modal hidden"></div><div id="toast" class="toast"></div>`
 document.querySelector('#menu').onclick=()=>document.querySelector('#sidebar').classList.toggle('open')
 document.querySelector('#signout').onclick=()=>supabase.auth.signOut()
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{current=b.dataset.view;shell();render()})
}

async function load(){
 const tables=['bikes','tasks','parts','notes','maintenance','rides','firmware']
 for(const t of tables){const {data,error}=await supabase.from(t).select('*').order('created_at',{ascending:false});if(error)console.error(t,error);state[t]=data||[]}
 const {data:files}=await supabase.storage.from('project-media').list(uid(),{limit:200,sortBy:{column:'created_at',order:'desc'}})
 state.media=[]
 for(const f of files||[]){if(f.name==='.emptyFolderPlaceholder')continue;const path=`${uid()}/${f.name}`;const {data}=await supabase.storage.from('project-media').createSignedUrl(path,3600);state.media.push({name:f.name,path,url:data?.signedUrl,metadata:f.metadata||{}})}
 render()
}

function metric(a,b){return `<div class="metric"><span>${a}</span><strong>${b}</strong></div>`}
function itemButtons(table,id){return `<div class="actions"><button class="mini" data-edit="${table}:${id}">Edit</button><button class="mini" data-delete="${table}:${id}">Delete</button></div>`}
function bindCommon(){
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const [t,id]=b.dataset.edit.split(':');openModal(t,state[t].find(x=>x.id===id))})
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{const [t,id]=b.dataset.delete.split(':');if(!confirm('Delete this item?'))return;const {error}=await supabase.from(t).delete().eq('id',id);if(error)toast(error.message);else{toast('Deleted');await load()}})
 document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>openModal(b.dataset.add,{}))
}

function render(){
 const main=document.querySelector('#main');if(!main)return
 if(current==='dashboard'){
  const done=state.tasks.filter(x=>x.status==='Complete').length,total=state.tasks.length,budget=state.parts.reduce((s,x)=>s+(x.qty||0)*(x.unit_cost||0),0)
  const stages=[...new Set(state.tasks.map(x=>x.stage))]
  main.innerHTML=`<section class="view active"><div class="hero card"><div><span class="eyebrow">CLOUD PROJECT COMMAND CENTER</span><h2>Universal Motorcycle Data System</h2><p>Track the CRF450RL, F800GS, maintenance, parts, capstone progress, ride records, firmware and field media from any device.</p></div><button class="primary" data-add="notes">Add note</button></div><div class="metrics">${metric('Project progress',`${Math.round(100*done/Math.max(total,1))}%`)}${metric('Planned budget',money(budget))}${metric('Motorcycles',state.bikes.length)}${metric('Maintenance entries',state.maintenance.length)}</div><div class="two"><div class="card"><h3>Stage progress</h3>${stages.map(s=>{const a=state.tasks.filter(x=>x.stage===s),c=a.filter(x=>x.status==='Complete').length,p=Math.round(100*c/Math.max(a.length,1));return `<p><b>${esc(s)}</b> <span class="sub">${c}/${a.length}</span></p><div class="progress"><i style="width:${p}%"></i></div>`}).join('')}</div><div class="card"><h3>Next actions</h3>${state.tasks.filter(x=>!['Complete','Deferred'].includes(x.status)).slice(0,8).map(x=>`<div class="item"><b>${esc(x.title)}</b><div class="sub">${esc(x.stage)} · ${esc(x.priority)}</div></div>`).join('')||'<div class="empty">No open tasks</div>'}</div></div></section>`
 } else if(current==='garage'){
  main.innerHTML=`<div class="section"><div><span class="eyebrow">GARAGE</span><h2>Motorcycles</h2></div><button class="primary" data-add="bikes">Add bike</button></div><div class="grid">${state.bikes.map(x=>`<article class="card"><div class="itemTop"><div><span class="eyebrow">${esc(x.year)} ${esc(x.make)}</span><h3>${esc(x.name)}</h3></div>${itemButtons('bikes',x.id)}</div><p>${esc(x.notes||'')}</p><div class="badges"><span class="badge">${Number(x.odometer||0).toLocaleString()} mi</span></div></article>`).join('')||'<div class="empty">No bikes</div>'}</div>`
 } else if(current==='project'){
  main.innerHTML=`<div class="section"><div><span class="eyebrow">CAPSTONE & PRODUCT</span><h2>Project Roadmap</h2></div><button class="primary" data-add="tasks">Add task</button></div><div class="stack">${state.tasks.map(x=>`<article class="item"><div class="itemTop"><div><h3>${esc(x.title)}</h3><div class="sub">${esc(x.stage)} · ${esc(x.bike||'Universal')}</div></div>${itemButtons('tasks',x.id)}</div><div class="badges"><span class="badge">${esc(x.status)}</span><span class="badge">${esc(x.priority)}</span></div><p>${esc(x.notes||'')}</p></article>`).join('')||'<div class="empty">No tasks</div>'}</div>`
 } else if(current==='parts'){
  const budget=state.parts.reduce((s,x)=>s+(x.qty||0)*(x.unit_cost||0),0)
  main.innerHTML=`<div class="section"><div><span class="eyebrow">BOM & PROCUREMENT</span><h2>Parts</h2></div><button class="primary" data-add="parts">Add part</button></div><div class="metrics">${metric('Planned budget',money(budget))}${metric('Parts',state.parts.length)}${metric('Owned',state.parts.filter(x=>x.owned).length)}${metric('Ordered/complete',state.parts.filter(x=>['Ordered','Complete'].includes(x.status)).length)}</div><div class="stack">${state.parts.map(x=>`<article class="item"><div class="itemTop"><div><h3>${esc(x.part)}</h3><div class="sub">${esc(x.system)} · ${esc(x.bike||'Universal')}</div></div>${itemButtons('parts',x.id)}</div><p>${esc(x.notes||'')}</p><div class="badges"><span class="badge">${esc(x.status)}</span><span class="badge">Qty ${x.qty}</span><span class="badge">${money((x.qty||0)*(x.unit_cost||0))}</span>${x.owned?'<span class="badge complete">Owned</span>':''}</div></article>`).join('')||'<div class="empty">No parts</div>'}</div>`
 } else if(current==='notes'){
  main.innerHTML=`<div class="section"><div><span class="eyebrow">ENGINEERING NOTEBOOK</span><h2>Notes</h2></div><button class="primary" data-add="notes">Add note</button></div><div class="grid">${state.notes.map(x=>`<article class="card"><div class="itemTop"><div><span class="eyebrow">${esc(x.category||'GENERAL')} · ${esc(x.bike||'Universal')}</span><h3>${esc(x.title)}</h3></div>${itemButtons('notes',x.id)}</div><p>${esc(x.body||'')}</p></article>`).join('')||'<div class="empty">No notes</div>'}</div>`
 } else if(current==='rides'){
  main.innerHTML=`<div class="section"><div><span class="eyebrow">RIDE RECORDS</span><h2>Rides</h2></div><button class="primary" data-add="rides">Add ride</button></div><div class="grid">${state.rides.map(x=>`<article class="card"><div class="itemTop"><div><span class="eyebrow">${esc(x.bike||'')} · ${esc(x.ride_date||'')}</span><h3>${esc(x.title)}</h3></div>${itemButtons('rides',x.id)}</div><p>${esc(x.notes||'')}</p><div class="badges"><span class="badge">${x.distance_miles||0} mi</span><span class="badge">${esc(x.duration||'')}</span></div></article>`).join('')||'<div class="empty">No rides</div>'}</div>`
 } else if(current==='maintenance'){
  main.innerHTML=`<div class="section"><div><span class="eyebrow">SERVICE HISTORY</span><h2>Maintenance</h2></div><button class="primary" data-add="maintenance">Add service</button></div><div class="stack">${state.maintenance.map(x=>`<article class="item"><div class="itemTop"><div><h3>${esc(x.service)}</h3><div class="sub">${esc(x.bike||'')} · ${esc(x.service_date||'')} · ${Number(x.odometer||0).toLocaleString()} mi</div></div>${itemButtons('maintenance',x.id)}</div><p>${esc(x.notes||'')}</p><div class="badges"><span class="badge">${money(x.cost)}</span>${x.next_due_miles?`<span class="badge">Due ${Number(x.next_due_miles).toLocaleString()} mi</span>`:''}</div></article>`).join('')||'<div class="empty">No maintenance entries</div>'}</div>`
 } else if(current==='firmware'){
  main.innerHTML=`<div class="section"><div><span class="eyebrow">HARDWARE & SOFTWARE REVISIONS</span><h2>Firmware</h2></div><button class="primary" data-add="firmware">Add release</button></div><div class="stack">${state.firmware.map(x=>`<article class="item"><div class="itemTop"><div><h3>${esc(x.name)} · v${esc(x.version)}</h3><div class="sub">${esc(x.status||'')}</div></div>${itemButtons('firmware',x.id)}</div><p>${esc(x.notes||'')}</p></article>`).join('')||'<div class="empty">No firmware releases</div>'}</div>`
 } else if(current==='media'){
  main.innerHTML=`<div class="section"><div><span class="eyebrow">CLOUD MEDIA</span><h2>Photos & Videos</h2></div><label class="primary">Upload media<input id="mediaInput" type="file" accept="image/*,video/*" capture="environment" multiple hidden></label></div><div class="mediaGrid">${state.media.map(x=>`<article class="card mediaCard">${x.name.match(/\\.(mp4|mov|webm)$/i)?`<video controls src="${x.url}"></video>`:`<img src="${x.url}" alt="${esc(x.name)}">`}<div class="mediaMeta"><b>${esc(x.name)}</b><button class="mini" data-media-delete="${esc(x.path)}">Delete</button></div></article>`).join('')||'<div class="empty">No media uploaded</div>'}</div>`
  setTimeout(()=>{document.querySelector('#mediaInput')?.addEventListener('change',uploadMedia);document.querySelectorAll('[data-media-delete]').forEach(b=>b.onclick=()=>deleteMedia(b.dataset.mediaDelete))},0)
 }
 bindCommon()
}

function field(name,label,value='',type='text',full=false,opts=[]){
 if(type==='textarea')return `<div class="field full"><label>${label}</label><textarea name="${name}">${esc(value)}</textarea></div>`
 if(type==='select')return `<div class="field ${full?'full':''}"><label>${label}</label><select name="${name}">${opts.map(o=>`<option ${o===value?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`
 if(type==='checkbox')return `<div class="field"><label><input type="checkbox" name="${name}" ${value?'checked':''}> ${label}</label></div>`
 return `<div class="field ${full?'full':''}"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value??'')}"></div>`
}
function openModal(table,obj={}){
 modal={table,id:obj.id}
 const bikes=state.bikes.map(x=>x.name).concat(['Universal']);let h=''
 if(table==='bikes')h=field('name','Name',obj.name,'text',true)+field('year','Year',obj.year)+field('make','Make',obj.make)+field('model','Model',obj.model)+field('odometer','Odometer',obj.odometer||0,'number')+field('notes','Notes',obj.notes,'textarea')
 if(table==='tasks')h=field('title','Task',obj.title,'text',true)+field('stage','Stage',obj.stage)+field('bike','Bike',obj.bike||'Universal','select',false,bikes)+field('priority','Priority',obj.priority||'Medium','select',false,['Critical','High','Medium','Low'])+field('status','Status',obj.status||'Not Started','select',false,statusList)+field('notes','Notes',obj.notes,'textarea')
 if(table==='parts')h=field('part','Part',obj.part,'text',true)+field('system','System',obj.system)+field('bike','Bike',obj.bike||'Universal','select',false,bikes)+field('qty','Quantity',obj.qty||1,'number')+field('unit_cost','Unit cost',obj.unit_cost||0,'number')+field('status','Status',obj.status||'Not Started','select',false,statusList)+field('owned','Already owned',obj.owned,'checkbox')+field('source_url','Source URL',obj.source_url,'url',true)+field('notes','Notes',obj.notes,'textarea')
 if(table==='notes')h=field('title','Title',obj.title,'text',true)+field('category','Category',obj.category||'General')+field('bike','Bike',obj.bike||'Universal','select',false,bikes)+field('body','Note',obj.body,'textarea')
 if(table==='rides')h=field('title','Ride title',obj.title,'text',true)+field('bike','Bike',obj.bike||bikes[0],'select',false,bikes)+field('ride_date','Date',obj.ride_date||new Date().toISOString().slice(0,10),'date')+field('distance_miles','Distance (mi)',obj.distance_miles||0,'number')+field('duration','Duration',obj.duration)+field('notes','Notes',obj.notes,'textarea')
 if(table==='maintenance')h=field('service','Service',obj.service,'text',true)+field('bike','Bike',obj.bike||bikes[0],'select',false,bikes)+field('service_date','Date',obj.service_date||new Date().toISOString().slice(0,10),'date')+field('odometer','Odometer',obj.odometer||0,'number')+field('cost','Cost',obj.cost||0,'number')+field('next_due_miles','Next due mileage',obj.next_due_miles||'','number')+field('notes','Notes',obj.notes,'textarea')
 if(table==='firmware')h=field('name','Name',obj.name,'text',true)+field('version','Version',obj.version||'0.1.0')+field('status','Status',obj.status||'Planned')+field('notes','Notes',obj.notes,'textarea')
 const m=document.querySelector('#modal');m.innerHTML=`<div class="modalCard card"><div class="head"><h3>${obj.id?'Edit':'Add'} ${table}</h3><button class="icon" id="closeModal">✕</button></div><form id="editForm"><div class="formGrid">${h}</div><div class="formActions"><button type="button" class="secondary" id="cancelModal">Cancel</button><button class="primary">Save</button></div></form></div>`;m.classList.remove('hidden');document.querySelector('#closeModal').onclick=closeModal;document.querySelector('#cancelModal').onclick=closeModal;document.querySelector('#editForm').onsubmit=saveModal
}
function closeModal(){document.querySelector('#modal').classList.add('hidden')}
async function saveModal(e){
 e.preventDefault();const fd=new FormData(e.target),record=Object.fromEntries(fd.entries());record.user_id=uid()
 if(modal.table==='parts'){record.qty=+record.qty;record.unit_cost=+record.unit_cost;record.owned=fd.has('owned')}
 if(modal.table==='bikes'||modal.table==='maintenance')record.odometer=+record.odometer||0
 if(modal.table==='maintenance'){record.cost=+record.cost||0;record.next_due_miles=record.next_due_miles?+record.next_due_miles:null}
 if(modal.table==='rides')record.distance_miles=+record.distance_miles||0
 let q=modal.id?supabase.from(modal.table).update(record).eq('id',modal.id):supabase.from(modal.table).insert(record)
 const {error}=await q;if(error)toast(error.message);else{closeModal();toast('Saved');await load()}
}
async function uploadMedia(e){
 for(const file of e.target.files){const safe=`${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`,path=`${uid()}/${safe}`;const {error}=await supabase.storage.from('project-media').upload(path,file);if(error)toast(error.message)}
 await load()
}
async function deleteMedia(path){if(!confirm('Delete this file?'))return;const {error}=await supabase.storage.from('project-media').remove([path]);if(error)toast(error.message);else await load()}

async function init(){
 const {data}=await supabase.auth.getSession();session=data.session
 supabase.auth.onAuthStateChange((_e,s)=>{session=s;if(!s)authView();else{shell();load()}})
 if(!session)authView();else{shell();await load()}
}
init()
