import { supabase } from './supabase.js';

const ROLE_RANK={rider:1,technician:2,engineer:3,admin:4,owner:5};
const VIEW_FEATURE={
 dashboard:'dashboard',garageMode:'garage_mode',garage:'motorcycles',maintenance:'maintenance',rides:'ride_log',
 parts:'parts',roadmap:'work_packages',engineering:'engineering',pcb:'pcb',firmware:'firmware',notes:'notebook',
 media:'project_files',ai:'ai_assistant'
};
const VIEW_AREA={
 dashboard:'garage',garageMode:'garage',garage:'garage',maintenance:'garage',rides:'garage',parts:'garage',
 roadmap:'engineering',engineering:'engineering',pcb:'engineering',firmware:'engineering',notes:'engineering',media:'engineering',ai:'engineering'
};

let session=null,profile={role:'rider',display_name:''},flags=[],grants=[],profiles=[];
let applying=false;
const $=q=>document.querySelector(q), $$=q=>[...document.querySelectorAll(q)];
const esc=(s='')=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const toast=t=>{const e=$('#toast');if(e){e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2400)}else alert(t)};

function canUse(flag){
 if(!flag||!flag.enabled)return false;
 if((ROLE_RANK[profile.role]||1)<(ROLE_RANK[flag.minimum_role]||1))return false;
 if(['owner','admin'].includes(profile.role))return true;
 if(flag.release_stage==='production')return true;
 if(flag.release_stage==='beta'&&['engineer','technician'].includes(profile.role))return true;
 if(flag.release_stage==='testing'&&profile.role==='engineer')return true;
 return grants.some(g=>g.feature_id===flag.id&&g.enabled&&(!g.expires_at||new Date(g.expires_at)>new Date()));
}
function flagFor(key){return flags.find(f=>f.feature_key===key)}
function allowedView(view){return canUse(flagFor(VIEW_FEATURE[view]))}

async function loadAccess(){
 const {data:{session:s}}=await supabase.auth.getSession();session=s;if(!session)return;
 const [p,f,g,u]=await Promise.all([
  supabase.from('user_profiles').select('*').eq('user_id',session.user.id).maybeSingle(),
  supabase.from('feature_flags').select('*').order('sort_order'),
  supabase.from('user_feature_access').select('*').eq('user_id',session.user.id),
  supabase.from('user_profiles').select('*').order('created_at')
 ]);
 if(p.data)profile=p.data;
 flags=f.data||[];grants=g.data||[];profiles=u.data||[];
 applyAccess();
}

function applyAccess(){
 if(applying||!session)return;applying=true;
 try{
  const nav=$('#nav');if(!nav)return;
  $$('[data-v]').forEach(btn=>{
   const view=btn.dataset.v,key=VIEW_FEATURE[view],flag=flagFor(key);
   if(!key)return;
   btn.hidden=!canUse(flag);
   if(flag){
    btn.dataset.releaseStage=flag.release_stage;
    let badge=btn.querySelector('.releaseBadge');
    if(flag.release_stage!=='production'&&canUse(flag)){
     if(!badge){badge=document.createElement('small');badge.className='releaseBadge';btn.appendChild(badge)}
     badge.textContent=flag.release_stage;
    }else badge?.remove();
   }
  });
  relabelGroups(nav);
  addRoleBadge();
  addAdminButtons(nav);
  protectActiveView();
 }finally{applying=false}
}

function relabelGroups(nav){
 nav.querySelectorAll('.navGroup').forEach(group=>{
  const visible=[...group.querySelectorAll('[data-v]')].filter(b=>!b.hidden);
  if(!visible.length){group.hidden=true;return}group.hidden=false;
  const areas=new Set(visible.map(b=>VIEW_AREA[b.dataset.v]).filter(Boolean));
  const label=group.querySelector('.navLabel');
  if(areas.size===1&&label)label.textContent=areas.has('garage')?'MY GARAGE':'ENGINEERING LAB';
 });
 const intro=nav.querySelector('.navIntro');if(intro){intro.querySelector('strong').textContent='Moto Mission';intro.querySelector('small').textContent=profile.role==='rider'?'Rider workspace':'Garage + Engineering workspace'}
}

function addRoleBadge(){
 const top=$('.topActions');if(!top||$('#accessRoleBadge'))return;
 const b=document.createElement('span');b.id='accessRoleBadge';b.className='accessRoleBadge';b.textContent=profile.role.toUpperCase();top.prepend(b);
}

function addAdminButtons(nav){
 if(!['admin','owner'].includes(profile.role)||$('#releaseManagerNav'))return;
 const group=document.createElement('div');group.className='navGroup';group.innerHTML=`<div class="navLabel">ADMINISTRATION</div>
  <button id="releaseManagerNav"><span class="navIcon">⇧</span><span>Release Manager</span></button>
  ${profile.role==='owner'?'<button id="userAccessNav"><span class="navIcon">♙</span><span>Users & Access</span></button>':''}`;
 nav.insertBefore(group,nav.querySelector('.navFooter'));
 $('#releaseManagerNav').onclick=showReleaseManager;
 $('#userAccessNav')?.addEventListener('click',showUserAccess);
}

function protectActiveView(){
 const active=$('[data-v].active');if(!active||!active.hidden)return;
 const fallback=$$('[data-v]').find(b=>!b.hidden);fallback?.click();toast('That area is not enabled for your account.');
}

