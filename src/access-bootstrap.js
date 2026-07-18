import { supabase } from './supabase.js';

const esc=(s='')=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const ROLE_META={rider:['🏍','Rider'],technician:['🔧','Technician'],engineer:['⚙','Engineer'],admin:['🛡','Administrator'],owner:['👑','Owner']};
let session=null,profile=null,profiles=[],flags=[],grants=[];

async function loadAccessData(){
  const {data:{session:s}}=await supabase.auth.getSession();
  session=s;
  if(!session){removeAccessUI();return;}
  const [p,users,featureRows,grantRows]=await Promise.all([
    supabase.from('user_profiles').select('*').eq('user_id',session.user.id).maybeSingle(),
    supabase.from('user_profiles').select('*').order('created_at'),
    supabase.from('feature_flags').select('*').order('sort_order'),
    supabase.from('user_feature_access').select('*')
  ]);
  profile=p.data||{role:'rider',display_name:session.user.email?.split('@')[0]||'User'};
  profiles=users.data||[];flags=featureRows.data||[];grants=grantRows.data||[];
  ensureAccessUI();
}

function removeAccessUI(){
  document.querySelector('#accessQuickButton')?.remove();
  document.querySelector('#accessPanelOverlay')?.remove();
  document.querySelector('#accessBootstrapGroup')?.remove();
}

function ensureAccessUI(){
  if(!session||!profile)return;
  document.querySelector('#accessRoleBadge')?.remove();
  document.querySelector('#accessQuickButton')?.remove();
  ensureNavControls();
  bindReleaseBadges();
}

function ensureQuickButton(){
  let button=document.querySelector('#accessQuickButton');
  if(!button){button=document.createElement('button');button.id='accessQuickButton';button.type='button';button.addEventListener('click',()=>openAccessPanel('dashboard'));document.body.appendChild(button)}
  const [icon,label]=ROLE_META[profile.role]||['👤',profile.role];
  button.innerHTML=`<span>${icon}</span><b>${esc(label)}</b><i>⌄</i>`;
  button.title='Open Admin Console';
}

function ensureNavControls(){
  if(!['admin','owner'].includes(profile.role))return;
  const nav=document.querySelector('#nav');if(!nav)return;
  let group=document.querySelector('#accessBootstrapGroup');
  if(!group){group=document.createElement('div');group.id='accessBootstrapGroup';group.className='navGroup accessAdminGroup';const footer=nav.querySelector('.navFooter');footer?nav.insertBefore(group,footer):nav.appendChild(group)}
  group.innerHTML=`<div class="navLabel">ADMINISTRATION</div>
    <button data-admin-tab="dashboard"><span class="navIcon">⌘</span><span>Admin Console</span></button>
    ${profile.role==='owner'?'<button data-admin-tab="users"><span class="navIcon">♙</span><span>Users & Roles</span></button>':''}
    <button data-admin-tab="releases"><span class="navIcon">⇧</span><span>Release Manager</span></button>
    <button data-admin-tab="logs"><span class="navIcon">≣</span><span>Audit Log</span></button>
    <button data-admin-tab="settings"><span class="navIcon">⚙</span><span>System Settings</span></button>`;
  group.querySelectorAll('[data-admin-tab]').forEach(b=>b.onclick=()=>openAccessPanel(b.dataset.adminTab));
}

function bindReleaseBadges(){
  document.querySelectorAll('.releaseBadge').forEach(b=>{
    b.setAttribute('role','button');b.tabIndex=0;b.title='Open feature release settings';
    const open=e=>{e.stopPropagation();const featureButton=b.closest('[data-v]');const key=featureButton?.dataset.v;openAccessPanel('releases',key)};
    b.onclick=open;b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(e)}};
  });
}

function roleOptions(current){return Object.entries(ROLE_META).map(([r,[icon,label]])=>`<option value="${r}" ${r===current?'selected':''}>${icon} ${label}</option>`).join('')}
function stageOptions(current){return ['development','testing','beta','production','deprecated','hidden'].map(r=>`<option value="${r}" ${r===current?'selected':''}>${r}</option>`).join('')}
function stagePill(stage){return `<span class="stagePill stage-${esc(stage)}">${esc(stage)}</span>`}

