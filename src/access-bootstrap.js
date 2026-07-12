import { supabase } from './supabase.js';

const esc=(s='')=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
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
  profiles=users.data||[];
  flags=featureRows.data||[];
  grants=grantRows.data||[];
  ensureAccessUI();
}

function removeAccessUI(){
  document.querySelector('#accessQuickButton')?.remove();
  document.querySelector('#accessPanelOverlay')?.remove();
  document.querySelector('#accessBootstrapGroup')?.remove();
}

function ensureAccessUI(){
  if(!session||!profile)return;
  ensureQuickButton();
  ensureNavControls();
}

function ensureQuickButton(){
  let button=document.querySelector('#accessQuickButton');
  if(!button){
    button=document.createElement('button');
    button.id='accessQuickButton';
    button.type='button';
    button.addEventListener('click',openAccessPanel);
    document.body.appendChild(button);
  }
  button.textContent=profile.role.toUpperCase();
  button.title=profile.role==='owner'?'Open Users & Access':'View access level';
}

function ensureNavControls(){
  if(!['admin','owner'].includes(profile.role))return;
  const nav=document.querySelector('#nav');
  if(!nav||document.querySelector('#accessBootstrapGroup'))return;
  const group=document.createElement('div');
  group.id='accessBootstrapGroup';
  group.className='navGroup';
  group.innerHTML=`<div class="navLabel">ADMINISTRATION</div><button id="bootstrapReleaseManager"><span class="navIcon">⇧</span><span>Release Manager</span></button>${profile.role==='owner'?'<button id="bootstrapUsersAccess"><span class="navIcon">♙</span><span>Users & Access</span></button>':''}`;
  const footer=nav.querySelector('.navFooter');
  footer?nav.insertBefore(group,footer):nav.appendChild(group);
  group.querySelector('#bootstrapReleaseManager')?.addEventListener('click',()=>openAccessPanel('releases'));
  group.querySelector('#bootstrapUsersAccess')?.addEventListener('click',()=>openAccessPanel('users'));
}

function roleOptions(current){return ['rider','technician','engineer','admin','owner'].map(r=>`<option value="${r}" ${r===current?'selected':''}>${r}</option>`).join('')}
function stageOptions(current){return ['development','testing','beta','production','deprecated','hidden'].map(r=>`<option value="${r}" ${r===current?'selected':''}>${r}</option>`).join('')}

function openAccessPanel(tab=profile.role==='owner'?'users':'releases'){
  document.querySelector('#accessPanelOverlay')?.remove();
  const overlay=document.createElement('div');
  overlay.id='accessPanelOverlay';
  overlay.innerHTML=`<section class="accessPanel"><header><div><small>ACCESS CONTROL</small><h2>${tab==='users'?'Users & Access':'Release Manager'}</h2></div><button id="closeAccessPanel" aria-label="Close">×</button></header><nav class="accessTabs"><button data-access-tab="users" ${tab==='users'?'class="active"':''} ${profile.role!=='owner'?'disabled':''}>Users</button><button data-access-tab="releases" ${tab==='releases'?'class="active"':''}>Releases</button></nav><div id="accessPanelBody"></div></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeAccessPanel').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
  overlay.querySelectorAll('[data-access-tab]').forEach(b=>b.onclick=()=>renderPanelTab(b.dataset.accessTab));
  renderPanelTab(tab);
}

function renderPanelTab(tab){
  const body=document.querySelector('#accessPanelBody');if(!body)return;
  document.querySelectorAll('[data-access-tab]').forEach(b=>b.classList.toggle('active',b.dataset.accessTab===tab));
  if(tab==='users'){
    body.innerHTML=profiles.map(p=>`<article class="accessCard"><div><strong>${esc(p.display_name||p.user_id)}</strong><small>${esc(p.user_id)}</small></div><select data-user-role="${p.user_id}">${roleOptions(p.role)}</select></article>`).join('')||'<p>No users found.</p>';
    body.querySelectorAll('[data-user-role]').forEach(s=>s.onchange=async()=>{
      const {error}=await supabase.from('user_profiles').update({role:s.value,updated_at:new Date().toISOString()}).eq('user_id',s.dataset.userRole);
      if(error){alert(error.message);return;}await loadAccessData();renderPanelTab('users');
    });
  }else{
    body.innerHTML=flags.map(f=>`<article class="accessCard accessFeature"><div><strong>${esc(f.name)}</strong><small>${esc(f.feature_key)} · ${esc(f.area||'')}</small></div><label><input type="checkbox" data-feature-enabled="${f.id}" ${f.enabled?'checked':''}> Enabled</label><select data-feature-stage="${f.id}">${stageOptions(f.release_stage)}</select><select data-feature-role="${f.id}">${roleOptions(f.minimum_role)}</select></article>`).join('')||'<p>No feature flags found.</p>';
    body.querySelectorAll('[data-feature-enabled]').forEach(x=>x.onchange=()=>updateFeature(x.dataset.featureEnabled,{enabled:x.checked}));
    body.querySelectorAll('[data-feature-stage]').forEach(x=>x.onchange=()=>updateFeature(x.dataset.featureStage,{release_stage:x.value}));
    body.querySelectorAll('[data-feature-role]').forEach(x=>x.onchange=()=>updateFeature(x.dataset.featureRole,{minimum_role:x.value}));
  }
}

async function updateFeature(id,changes){
  const {error}=await supabase.from('feature_flags').update({...changes,updated_at:new Date().toISOString()}).eq('id',id);
  if(error){alert(error.message);return;}await loadAccessData();renderPanelTab('releases');
}

const observer=new MutationObserver(()=>ensureAccessUI());
observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:false});
supabase.auth.onAuthStateChange(()=>setTimeout(loadAccessData,0));
loadAccessData();