function stageOptions(current){return ['development','testing','beta','production','deprecated','hidden'].map(x=>`<option value="${x}" ${x===current?'selected':''}>${x}</option>`).join('')}
function roleOptions(current){return ['rider','technician','engineer','admin','owner'].map(x=>`<option value="${x}" ${x===current?'selected':''}>${x}</option>`).join('')}

function showReleaseManager(){
 const m=$('#main');if(!m)return;
 m.innerHTML=`<div class="section"><div><span class="eyebrow">CONTROLLED ROLLOUT</span><h2>Release Manager</h2><p>Move each feature through development, testing, beta, and production when it is ready.</p></div></div>
 <div class="metrics"><div class="metric"><span>Development</span><strong>${flags.filter(x=>x.release_stage==='development').length}</strong></div><div class="metric"><span>Testing</span><strong>${flags.filter(x=>x.release_stage==='testing').length}</strong></div><div class="metric"><span>Beta</span><strong>${flags.filter(x=>x.release_stage==='beta').length}</strong></div><div class="metric"><span>Production</span><strong>${flags.filter(x=>x.release_stage==='production').length}</strong></div></div>
 <div class="stack">${flags.map(f=>`<article class="item releaseItem"><div class="rowtop"><div><span class="eyebrow">${esc(f.area)} · ${esc(f.minimum_role)}+</span><h3>${esc(f.name)}</h3><p>${esc(f.description||'')}</p></div><label class="releaseToggle"><input type="checkbox" data-feature-enabled="${f.id}" ${f.enabled?'checked':''}> Enabled</label></div><div class="releaseControls"><label>Rollout stage<select data-feature-stage="${f.id}">${stageOptions(f.release_stage)}</select></label><label>Minimum role<select data-feature-role="${f.id}">${roleOptions(f.minimum_role)}</select></label></div></article>`).join('')}</div>`;
 $$('[data-feature-stage]').forEach(x=>x.onchange=()=>updateFeature(x.dataset.featureStage,{release_stage:x.value}));
 $$('[data-feature-role]').forEach(x=>x.onchange=()=>updateFeature(x.dataset.featureRole,{minimum_role:x.value}));
 $$('[data-feature-enabled]').forEach(x=>x.onchange=()=>updateFeature(x.dataset.featureEnabled,{enabled:x.checked}));
}

async function updateFeature(id,changes){
 const {error}=await supabase.from('feature_flags').update({...changes,updated_at:new Date().toISOString()}).eq('id',id);
 if(error){toast(error.message);return}toast('Feature rollout updated');await loadAccess();showReleaseManager();
}

function showUserAccess(){
 const m=$('#main');if(!m)return;
 m.innerHTML=`<div class="section"><div><span class="eyebrow">OWNER CONTROL</span><h2>Users & Access</h2><p>Assign a base role. Individual feature grants can expose a test feature without promoting it for everyone.</p></div></div>
 <div class="stack">${profiles.map(p=>`<article class="item"><div class="rowtop"><div><h3>${esc(p.display_name||p.user_id)}</h3><div class="sub">${esc(p.user_id)}</div></div><label>Role<select data-profile-role="${p.user_id}" ${p.user_id===session.user.id?'title="Changing your own owner role can lock you out"':''}>${roleOptions(p.role)}</select></label></div><details><summary>Feature overrides</summary><div class="featureGrantGrid">${flags.map(f=>{let g=grants.find(x=>x.user_id===p.user_id&&x.feature_id===f.id);return `<label><input type="checkbox" data-grant-user="${p.user_id}" data-grant-feature="${f.id}" ${g?.enabled?'checked':''}> ${esc(f.name)} <small>${esc(f.release_stage)}</small></label>`}).join('')}</div></details></article>`).join('')||'<div class="empty">No user profiles found. Run the v9 migration first.</div>'}</div>`;
 $$('[data-profile-role]').forEach(x=>x.onchange=()=>updateRole(x.dataset.profileRole,x.value));
 $$('[data-grant-user]').forEach(x=>x.onchange=()=>setGrant(x.dataset.grantUser,x.dataset.grantFeature,x.checked));
}

async function updateRole(userId,role){
 if(userId===session.user.id&&profile.role==='owner'&&role!=='owner'&&!confirm('This removes your owner access. Continue?')){showUserAccess();return}
 const {error}=await supabase.from('user_profiles').update({role,updated_at:new Date().toISOString()}).eq('user_id',userId);
 if(error){toast(error.message);return}toast('User role updated');await loadAccess();showUserAccess();
}

async function setGrant(userId,featureId,enabled){
 const row={user_id:userId,feature_id:featureId,enabled,granted_by:session.user.id};
 const {error}=await supabase.from('user_feature_access').upsert(row,{onConflict:'user_id,feature_id'});
 if(error){toast(error.message);return}toast(enabled?'Feature access granted':'Feature override disabled');
 const {data}=await supabase.from('user_feature_access').select('*');grants=data||[];
}

const observer=new MutationObserver(()=>applyAccess());
observer.observe(document.documentElement,{childList:true,subtree:true});
supabase.auth.onAuthStateChange((_event,s)=>{session=s;if(s)setTimeout(loadAccess,50)});
loadAccess();