function openAccessPanel(tab='dashboard',featureHint=''){
  document.querySelector('#accessPanelOverlay')?.remove();
  const overlay=document.createElement('div');overlay.id='accessPanelOverlay';
  const tabs=[['dashboard','⌂','Dashboard'],['users','👥','Users'],['roles','🔐','Roles'],['features','🧪','Features'],['releases','🚀','Releases'],['logs','📝','Audit Log'],['settings','⚙','System']];
  overlay.innerHTML=`<section class="accessPanel"><header><div><small>ADMINISTRATION</small><h2>Admin Console</h2><p>Manage users, roles, permissions, and feature rollout.</p></div><button id="closeAccessPanel" aria-label="Close">×</button></header><nav class="accessTabs">${tabs.map(([id,icon,label])=>`<button data-access-tab="${id}" ${id===tab?'class="active"':''} ${id==='users'&&profile.role!=='owner'?'disabled':''}><span>${icon}</span>${label}</button>`).join('')}</nav><div id="accessPanelBody"></div></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeAccessPanel').onclick=()=>overlay.remove();overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
  overlay.querySelectorAll('[data-access-tab]').forEach(b=>b.onclick=()=>renderPanelTab(b.dataset.accessTab));
  renderPanelTab(tab,featureHint);
}

function renderPanelTab(tab,featureHint=''){
  const body=document.querySelector('#accessPanelBody');if(!body)return;
  document.querySelectorAll('[data-access-tab]').forEach(b=>b.classList.toggle('active',b.dataset.accessTab===tab));
  if(tab==='dashboard'){
    const stageCount=s=>flags.filter(f=>f.release_stage===s).length;
    body.innerHTML=`<div class="adminMetrics"><article><small>USERS</small><strong>${profiles.length}</strong></article><article><small>ACTIVE FEATURES</small><strong>${flags.filter(f=>f.enabled).length}</strong></article><article><small>IN DEVELOPMENT</small><strong>${stageCount('development')}</strong></article><article><small>PRODUCTION</small><strong>${stageCount('production')}</strong></article></div><div class="adminGrid"><button data-jump="users"><span>👥</span><b>Users & Roles</b><small>Assign access levels and individual permissions.</small></button><button data-jump="releases"><span>🚀</span><b>Release Manager</b><small>Move features through development, testing, beta, and production.</small></button><button data-jump="features"><span>🧪</span><b>Feature Controls</b><small>Enable features and set minimum roles.</small></button><button data-jump="logs"><span>📝</span><b>Audit Log</b><small>Review administrative changes.</small></button></div>`;
    body.querySelectorAll('[data-jump]').forEach(x=>x.onclick=()=>renderPanelTab(x.dataset.jump));return;
  }
  if(tab==='users'){
    body.innerHTML=`<div class="panelIntro"><h3>Users</h3><p>Assign the base role for each account.</p></div>${profiles.map(p=>{const [icon,label]=ROLE_META[p.role]||['👤',p.role];return `<article class="accessCard userAccessCard"><div class="userIdentity"><span>${icon}</span><div><strong>${esc(p.display_name||p.user_id)}</strong><small>${esc(p.user_id)}</small></div></div><div class="roleCurrent">${esc(label)}</div><select data-user-role="${p.user_id}">${roleOptions(p.role)}</select></article>`}).join('')||'<p>No users found.</p>'}`;
    body.querySelectorAll('[data-user-role]').forEach(s=>s.onchange=async()=>{const {error}=await supabase.from('user_profiles').update({role:s.value,updated_at:new Date().toISOString()}).eq('user_id',s.dataset.userRole);if(error){alert(error.message);return}await loadAccessData();renderPanelTab('users')});return;
  }
  if(tab==='roles'){
    body.innerHTML=`<div class="panelIntro"><h3>Role hierarchy</h3><p>Higher roles inherit access to lower-role features.</p></div><div class="roleGrid">${Object.entries(ROLE_META).map(([r,[icon,label]],i)=>`<article><span>${icon}</span><h3>${label}</h3><small>Level ${i+1}</small><p>${r==='rider'?'Production riding and garage tools.':r==='technician'?'Service, parts, and beta tools.':r==='engineer'?'Engineering and development tools.':r==='admin'?'Feature rollout and operational controls.':'Complete system and user administration.'}</p></article>`).join('')}</div>`;return;
  }
  if(tab==='features'||tab==='releases'){
    const rows=featureHint?flags.slice().sort((a,b)=>(a.feature_key===featureHint?-1:b.feature_key===featureHint?1:0)):flags;
    body.innerHTML=`<div class="panelIntro"><h3>${tab==='features'?'Feature Controls':'Release Manager'}</h3><p>${tab==='features'?'Set availability and minimum access role.':'Promote features through the controlled rollout pipeline.'}</p></div>${rows.map(f=>`<article class="accessCard accessFeature ${f.feature_key===featureHint?'featureFocus':''}"><div><div class="featureTitle"><strong>${esc(f.name)}</strong>${stagePill(f.release_stage)}</div><small>${esc(f.feature_key)} · ${esc(f.area||'')}</small></div><label class="enableToggle"><input type="checkbox" data-feature-enabled="${f.id}" ${f.enabled?'checked':''}><span>Enabled</span></label><label><small>Release stage</small><select data-feature-stage="${f.id}">${stageOptions(f.release_stage)}</select></label><label><small>Minimum role</small><select data-feature-role="${f.id}">${roleOptions(f.minimum_role)}</select></label></article>`).join('')||'<p>No feature flags found.</p>'}`;
    body.querySelectorAll('[data-feature-enabled]').forEach(x=>x.onchange=()=>updateFeature(x.dataset.featureEnabled,{enabled:x.checked},tab));body.querySelectorAll('[data-feature-stage]').forEach(x=>x.onchange=()=>updateFeature(x.dataset.featureStage,{release_stage:x.value},tab));body.querySelectorAll('[data-feature-role]').forEach(x=>x.onchange=()=>updateFeature(x.dataset.featureRole,{minimum_role:x.value},tab));return;
  }
  if(tab==='logs')body.innerHTML='<div class="panelIntro"><h3>Audit Log</h3><p>Administrative event storage is ready to be connected. Role and release changes are currently protected by Supabase row-level security.</p></div><div class="emptyAdmin">No recorded events yet.</div>';
  if(tab==='settings')body.innerHTML='<div class="panelIntro"><h3>System Settings</h3><p>Platform-wide controls and deployment settings.</p></div><article class="accessCard"><div><strong>Access system</strong><small>Role-based access and controlled feature rollout</small></div><span class="statusOnline">ONLINE</span></article>';
}

async function updateFeature(id,changes,tab='releases'){const {error}=await supabase.from('feature_flags').update({...changes,updated_at:new Date().toISOString()}).eq('id',id);if(error){alert(error.message);return}await loadAccessData();renderPanelTab(tab)}

const observer=new MutationObserver(()=>ensureAccessUI());observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:false});
supabase.auth.onAuthStateChange(()=>setTimeout(loadAccessData,0));loadAccessData();