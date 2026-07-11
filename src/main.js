import './styles.css';import { supabase } from './supabase.js';
const app=document.querySelector('#app');let session,state={bikes:[],tasks:[],parts:[],notes:[],maintenance:[],rides:[],firmware:[],engineering_items:[],task_media:[],task_attachments:[],task_dependencies:[],pcb_projects:[],pcb_components:[],pcb_pins:[],pcb_connectors:[],pcb_revisions:[]},view='dashboard',engType='features',modal=null,roadMode='cards';
const tables=['bikes','tasks','parts','notes','maintenance','rides','firmware','engineering_items','task_media','task_attachments','task_dependencies','ai_messages','ai_change_proposals','pcb_projects','pcb_components','pcb_pins','pcb_connectors','pcb_revisions'];
const stageOrder=['0 - Definition','1 - Bench Core','2 - Vehicle Read-Only','3 - Suspension Telemetry','4 - Motion & GNSS','5 - Display & App','6 - Quickshifter Experiment','7 - Wideband & Tuning','8 - Productization'];
const statusList=['Not Started','Researching','Ordered','In Progress','Blocked','Testing','Validated','Deferred','Complete'];
const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)],uid=()=>session.user.id;
const esc=(s='')=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n||0);
const toast=t=>{let e=$('#toast');if(!e)return;e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2400)};
const ext=n=>(n.split('.').pop()||'').toLowerCase();
const templates={
 Electronics:{objective:'Build and validate the electronics subsystem.',background:'Document its role in the complete motorcycle data system.',prerequisites:'Required upstream hardware and power must be available.',safety_notes:'Use current-limited bench power. Do not connect to the motorcycle until bench validation passes.',procedure:'1. Review datasheets and pinout.\n2. Build the bench circuit.\n3. Verify power rails.\n4. Load test firmware.\n5. Record measurements.\n6. Validate acceptance criteria.',acceptance_criteria:'Powers reliably, communicates correctly, survives restart, and produces repeatable measurements.',deliverables:'Schematic or wiring diagram\nFirmware/source code\nBench photos\nTest results',test_procedure:'Perform power, communication, restart, and fault tests.',proof_rules:[{category:'code',label:'Source code',extensions:['ino','cpp','c','h','py','js','zip'],min:1},{category:'physical',label:'Physical build photos',extensions:['jpg','jpeg','png','heic','webp'],min:2},{category:'test',label:'Test evidence',extensions:['pdf','docx','xlsx','csv','jpg','jpeg','png','mp4','mov'],min:1}]},
 Mechanical:{objective:'Design, fabricate, install, and validate the mechanical component.',background:'Explain how the part interfaces with the motorcycle and sensors.',prerequisites:'Mounting envelope, loads, travel, clearances, and materials must be known.',safety_notes:'Verify steering, suspension travel, heat, moving parts, and fastener retention before riding.',procedure:'1. Measure the motorcycle.\n2. Create CAD.\n3. Review clearances.\n4. Manufacture prototype.\n5. Install and inspect.\n6. Perform static and dynamic validation.',acceptance_criteria:'Fits without interference, remains secure, and passes full-range movement and load checks.',deliverables:'CAD file\nDrawing or dimensions\nInstalled photos\nValidation evidence',test_procedure:'Check full motion, fastener security, cable routing, and vibration.',proof_rules:[{category:'cad',label:'CAD/design file',extensions:['step','stp','sldprt','sldasm','iges','igs','stl','dxf','dwg','f3d','zip'],min:1},{category:'physical',label:'Installed photos',extensions:['jpg','jpeg','png','heic','webp'],min:3},{category:'test',label:'Validation evidence',extensions:['pdf','docx','xlsx','csv','jpg','jpeg','png','mp4','mov'],min:1}]},
 Software:{objective:'Implement and verify the required software feature.',background:'Describe the inputs, outputs, timing, and role within the system.',prerequisites:'Required hardware drivers, interfaces, and data definitions must exist.',safety_notes:'Keep vehicle-control outputs disabled during development and simulation.',procedure:'1. Write requirements.\n2. Design the logic or state machine.\n3. Implement code.\n4. Run unit and bench tests.\n5. Capture results.\n6. Tag a release.',acceptance_criteria:'Code builds, runs without critical faults, and passes documented tests.',deliverables:'Source code\nREADME or design note\nTest output\nRelease notes',test_procedure:'Run normal, boundary, disconnect, restart, and invalid-input tests.',proof_rules:[{category:'code',label:'Source code',extensions:['ino','cpp','c','h','py','js','ts','json','zip'],min:1},{category:'document',label:'Design/readme',extensions:['md','txt','pdf','docx'],min:1},{category:'test',label:'Test evidence',extensions:['csv','log','txt','pdf','docx','xlsx','png','jpg','mp4'],min:1}]},
 CAD:{objective:'Create and validate the required CAD design.',background:'Define interfaces, envelope, materials, and manufacturing method.',prerequisites:'Reference dimensions and component models must be available.',safety_notes:'Check clearances, edges, fasteners, strength, heat, and moving components.',procedure:'1. Capture dimensions.\n2. Create reference geometry.\n3. Model the part or assembly.\n4. Review interfaces.\n5. Produce drawing/export.\n6. Validate with mockup or prototype.',acceptance_criteria:'CAD is complete, correctly dimensioned, manufacturable, and validated against the physical envelope.',deliverables:'Native CAD\nSTEP export\nDrawing/PDF\nScreenshots or prototype photos',test_procedure:'Perform interference, range-of-motion, assembly, and dimensional checks.',proof_rules:[{category:'cad',label:'Native or exchange CAD',extensions:['step','stp','sldprt','sldasm','iges','igs','stl','dxf','dwg','f3d','zip'],min:1},{category:'document',label:'Drawing or design document',extensions:['pdf','docx','xlsx','dxf'],min:1},{category:'physical',label:'CAD screenshot or physical proof',extensions:['jpg','jpeg','png','heic','webp'],min:1}]},
 Research:{objective:'Answer the engineering question using credible evidence.',background:'State why the question matters to the design.',prerequisites:'Define scope, search terms, and required outputs.',safety_notes:'Document uncertainty and do not treat unverified claims as validated design inputs.',procedure:'1. Define the question.\n2. Collect sources.\n3. Extract relevant evidence.\n4. Compare alternatives.\n5. Record conclusions.\n6. Identify design implications.',acceptance_criteria:'The question is answered with cited evidence and a clear engineering decision or next experiment.',deliverables:'Research summary\nSource documents\nDecision or recommendation',test_procedure:'Cross-check conclusions against at least two sources or an experiment.',proof_rules:[{category:'document',label:'Research summary',extensions:['docx','pdf','md','txt'],min:1},{category:'source',label:'Source material',extensions:['pdf','docx','xlsx','csv','zip'],min:1}]},
 Suspension:{objective:'Install, calibrate, and validate the suspension measurement or tuning feature.',background:'Explain the sensor location, motion ratio, data rate, and tuning value.',prerequisites:'Sensor range, mounting path, ADC, and reference measurement tools must be available.',safety_notes:'Prevent cable snagging, end-stop damage, steering interference, and suspension binding.',procedure:'1. Measure full travel and clearance.\n2. Design the mount.\n3. Install sensor and guard.\n4. Calibrate position.\n5. Validate dynamic response.\n6. Record ride results.',acceptance_criteria:'Sensor covers full travel, does not bind, and produces calibrated repeatable data.',deliverables:'CAD/mount details\nInstalled photos\nCalibration spreadsheet\nTest video or data',test_procedure:'Perform full-travel static test, repeated displacement test, and controlled ride validation.',proof_rules:[{category:'cad',label:'Mount design',extensions:['step','stp','sldprt','stl','dxf','pdf','zip'],min:1},{category:'physical',label:'Installed photos',extensions:['jpg','jpeg','png','heic','webp'],min:3},{category:'calibration',label:'Calibration file',extensions:['xlsx','csv','docx','pdf'],min:1},{category:'test',label:'Dynamic test evidence',extensions:['csv','log','xlsx','mp4','mov','jpg','png','pdf'],min:1}]},
 Maintenance:{objective:'Complete and document the maintenance action.',background:'Record why the service is due and any symptoms.',prerequisites:'Parts, consumables, tools, specifications, and torque values must be available.',safety_notes:'Support the motorcycle securely and follow manufacturer procedures.',procedure:'1. Record before condition.\n2. Complete service.\n3. Apply torque/specifications.\n4. Inspect related systems.\n5. Record after condition.\n6. Update mileage and next due interval.',acceptance_criteria:'Service is complete, no leaks or faults are present, and the next interval is recorded.',deliverables:'Before/after photos\nParts receipt or list\nService notes',test_procedure:'Perform post-service inspection and short functional test.',proof_rules:[{category:'physical',label:'Before/after photos',extensions:['jpg','jpeg','png','heic','webp'],min:2},{category:'document',label:'Service record/receipt',extensions:['pdf','docx','xlsx','jpg','jpeg','png'],min:1}]},
 General:{objective:'Complete and document the defined engineering task.',background:'Explain why this task is needed.',prerequisites:'List all required inputs and dependencies.',safety_notes:'Identify relevant safety concerns.',procedure:'1. Prepare.\n2. Execute.\n3. Test.\n4. Document.',acceptance_criteria:'All required deliverables and proof are complete.',deliverables:'Work product\nProof of completion\nResults',test_procedure:'Verify the output against the acceptance criteria.',proof_rules:[{category:'document',label:'Completion evidence',extensions:['pdf','docx','xlsx','csv','jpg','jpeg','png','mp4','mov','zip'],min:1}]}
};
async function load(){for(const t of tables){const{data,error}=await supabase.from(t).select('*').order('created_at',{ascending:false});if(error)console.error(t,error);state[t]=data||[]}normalizeTasks();render()}
function normalizeTasks(){state.tasks.sort((a,b)=>(a.sort_order??9999)-(b.sort_order??9999)||stageOrder.indexOf(a.stage)-stageOrder.indexOf(b.stage)||(a.source_id||'').localeCompare(b.source_id||''))}
function auth(){app.innerHTML=`<main><div class="card" style="max-width:480px;margin:8vh auto"><span class="eyebrow">MOTO ENGINEERING CLOUD</span><h2>Sign in to your garage</h2><form id="auth" class="stack"><input name="email" type="email" placeholder="Email" required><input name="password" type="password" placeholder="Password" required><button class="primary" value="signin">Sign in</button><button class="secondary" value="signup">Create account</button></form><p id="msg" class="muted"></p></div></main>`;$('#auth').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target),a=e.submitter.value,r=a==='signup'?await supabase.auth.signUp({email:f.get('email'),password:f.get('password')}):await supabase.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});$('#msg').textContent=r.error?.message||'Success'}}
function shell(){app.innerHTML=`<header class="top"><button id="menu" class="icon">☰</button><div><h1>Moto Engineering Cloud</h1><p>${esc(session.user.email)}</p></div><div class="spacer"></div><input id="globalSearch" style="max-width:320px" placeholder="Search everything…"><button id="logout" class="secondary">Sign out</button></header><div class="layout"><nav id="nav" class="nav">${[['dashboard','Dashboard'],['garageMode','Garage Mode'],['garage','Garage'],['roadmap','Work Packages'],['pcb','PCB Designer'],['engineering','Engineering'],['parts','Parts'],['notes','Notebook'],['maintenance','Maintenance'],['rides','Rides'],['media','Files'],['firmware','Firmware'],['ai','AI Assistant']].map(([x,l])=>`<button data-v="${x}" class="${view===x?'active':''}">${l}</button>`).join('')}</nav><main id="main"></main></div><div id="searchResults" class="searchResults hidden"></div><div id="modal" class="modal hidden"></div><div id="toast" class="toast"></div>`;$('#menu').onclick=()=>$('#nav').classList.toggle('open');$('#logout').onclick=()=>supabase.auth.signOut();$$('[data-v]').forEach(b=>b.onclick=()=>{view=b.dataset.v;shell();render()});$('#globalSearch').oninput=globalSearch}
const metric=(a,b,c='')=>`<div class="metric"><span>${a}</span><strong>${b}</strong>${c?`<small>${c}</small>`:''}</div>`;
function buttons(t,id){return `<div class="actions"><button class="mini" data-edit="${t}:${id}">Edit</button><button class="mini" data-del="${t}:${id}">Delete</button></div>`}
function globalSearch(e){let q=e.target.value.trim().toLowerCase(),box=$('#searchResults');if(q.length<2){box.classList.add('hidden');return}let res=[];for(const t of ['tasks','parts','notes','maintenance','rides','firmware','engineering_items'])for(const x of state[t]||[])if(JSON.stringify(x).toLowerCase().includes(q))res.push({t,x});box.innerHTML=res.slice(0,40).map(({t,x})=>`<div class="item" style="margin-bottom:7px"><b>${esc(x.title||x.part||x.service||x.name||x.source_id||t)}</b><div class="sub">${esc(t)} · ${esc(x.stage||x.bike||x.category||'')}</div></div>`).join('')||'<div class="empty">No results</div>';box.classList.remove('hidden')}
function bind(){$$('[data-add]').forEach(b=>b.onclick=()=>chooseTemplate());$$('[data-edit]').forEach(b=>b.onclick=()=>{let[t,id]=b.dataset.edit.split(':');openForm(t,state[t].find(x=>x.id===id))});$$('[data-del]').forEach(b=>b.onclick=async()=>{let[t,id]=b.dataset.del.split(':');if(confirm('Delete this item?')){await supabase.from(t).delete().eq('id',id);await load()}});$$('[data-upload]').forEach(b=>b.onchange=e=>uploadAttachment(b.dataset.upload,e.target.files,b.dataset.proof||''));$$('[data-complete]').forEach(b=>b.onclick=()=>attemptComplete(b.dataset.complete));$$('[data-check]').forEach(c=>c.onchange=()=>toggleChecklist(c.dataset.check,+c.dataset.index,c.checked));$$('[data-seed]').forEach(b=>b.onclick=seedStarter);$$('[data-order]').forEach(b=>b.onclick=applyRecommendedOrder);$$('[data-download]').forEach(b=>b.onclick=()=>downloadAttachment(b.dataset.download));$$('[data-proposal]').forEach(b=>b.onclick=()=>reviewProposal(b.dataset.proposal,b.dataset.decision));
if($('#aiForm'))$('#aiForm').onsubmit=sendAI;
if($('#garageTask'))$('#garageTask').onchange=e=>{localStorage.setItem('garageTaskId',e.target.value);render()};
$$('[data-garage-photo]').forEach(x=>x.onchange=e=>garageUpload(e.target.files,'physical'));
$$('[data-garage-video]').forEach(x=>x.onchange=e=>garageUpload(e.target.files,'test'));
$$('[data-garage-check]').forEach(x=>x.onchange=()=>toggleChecklist(x.dataset.garageCheck,+x.dataset.index,x.checked));
if($('#garageNoteBtn'))$('#garageNoteBtn').onclick=startGarageDictation;
if($('#garageSaveNote'))$('#garageSaveNote').onclick=saveGarageNote;
if($('#garageAskAI'))$('#garageAskAI').onclick=garageAskAI;
if($('#garageTelemetry'))$('#garageTelemetry').onclick=showTelemetryPanel;
if($('#garageRefresh'))$('#garageRefresh').onclick=load;
$$('[data-pcb-tab]').forEach(b=>b.onclick=()=>{localStorage.setItem('pcbTab',b.dataset.pcbTab);render()});
$$('[data-pcb-project]').forEach(b=>b.onclick=()=>{localStorage.setItem('pcbProjectId',b.dataset.pcbProject);render()});
$$('[data-pcb-add]').forEach(b=>b.onclick=()=>openPCBForm(b.dataset.pcbAdd,{}));
$$('[data-pcb-edit]').forEach(b=>b.onclick=()=>{let[t,id]=b.dataset.pcbEdit.split(':');openPCBForm(t,state[t].find(x=>x.id===id))});
$$('[data-pcb-del]').forEach(b=>b.onclick=()=>deletePCBRecord(b.dataset.pcbDel));
if($('#seedPCB'))$('#seedPCB').onclick=seedPCBRevA
}
function depsFor(taskId){return state.task_dependencies.filter(x=>x.task_id===taskId)}
function dependenciesComplete(taskId){return depsFor(taskId).every(d=>state.tasks.find(t=>t.id===d.depends_on_task_id)?.status==='Complete')}
function proofStatus(task){let rules=Array.isArray(task.proof_rules)?task.proof_rules:[],files=state.task_attachments.filter(x=>x.task_id===task.id);return rules.map(r=>{let count=files.filter(f=>f.proof_category===r.category||r.extensions.includes((f.extension||'').toLowerCase())).length;return{...r,count,pass:count>=(r.min||1)}})}
function taskUnlocked(task){return dependenciesComplete(task.id)}
function gatePass(task){return taskUnlocked(task)&&proofStatus(task).every(x=>x.pass)}
function taskCompletion(t){if(t.status==='Complete')return 100;let checks=Array.isArray(t.checklist)?t.checklist:[],checkPct=checks.length?100*checks.filter(x=>x.done).length/checks.length:0,proof=proofStatus(t),proofPct=proof.length?100*proof.filter(x=>x.pass).length/proof.length:0;return Math.round(checks.length&&proof.length?(checkPct+proofPct)/2:Math.max(checkPct,proofPct,+t.progress||0))}
function stageRank(s){let i=stageOrder.indexOf(s);return i<0?999:i}
function render(){
 const m=$('#main');if(!m)return;
 if(view==='dashboard'){let done=state.tasks.filter(x=>x.status==='Complete').length,total=state.tasks.length,budget=state.parts.reduce((s,x)=>s+(x.qty||0)*(x.unit_cost||0),0),locked=state.tasks.filter(x=>!taskUnlocked(x)).length,proofReady=state.tasks.filter(x=>x.status!=='Complete'&&gatePass(x)).length;m.innerHTML=`<div class="hero card"><div><span class="eyebrow">GATED ENGINEERING WORKFLOW</span><h2>Universal Motorcycle Data System</h2><p>Every work package has a defined objective, method, acceptance criteria, deliverables, and mandatory proof. Dependent work stays locked until upstream work is proven complete.</p></div><div class="actions"><button class="secondary" data-order>Apply recommended order</button><button class="primary" data-seed>Refresh workbook</button></div></div><div class="metrics">${metric('Complete',`${done}/${total}`)}${metric('Locked packages',locked)}${metric('Ready for approval',proofReady)}${metric('Planned budget',money(budget))}</div><div class="two"><div class="card"><h3>Next unlocked work</h3>${state.tasks.filter(x=>x.status!=='Complete'&&taskUnlocked(x)).slice(0,8).map(x=>`<div class="item" style="margin-bottom:8px"><b>${esc(x.title)}</b><div class="sub">${esc(x.work_type||'General')} · ${esc(x.stage)}</div><div class="progress" style="margin-top:8px"><i style="width:${taskCompletion(x)}%"></i></div></div>`).join('')||'<div class="empty">No unlocked work.</div>'}</div><div class="card"><h3>Proof enforcement</h3><p>Software requires source code. Physical work requires photos. CAD work requires design files. Calibration and testing require result files. Completion is blocked until all required proof and dependencies pass.</p></div></div>`}

 if(view==='garageMode'){
  let activeId=localStorage.getItem('garageTaskId')||state.tasks.find(t=>t.status!=='Complete'&&taskUnlocked(t))?.id||state.tasks[0]?.id||'';
  let t=state.tasks.find(x=>x.id===activeId),files=t?state.task_attachments.filter(x=>x.task_id===t.id):[],proof=t?proofStatus(t):[],checks=t&&Array.isArray(t.checklist)?t.checklist:[];
  m.innerHTML=`<div class="garageMode">
    <div class="garageHeader">
      <div><span class="eyebrow">IPHONE GARAGE COMPANION</span><h2>Garage Mode</h2><p>Capture proof, update the active package, dictate notes, and ask AI without navigating the full app.</p></div>
      <button id="garageRefresh" class="garageRound">↻</button>
    </div>
    <div class="garageTaskPicker card">
      <label>Active work package</label>
      <select id="garageTask"><option value="">Choose a package</option>${state.tasks.filter(x=>x.status!=='Complete').map(x=>`<option value="${x.id}" ${x.id===activeId?'selected':''}>${esc(x.source_id||'')} ${esc(x.title)}</option>`).join('')}</select>
    </div>
    ${t?`<div class="garageActive card">
      <div class="rowtop"><div><span class="eyebrow">${esc(t.work_type||'GENERAL')} · ${esc(t.stage)}</span><h2>${esc(t.title)}</h2></div><span class="garagePct">${taskCompletion(t)}%</span></div>
      ${taskUnlocked(t)?'<div class="gatePass">Package is unlocked.</div>':'<div class="lockedBanner">Package is locked by an incomplete prerequisite.</div>'}
      <div class="progress"><i style="width:${taskCompletion(t)}%"></i></div>
      <p>${esc(t.objective||t.notes||'')}</p>
    </div>
    <div class="garageButtons">
      <label class="garageAction photo"><span>📸</span><b>Progress Photo</b><small>Take or select pictures</small><input hidden type="file" accept="image/*" capture="environment" multiple data-garage-photo></label>
      <label class="garageAction video"><span>🎥</span><b>Test Video</b><small>Record proof of operation</small><input hidden type="file" accept="video/*" capture="environment" multiple data-garage-video></label>
      <button id="garageNoteBtn" class="garageAction note"><span>🎤</span><b>Dictate Note</b><small>Speak while you work</small></button>
      <button id="garageAskAI" class="garageAction ai"><span>🤖</span><b>Ask AI</b><small>Review this package</small></button>
      <button id="garageTelemetry" class="garageAction telemetry"><span>📊</span><b>Live Telemetry</b><small>Check device connection</small></button>
      <button class="garageAction checklist" onclick="document.getElementById('garageChecklist').scrollIntoView({behavior:'smooth'})"><span>✅</span><b>Checklist</b><small>Update the next step</small></button>
    </div>
    <div id="garageNotePanel" class="card garageNotePanel">
      <h3>Quick engineering note</h3>
      <textarea id="garageNoteText" placeholder="Tap Dictate Note, or type what changed, what you measured, and what needs attention."></textarea>
      <button id="garageSaveNote" class="primary">Save note to this package</button>
      <div id="speechStatus" class="sub"></div>
    </div>
    <div id="garageChecklist" class="card">
      <div class="rowtop"><h3>Checklist</h3><span class="badge">${checks.filter(x=>x.done).length}/${checks.length}</span></div>
      <div class="garageCheckList">${checks.map((c,i)=>`<label class="garageCheck ${c.done?'done':''}"><input type="checkbox" data-garage-check="${t.id}" data-index="${i}" ${c.done?'checked':''} ${taskUnlocked(t)?'':'disabled'}><span>${esc(c.text)}</span></label>`).join('')||'<div class="empty">No checklist has been defined yet.</div>'}</div>
    </div>
    <div class="two garageBottom">
      <div class="card"><h3>Required proof</h3><div class="proofGrid">${proof.map(p=>`<div class="proofBox ${p.pass?'pass':'fail'}"><b>${esc(p.label)}</b><div class="sub">${p.count}/${p.min||1}</div></div>`).join('')||'<div class="empty">No proof rules.</div>'}</div></div>
      <div class="card"><h3>Recent files</h3><div class="attachmentList">${files.slice(0,8).map(attachmentRow).join('')||'<div class="empty">No files yet.</div>'}</div></div>
    </div>`:`<div class="empty">Choose an active work package to begin.</div>`}
  </div>`;
 }

 if(view==='garage')m.innerHTML=`<div class="section"><div><span class="eyebrow">GARAGE</span><h2>Motorcycles</h2></div><button class="primary" data-add="bikes">Add bike</button></div><div class="grid">${state.bikes.map(x=>`<div class="card bikeHero"><div style="width:100%"><div class="rowtop"><div><span class="eyebrow">${esc(x.year)} ${esc(x.make)}</span><h2 style="margin:4px 0">${esc(x.name)}</h2></div>${buttons('bikes',x.id)}</div><p>${esc(x.notes)}</p></div></div>`).join('')||'<div class="empty">No bikes yet.</div>'}</div>`;
 if(view==='roadmap'){let grouped=stageOrder.map(s=>[s,state.tasks.filter(x=>x.stage===s)]).filter(x=>x[1].length);m.innerHTML=`<div class="section"><div><span class="eyebrow">ENGINEERING WORK PACKAGES</span><h2>Roadmap</h2></div><div class="actions"><button class="secondary" data-order>Apply recommended order</button><button class="primary" data-add="tasks">New work package</button></div></div><div class="stack">${grouped.map(([s,rows],si)=>`<section class="stageLane"><div class="stageTitle"><span class="num">${si+1}</span><h3>${esc(s)}</h3><p class="sub">${rows.length} packages</p></div><div class="stack">${rows.map(workPackageCard).join('')}</div></section>`).join('')}</div>`;setTimeout(loadAttachmentThumbs,0)}

 if(view==='pcb'){
  let projects=state.pcb_projects||[],storedId=localStorage.getItem('pcbProjectId')||'',p=projects.find(x=>x.id===storedId)||projects[0]||null,projectId=p?.id||'',tab=localStorage.getItem('pcbTab')||'overview';if(projectId&&storedId!==projectId)localStorage.setItem('pcbProjectId',projectId);
  m.innerHTML=`<div class="section"><div><span class="eyebrow">REV A HARDWARE DESIGN</span><h2>PCB Designer</h2></div><div class="actions"><button id="seedPCB" class="secondary">Load Rev A starter</button><button class="primary" data-pcb-add="pcb_projects">New board</button></div></div>
  <div class="pcbProjectBar">${projects.map(x=>`<button data-pcb-project="${x.id}" class="${x.id===projectId?'active':''}">${esc(x.name)} · ${esc(x.revision)}</button>`).join('')||'<div class="empty">Create or load the Rev A starter project.</div>'}</div>
  ${p?`<div class="card pcbHero"><div class="rowtop"><div><span class="eyebrow">${esc(p.revision)} · ${esc(p.status)}</span><h2>${esc(p.name)}</h2><p>${esc(p.description||'')}</p></div><div class="actions"><button class="mini" data-pcb-edit="pcb_projects:${p.id}">Edit board</button><button class="danger mini" data-pcb-del="pcb_projects:${p.id}">Delete PCB</button></div></div><div class="pcbStats"><div><span>Size</span><b>${p.board_width_mm||'—'} × ${p.board_height_mm||'—'} mm</b></div><div><span>Layers</span><b>${p.layer_count||4}</b></div><div><span>Components</span><b>${(state.pcb_components||[]).filter(x=>x.pcb_project_id===p.id).length}</b></div><div><span>Pins assigned</span><b>${(state.pcb_pins||[]).filter(x=>x.pcb_project_id===p.id&&x.function).length}</b></div></div></div>
  <div class="tabs pcbTabs">${[['overview','Overview'],['pins','Pin Map'],['connectors','Connectors'],['components','Components/BOM'],['revisions','Revisions']].map(([id,l])=>`<button data-pcb-tab="${id}" class="tab ${tab===id?'active':''}">${l}</button>`).join('')}</div>
  ${renderPCBTab(p,tab)}`:''}`;
 }

 if(view==='engineering'){let types=[['features','Features'],['interfaces','Interfaces'],['power_budget','Power'],['pin_plan','Pins'],['data_dictionary','Data'],['tests','Tests'],['calibrations','Calibration'],['risks','Risks'],['bike_profiles','Bike profiles'],['software','Software'],['decisions','Decisions']];let rows=state.engineering_items.filter(x=>x.item_type===engType);m.innerHTML=`<div class="section"><div><span class="eyebrow">WORKBOOK DATABASE</span><h2>Engineering</h2></div></div><div class="tabs">${types.map(([x,l])=>`<button class="tab ${engType===x?'active':''}" data-eng="${x}">${l}</button>`).join('')}</div><div class="stack">${rows.map(x=>`<article class="item"><h3>${esc(x.source_id||'')} ${esc(x.title)}</h3><p>${esc(x.notes||'')}</p></article>`).join('')||'<div class="empty">No records.</div>'}</div>`;setTimeout(()=>$$('[data-eng]').forEach(b=>b.onclick=()=>{engType=b.dataset.eng;render()}),0)}
 if(view==='parts'){let total=state.parts.reduce((s,x)=>s+(x.qty||0)*(x.unit_cost||0),0);m.innerHTML=`<div class="section"><div><span class="eyebrow">BOM & PROCUREMENT</span><h2>Parts</h2></div></div><div class="metrics">${metric('Planned',money(total))}${metric('Items',state.parts.length)}${metric('Owned',state.parts.filter(x=>x.owned).length)}${metric('Installed',state.parts.filter(x=>x.installed).length)}</div><div class="stack">${(state.parts||[]).map(x=>`<article class="item"><div class="rowtop"><div><h3>${esc(x.source_id||'')} ${esc(x.part)}</h3><div class="sub">${esc(x.system)} · ${esc(x.stage||'')}</div></div>${buttons('parts',x.id)}</div><p>${esc(x.specification||x.notes||'')}</p></article>`).join('')||'<div class="empty">No parts.</div>'}</div>`}
 if(view==='notes')m.innerHTML=`<div class="section"><div><span class="eyebrow">ENGINEERING NOTEBOOK</span><h2>Notes</h2></div></div><div class="timeline">${state.notes.map(x=>`<div class="timelineItem card"><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p></div>`).join('')||'<div class="empty">No notes.</div>'}</div>`;
 if(view==='maintenance')m.innerHTML=`<div class="section"><div><span class="eyebrow">SERVICE HISTORY</span><h2>Maintenance</h2></div></div><div class="stack">${state.maintenance.map(x=>`<div class="item"><h3>${esc(x.service)}</h3><p>${esc(x.notes)}</p></div>`).join('')||'<div class="empty">No maintenance.</div>'}</div>`;
 if(view==='rides')m.innerHTML=`<div class="section"><div><span class="eyebrow">RIDE LOG</span><h2>Rides</h2></div></div><div class="grid">${state.rides.map(x=>`<div class="card"><h3>${esc(x.title)}</h3><p>${esc(x.notes)}</p></div>`).join('')||'<div class="empty">No rides.</div>'}</div>`;
 if(view==='media')m.innerHTML=`<div class="section"><div><span class="eyebrow">DOCUMENT CONTROL</span><h2>All task files</h2></div></div><div class="stack">${state.task_attachments.map(a=>attachmentRow(a)).join('')||'<div class="empty">No files uploaded.</div>'}</div>`;
 if(view==='firmware')m.innerHTML=`<div class="section"><div><span class="eyebrow">REVISIONS</span><h2>Firmware</h2></div></div><div class="stack">${state.firmware.map(x=>`<div class="item"><h3>${esc(x.name)} v${esc(x.version)}</h3><p>${esc(x.notes)}</p></div>`).join('')||'<div class="empty">No firmware.</div>'}</div>`;
 if(view==='ai'){let msgs=[...(state.ai_messages||[])].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)),props=(state.ai_change_proposals||[]).filter(x=>x.status==='pending');m.innerHTML=`<div class="section"><div><span class="eyebrow">SERVER-SIDE OPENAI</span><h2>AI Project Assistant</h2></div></div><div class="two"><div class="card aiChat"><div id="aiMessages" class="aiMessages">${msgs.slice(-30).map(x=>`<div class="aiBubble ${x.role}"><b>${x.role==='user'?'You':'Moto AI'}</b><p>${esc(x.content)}</p></div>`).join('')||'<div class="empty">Ask about the roadmap, missing proof, parts, maintenance, or next steps.</div>'}</div><form id="aiForm" class="aiComposer"><select name="taskId"><option value="">Whole project</option>${state.tasks.map(t=>`<option value="${t.id}">${esc(t.source_id||'')} ${esc(t.title)}</option>`).join('')}</select><textarea name="message" placeholder="Example: Review the ESP32 bench tasks and propose the safest next steps." required></textarea><button class="primary">Ask AI</button></form></div><div class="card"><h3>Pending changes</h3><p class="muted">AI changes are never applied silently. Review each proposal first.</p><div class="stack">${props.map(p=>`<div class="item"><span class="eyebrow">${esc(p.action_type)}</span><h3>${esc(p.title)}</h3><p>${esc(p.explanation||'')}</p><details><summary>Proposed payload</summary><pre style="white-space:pre-wrap">${esc(JSON.stringify(p.payload,null,2))}</pre></details><div class="actions" style="margin-top:10px"><button class="primary" data-proposal="${p.id}" data-decision="approve">Approve</button><button class="secondary" data-proposal="${p.id}" data-decision="reject">Reject</button></div></div>`).join('')||'<div class="empty">No pending proposals.</div>'}</div></div></div>`;setTimeout(()=>{let box=$('#aiMessages');if(box)box.scrollTop=box.scrollHeight},0)}
 bind()
}
function workPackageCard(t){let unlocked=taskUnlocked(t),gate=gatePass(t),proof=proofStatus(t),files=state.task_attachments.filter(x=>x.task_id===t.id),checks=Array.isArray(t.checklist)?t.checklist:[],pct=taskCompletion(t);return `<article class="item taskCard ${unlocked?'':'lockedCard'}" data-priority="${esc(t.priority)}" data-status="${esc(t.status)}"><div class="rowtop"><div><span class="eyebrow">${esc(t.work_type||'GENERAL')} · ${esc(t.source_id||'')}</span><h3>${esc(t.title)}</h3><div class="sub">${esc(t.stage)} · ${esc(t.owner_name||'Unassigned')}</div></div>${buttons('tasks',t.id)}</div>${unlocked?(gate?'<div class="gatePass">All required proof is present. This package may be completed.</div>':'<div class="lockedBanner">Unlocked, but completion is blocked until every proof requirement passes.</div>'):'<div class="lockedBanner">Locked: complete all prerequisite work packages first.</div>'}<div class="badges"><span class="badge">${esc(t.status)}</span><span class="badge">${esc(t.priority)}</span><span class="badge">${esc(t.difficulty||'Medium')} difficulty</span><span class="badge">${esc(t.estimated_hours||'?')} hr</span></div><div class="progressText"><span>Verified progress</span><b>${pct}%</b></div><div class="progress"><i style="width:${pct}%"></i></div>
${section('Objective',t.objective)}${section('Background',t.background)}${section('Prerequisites',t.prerequisites)}${section('Safety',t.safety_notes)}${section('Procedure',t.procedure)}${section('Acceptance criteria',t.acceptance_criteria)}${section('Deliverables',t.deliverables)}${section('Test procedure',t.test_procedure)}${section('Results',t.results)}${section('Lessons learned',t.lessons_learned)}
${checks.length?`<div class="wpSection"><h4>Checklist</h4><div class="checklist">${checks.map((c,i)=>`<label class="check"><input type="checkbox" data-check="${t.id}" data-index="${i}" ${c.done?'checked':''} ${unlocked?'':'disabled'}><span>${esc(c.text)}</span></label>`).join('')}</div></div>`:''}
<div class="wpSection"><h4>Required proof</h4><div class="proofGrid">${proof.map(p=>`<div class="proofBox ${p.pass?'pass':'fail'}"><b>${esc(p.label)}</b><div class="sub">${p.count}/${p.min||1} uploaded</div><label class="secondary uploadLabel" style="margin-top:7px">Upload<input hidden type="file" multiple data-upload="${t.id}" data-proof="${esc(p.category)}"></label></div>`).join('')||'<div class="empty">No proof rules defined.</div>'}</div></div>
<div class="wpSection"><h4>Documents and files</h4><label class="secondary uploadLabel">Upload Word, Excel, PDF, CAD, code, photos, video, or data<input hidden type="file" multiple data-upload="${t.id}"></label><div class="attachmentList">${files.map(attachmentRow).join('')||'<div class="sub">No attachments yet.</div>'}</div></div>
<div class="actions" style="margin-top:14px"><button class="primary" data-complete="${t.id}" ${gate?'':'disabled'}>${t.status==='Complete'?'Completed':'Complete work package'}</button></div></article>`}
function section(title,text){return text?`<div class="wpSection"><h4>${title}</h4><p style="white-space:pre-wrap">${esc(text)}</p></div>`:''}
function attachmentRow(a){return `<div class="attachment"><div><span class="fileType">${esc((a.extension||'FILE').toUpperCase())}</span> <b>${esc(a.file_name)}</b><div class="sub">${esc(a.proof_category||a.attachment_kind||'attachment')} · ${esc(a.version_label||'v1')}</div></div><button class="mini" data-download="${a.id}">Open</button></div>`}
async function attemptComplete(id){let t=state.tasks.find(x=>x.id===id);if(!taskUnlocked(t)){toast('Blocked: complete all prerequisites first.');return}let missing=proofStatus(t).filter(x=>!x.pass);if(missing.length){toast('Missing proof: '+missing.map(x=>x.label).join(', '));return}let incomplete=(Array.isArray(t.checklist)?t.checklist:[]).filter(x=>!x.done);if(incomplete.length){toast('Complete the checklist first.');return}if(!t.acceptance_criteria||!t.results){toast('Acceptance criteria and results must be documented.');return}await supabase.from('tasks').update({status:'Complete',progress:100,gate_status:'Passed',gate_message:'All proof, checklist, dependencies, criteria, and results verified.'}).eq('id',id);toast('Work package verified complete');await load()}
async function toggleChecklist(id,index,done){let t=state.tasks.find(x=>x.id===id);if(!taskUnlocked(t)){toast('This work package is locked.');return}let list=Array.isArray(t.checklist)?[...t.checklist]:[];if(!list[index])return;list[index]={...list[index],done};await supabase.from('tasks').update({checklist:list}).eq('id',id);await load()}
function chooseTemplate(){let z=$('#modal');z.innerHTML=`<div class="modalCard card"><div class="rowtop"><h3>Choose work-package template</h3><button id="x" class="icon">✕</button></div><div class="templateGrid">${Object.keys(templates).map(k=>`<div class="templateCard" data-template="${k}"><span class="eyebrow">${k.toUpperCase()}</span><h3>${k}</h3><p class="sub">${esc(templates[k].objective)}</p></div>`).join('')}</div></div>`;z.classList.remove('hidden');$('#x').onclick=()=>z.classList.add('hidden');$$('[data-template]').forEach(b=>b.onclick=()=>openForm('tasks',{work_type:b.dataset.template,...templates[b.dataset.template]}))}
function field(n,l,v='',type='text',full=false,opts=[]){if(type==='textarea')return `<div class="field full"><label>${l}</label><textarea name="${n}">${esc(v)}</textarea></div>`;if(type==='select')return `<div class="field ${full?'full':''}"><label>${l}</label><select name="${n}">${opts.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;return `<div class="field ${full?'full':''}"><label>${l}</label><input name="${n}" type="${type}" value="${esc(v)}"></div>`}

function openForm(t,o){
 modal={t,id:o.id};
 let h='';
 if(t==='parts'){
  h=
   field('part','Part name',o.part,'text',true)+
   field('source_id','BOM ID',o.source_id)+
   field('system','System',o.system)+
   field('stage','Stage',o.stage)+
   field('bike','Bike',o.bike||'Universal')+
   field('qty','Quantity',o.qty||1,'number')+
   field('unit_cost','Unit cost',o.unit_cost||0,'number')+
   field('status','Status',o.status||'Not Started','select',false,statusList)+
   `<div class="field"><label><input type="checkbox" name="owned" ${o.owned?'checked':''}> Owned</label></div>`+
   `<div class="field"><label><input type="checkbox" name="installed" ${o.installed?'checked':''}> Installed</label></div>`+
   `<div class="field"><label><input type="checkbox" name="tested" ${o.tested?'checked':''}> Tested</label></div>`+
   field('source_url','Source URL',o.source_url||'','url',true)+
   field('specification','Specification',o.specification,'textarea')+
   field('notes','Notes',o.notes,'textarea');
 }else if(t==='tasks'){
  let checklist=(Array.isArray(o.checklist)?o.checklist:[]).map(x=>x.text).join('\n'),
      deps=depsFor(o.id||'').map(d=>d.depends_on_task_id),
      all=state.tasks.filter(x=>x.id!==o.id);
  h=
   field('title','Work package title',o.title,'text',true)+
   field('source_id','ID',o.source_id)+
   field('work_type','Type',o.work_type||'General','select',false,Object.keys(templates))+
   field('stage','Stage',o.stage||stageOrder[0],'select',false,stageOrder)+
   field('priority','Priority',o.priority||'Medium','select',false,['Critical','High','Medium','Low'])+
   field('difficulty','Difficulty',o.difficulty||'Medium','select',false,['Easy','Medium','Hard','Expert'])+
   field('risk_level','Risk',o.risk_level||'Medium','select',false,['Low','Medium','High','Critical'])+
   field('estimated_hours','Estimated hours',o.estimated_hours||'','number')+
   field('owner_name','Owner',o.owner_name||'Matthew')+
   field('target_date','Target date',o.target_date||'','date')+
   field('objective','Objective',o.objective,'textarea')+
   field('background','Background',o.background,'textarea')+
   field('prerequisites','Prerequisites',o.prerequisites,'textarea')+
   field('safety_notes','Safety notes',o.safety_notes,'textarea')+
   field('procedure','Step-by-step procedure',o.procedure,'textarea')+
   field('acceptance_criteria','Acceptance criteria / definition of done',o.acceptance_criteria,'textarea')+
   field('deliverables','Deliverables',o.deliverables,'textarea')+
   field('test_procedure','Test procedure',o.test_procedure,'textarea')+
   field('results','Measured results',o.results,'textarea')+
   field('lessons_learned','Lessons learned',o.lessons_learned,'textarea')+
   field('checklist_text','Checklist, one item per line',checklist,'textarea')+
   `<div class="field full"><label>Dependencies</label><select name="dependencies" multiple size="7">${all.map(x=>`<option value="${x.id}" ${deps.includes(x.id)?'selected':''}>${esc(x.source_id||'')} ${esc(x.title)}</option>`).join('')}</select></div>`;
 }else{
  toast('Editing this record type is not available yet.');
  return;
 }
 let z=$('#modal');
 z.innerHTML=`<div class="modalCard card"><div class="rowtop"><h3>${o.id?'Edit':'Create'} ${t==='parts'?'part':'work package'}</h3><button id="x" class="icon">✕</button></div><form id="form"><div class="formgrid">${h}</div><div class="formactions"><button type="button" id="cancel" class="secondary">Cancel</button><button class="primary">Save</button></div></form></div>`;
 z.classList.remove('hidden');
 $('#x').onclick=$('#cancel').onclick=()=>z.classList.add('hidden');
 $('#form').onsubmit=saveForm
}

async function saveForm(e){
 e.preventDefault();
 let f=new FormData(e.target),r=Object.fromEntries(f.entries());
 r.user_id=uid();

 if(modal.t==='parts'){
  r.qty=+r.qty||1;
  r.unit_cost=+r.unit_cost||0;
  r.owned=f.has('owned');
  r.installed=f.has('installed');
  r.tested=f.has('tested');
  let result=modal.id
   ? await supabase.from('parts').update(r).eq('id',modal.id).select().single()
   : await supabase.from('parts').insert(r).select().single();
  if(result.error){toast(result.error.message);return}
  $('#modal').classList.add('hidden');
  toast('Part saved');
  await load();
  return;
 }

 let depIds=f.getAll('dependencies');
 delete r.dependencies;
 r.estimated_hours=r.estimated_hours?+r.estimated_hours:null;
 r.checklist=(r.checklist_text||'').split('\n').map(x=>x.trim()).filter(Boolean).map(text=>({text,done:false}));
 delete r.checklist_text;
 let template=templates[r.work_type]||templates.General;
 if(!modal.id)r.proof_rules=template.proof_rules;
 let result=modal.id
  ? await supabase.from('tasks').update(r).eq('id',modal.id).select().single()
  : await supabase.from('tasks').insert(r).select().single();
 if(result.error){toast(result.error.message);return}
 let taskId=result.data.id;
 await supabase.from('task_dependencies').delete().eq('task_id',taskId);
 for(let d of depIds)await supabase.from('task_dependencies').insert({user_id:uid(),task_id:taskId,depends_on_task_id:d});
 $('#modal').classList.add('hidden');
 await load()
}
async function uploadAttachment(taskId,files,proofCategory=''){for(let file of files){let safe=`${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`,path=`${uid()}/tasks/${taskId}/files/${safe}`,extension=ext(file.name);let{error}=await supabase.storage.from('project-media').upload(path,file);if(error){toast(error.message);continue}await supabase.from('task_attachments').insert({user_id:uid(),task_id:taskId,storage_path:path,file_name:file.name,extension,mime_type:file.type,file_size:file.size,attachment_kind:kind(extension),proof_category:proofCategory||null,version_label:'v1'})}toast('Files uploaded');await load()}
function kind(e){if(['doc','docx','pdf','md','txt'].includes(e))return'document';if(['xls','xlsx','csv'].includes(e))return'spreadsheet';if(['step','stp','sldprt','sldasm','stl','dxf','dwg','iges','igs','f3d'].includes(e))return'cad';if(['ino','cpp','c','h','py','js','ts','json'].includes(e))return'code';if(['jpg','jpeg','png','heic','webp','tif','tiff'].includes(e))return'image';if(['mp4','mov','webm'].includes(e))return'video';return'other'}
async function downloadAttachment(id){let a=state.task_attachments.find(x=>x.id===id);if(!a)return;let{data,error}=await supabase.storage.from('project-media').createSignedUrl(a.storage_path,3600,{download:a.file_name});if(error)toast(error.message);else window.open(data.signedUrl,'_blank')}
async function loadAttachmentThumbs(){}
async function applyRecommendedOrder(){let ordered=[...state.tasks].sort((a,b)=>stageRank(a.stage)-stageRank(b.stage)||(a.source_id||'').localeCompare(b.source_id||''));for(let i=0;i<ordered.length;i++)await supabase.from('tasks').update({sort_order:i+1}).eq('id',ordered[i].id);toast('Roadmap reordered');await load()}
function inferTemplate(task){let s=(task.title+' '+task.stage+' '+task.notes).toLowerCase();if(/cad|bracket|mount|enclosure|mechanical|harness/.test(s))return /cad|design/.test(s)?'CAD':'Mechanical';if(/software|implement|app|firmware|decoder|parser|logger|algorithm|display/.test(s))return'Software';if(/suspension|string-pot|travel|motion-ratio/.test(s))return'Suspension';if(/research|define|requirements|architecture|survey/.test(s))return'Research';if(/power|esp32|imu|adc|can|k-line|gnss|interface|sensor/.test(s))return'Electronics';return'General'}
async function seedStarter(){if(!confirm('Refresh workbook and apply structured work-package templates?'))return;let d=await fetch('/starter-project.json').then(r=>r.json());let roadmap=[...d.roadmap].sort((a,b)=>stageRank(String(a.Stage||''))-stageRank(String(b.Stage||''))||String(a.ID||'').localeCompare(String(b.ID||'')));for(let i=0;i<roadmap.length;i++){let x=roadmap[i],title=String(x['Task / Step']||''),type=inferTemplate({title,stage:String(x.Stage||''),notes:String(x.Notes||'')}),tpl=templates[type],rec={user_id:uid(),source_id:String(x.ID||''),title,stage:String(x.Stage||''),bike:'Universal',priority:String(x.Priority||''),status:String(x.Status||'Not Started'),notes:String(x.Notes||x['Deliverable / Exit Criteria']||''),sort_order:i+1,owner_name:'Matthew',progress:x.Status==='Complete'?100:0,work_type:type,objective:tpl.objective,background:tpl.background,prerequisites:tpl.prerequisites,safety_notes:tpl.safety_notes,procedure:tpl.procedure,acceptance_criteria:tpl.acceptance_criteria,deliverables:tpl.deliverables,test_procedure:tpl.test_procedure,proof_rules:tpl.proof_rules,gate_status:'Locked'};let old=state.tasks.find(z=>z.source_id===rec.source_id);old?await supabase.from('tasks').update({...rec,checklist:old.checklist||[],results:old.results,lessons_learned:old.lessons_learned,progress:old.progress||rec.progress}).eq('id',old.id):await supabase.from('tasks').insert(rec)}toast('Structured work packages applied');await load()}



function renderPCBTab(p,tab){
 if(tab==='overview'){
  let pins=(state.pcb_pins||[]).filter(x=>x.pcb_project_id===p.id),conflicts=pins.filter(x=>x.conflict_status&&x.conflict_status!=='Open'&&x.conflict_status!=='Clear');
  return `<div class="two"><div class="card"><div class="rowtop"><h3>Architecture</h3></div><div class="pcbBlockDiagram">
   <div class="pcbNode main">ESP32-S3</div><div class="pcbNode">L9637D<br><small>Honda K-line</small></div><div class="pcbNode">MCP2562<br><small>BMW CAN</small></div>
   <div class="pcbNode">External ADC<br><small>Suspension</small></div><div class="pcbNode">ICM-42688-P<br><small>IMU</small></div><div class="pcbNode">u-blox M10<br><small>GNSS</small></div>
   <div class="pcbNode">microSD</div><div class="pcbNode">Nextion / RS-485</div><div class="pcbNode">Automotive Power</div>
  </div></div>
  <div class="card"><h3>Design checks</h3><div class="pcbCheck ${conflicts.length?'bad':'good'}"><b>Pin conflicts</b><span>${conflicts.length}</span></div><div class="pcbCheck good"><b>CAN termination</b><span>Do not populate on-bike</span></div><div class="pcbCheck good"><b>K-line TX disable</b><span>Required</span></div><div class="pcbCheck good"><b>Reverse polarity</b><span>Required</span></div><div class="pcbCheck good"><b>Load-dump TVS</b><span>Required</span></div></div></div>
  <div class="card" style="margin-top:14px"><h3>Board goals</h3><p>${esc(p.notes||'Universal read-only logger with protected automotive power, K-line, CAN, analog suspension inputs, IMU, GNSS, SD storage, and display expansion.')}</p></div>`;
 }
 if(tab==='pins'){
  let rows=(state.pcb_pins||[]).filter(x=>x.pcb_project_id===p.id).sort((a,b)=>(a.sort_order||999)-(b.sort_order||999));
  return `<div class="section"><div><span class="eyebrow">ESP32-S3 ASSIGNMENTS</span><h3>Interactive Pin Map</h3></div><button class="primary" data-pcb-add="pcb_pins">Add pin</button></div>
  <div class="pcbPinGrid">${rows.map(x=>`<div class="pcbPin ${x.conflict_status==='Conflict'?'conflict':''}"><div><span class="pinLabel">${esc(x.gpio||x.pin_name)}</span><b>${esc(x.function||'Unassigned')}</b><small>${esc(x.peripheral||'')} · ${esc(x.voltage||'')}</small></div><div class="actions"><button class="mini" data-pcb-edit="pcb_pins:${x.id}">Edit</button><button class="mini" data-pcb-del="pcb_pins:${x.id}">Delete</button></div></div>`).join('')||'<div class="empty">No pins assigned.</div>'}</div>`;
 }
 if(tab==='connectors'){
  let rows=(state.pcb_connectors||[]).filter(x=>x.pcb_project_id===p.id);
  return `<div class="section"><div><span class="eyebrow">HARNESS INTERFACES</span><h3>Connectors</h3></div><button class="primary" data-pcb-add="pcb_connectors">Add connector</button></div><div class="grid">${rows.map(x=>`<div class="card"><div class="rowtop"><div><span class="eyebrow">${esc(x.bike||'Universal')}</span><h3>${esc(x.connector_name)}</h3></div><button class="mini" data-pcb-edit="pcb_connectors:${x.id}">Edit</button></div><p>${esc(x.purpose||'')}</p><div class="badges"><span class="badge">${esc(x.connector_type||'')}</span><span class="badge">${x.pin_count||'?'} pins</span></div><details><summary>Pinout</summary><pre style="white-space:pre-wrap">${esc(JSON.stringify(x.pinout||[],null,2))}</pre></details></div>`).join('')||'<div class="empty">No connectors.</div>'}</div>`;
 }
 if(tab==='components'){
  let rows=(state.pcb_components||[]).filter(x=>x.pcb_project_id===p.id);
  let total=rows.reduce((s,x)=>s+(+x.quantity||0)*((state.parts||[]).find(p=>p.id===x.bom_part_id)?.unit_cost||0),0);
  return `<div class="section"><div><span class="eyebrow">BOARD BOM</span><h3>Components</h3></div><button class="primary" data-pcb-add="pcb_components">Add component</button></div><div class="metrics">${metric('Components',rows.length)}${metric('Linked BOM',rows.filter(x=>x.bom_part_id).length)}${metric('Estimated linked cost',money(total))}${metric('Ready',rows.filter(x=>x.status==='Ready').length)}</div><div class="stack">${rows.map(x=>`<div class="item"><div class="rowtop"><div><h3>${esc(x.reference||'')} ${esc(x.value||x.manufacturer_part||'')}</h3><div class="sub">${esc(x.category||'')} · ${esc(x.footprint||'')}</div></div><div class="actions"><button class="mini" data-pcb-edit="pcb_components:${x.id}">Edit</button><button class="mini" data-pcb-del="pcb_components:${x.id}">Delete</button></div></div><div class="badges"><span class="badge">Qty ${x.quantity||1}</span><span class="badge">${esc(x.status||'Planned')}</span>${x.bom_part_id?'<span class="badge ok">BOM linked</span>':''}</div><p>${esc(x.notes||'')}</p></div>`).join('')||'<div class="empty">No board components.</div>'}</div>`;
 }
 if(tab==='revisions'){
  let rows=(state.pcb_revisions||[]).filter(x=>x.pcb_project_id===p.id);
  return `<div class="section"><div><span class="eyebrow">REVISION CONTROL</span><h3>Board Revisions</h3></div><button class="primary" data-pcb-add="pcb_revisions">Add revision</button></div><div class="timeline">${rows.map(x=>`<div class="timelineItem card"><div class="rowtop"><div><span class="eyebrow">${esc(x.status)}</span><h3>${esc(x.revision)}</h3></div><button class="mini" data-pcb-edit="pcb_revisions:${x.id}">Edit</button></div><p>${esc(x.summary||'')}</p><div class="sub">${new Date(x.created_at).toLocaleString()}</div></div>`).join('')||'<div class="empty">No revisions.</div>'}</div>`;
 }
 return '';
}
async function pcbInsert(table,record){
 const {data,error}=await supabase.from(table).insert(record).select().single();
 if(error)throw new Error(`${table}: ${error.message}`);
 return data
}
async function seedPCBRevA(){
 try{
 if(!confirm('Create the Rev A starter PCB project, pin plan, connectors, and components?'))return;
 let existing=(state.pcb_projects||[]).find(x=>x.name==='Universal Motorcycle Data Board');
 let project=existing;
 if(!project){
  project=await pcbInsert('pcb_projects',{user_id:uid(),name:'Universal Motorcycle Data Board',revision:'Rev A',status:'Planning',description:'Read-only universal motorcycle data acquisition PCB for the CRF450RL and 2009 F800GS.',board_width_mm:100,board_height_mm:75,layer_count:4,notes:'ESP32-S3 core with protected automotive input, Honda K-line, BMW CAN, suspension ADC, IMU, GNSS, microSD, Nextion/display, and expansion I/O.'});
 }
 localStorage.setItem('pcbProjectId',project.id);
 if(!(state.pcb_pins||[]).some(x=>x.pcb_project_id===project.id)){
  let pins=[
   ['K-line RX','TBD','Honda diagnostic receive','UART','3.3 V','J2','Input',1],
   ['K-line TX','TBD','Honda diagnostic transmit','UART','3.3 V','J2','Output',2],
   ['CAN RX','TBD','BMW CAN receive','TWAI','3.3 V','J3','Input',3],
   ['CAN TX','TBD','BMW CAN transmit/listen control','TWAI','3.3 V','J3','Output',4],
   ['GNSS RX/TX','TBD','u-blox M10','UART','3.3 V','J6','Bidirectional',5],
   ['Nextion RX/TX','TBD','Display link','UART','Protected','J9','Bidirectional',6],
   ['SPI SCLK','TBD','Shared SPI clock','SPI','3.3 V','Internal','Output',7],
   ['SPI MOSI','TBD','Shared SPI MOSI','SPI','3.3 V','Internal','Output',8],
   ['SPI MISO','TBD','Shared SPI MISO','SPI','3.3 V','Internal','Input',9],
   ['microSD CS','TBD','Storage select','GPIO','3.3 V','Internal','Output',10],
   ['IMU CS','TBD','IMU select','GPIO','3.3 V','Internal','Output',11],
   ['ADC CS','TBD','External ADC select','GPIO','3.3 V','Internal','Output',12],
   ['ADC DRDY','TBD','ADC data ready','GPIO','3.3 V','Internal','Input',13],
   ['Front wheel','TBD','Front pulse input','PCNT','Protected','J5','Input',14],
   ['Rear wheel','TBD','Rear pulse input','PCNT','Protected','J5','Input',15],
   ['Ignition sense','TBD','Key-on detection','GPIO/ADC','Protected','J1','Input',16],
   ['Battery sense','TBD','12 V measurement','ADC','0-3.3 V','J1','Input',17],
   ['Mode button','TBD','User input','GPIO','3.3 V','J8','Input',18]
  ];
  for(let p of pins)await pcbInsert('pcb_pins',{user_id:uid(),pcb_project_id:project.id,pin_name:p[0],gpio:p[1],function:p[2],peripheral:p[3],voltage:p[4],connector:p[5],direction:p[6],sort_order:p[7]});
 }
 if(!(state.pcb_connectors||[]).some(x=>x.pcb_project_id===project.id)){
  let conns=[
   ['J1 Power','Deutsch DTM 4','Protected 12 V power and ignition sense',4,'Universal'],
   ['J2 Honda K-line','Honda 4-pin Y harness','CRF450RL diagnostic/PV3 pass-through',4,'CRF450RL'],
   ['J3 BMW CAN','BMW DWA pass-through','F800GS receive-only CAN access',4,'F800GS'],
   ['J4 Suspension','Deutsch DTM 6','Front/rear string-pot excitation and signals',6,'Universal'],
   ['J5 Wheel Speed','Deutsch DTM 4','Front and rear Hall sensors',4,'Universal'],
   ['J6 GNSS','JST-GH 4','u-blox M10 UART and power',4,'Universal'],
   ['J8 Expansion','Deutsch DTM 8','Buttons, clutch, shift sensor, spare I/O',8,'Universal'],
   ['J9 Display','JST-GH 4','Nextion UART and power',4,'Universal']
  ];
  for(let c of conns)await pcbInsert('pcb_connectors',{user_id:uid(),pcb_project_id:project.id,connector_name:c[0],connector_type:c[1],purpose:c[2],pin_count:c[3],bike:c[4],pinout:[]});
 }
 if(!(state.pcb_components||[]).some(x=>x.pcb_project_id===project.id)){
  let comps=[
   ['U1','ESP32-S3-WROOM-1','Controller','ESP32-S3-WROOM-1-N8R8','Module',1],
   ['U2','L9637D','K-line','L9637D','SO-8',1],
   ['U3','MCP2562','CAN','MCP2562-E/SN','SOIC-8',1],
   ['U4','ICM-42688-P','IMU','ICM-42688-P','LGA',1],
   ['U5','External ADC','Analog','TBD 16-bit multi-channel','TBD',1],
   ['U6','5 V Buck','Power','Automotive buck regulator','TBD',1],
   ['U7','3.3 V LDO','Power','Low-noise regulator','TBD',1],
   ['J10','microSD','Storage','Push-push microSD socket','MicroSD',1],
   ['D1','Load-dump TVS','Protection','Automotive TVS','SMCJ',1],
   ['Q1','Reverse-polarity MOSFET','Protection','P-channel / ideal diode','Power package',1]
  ];
  for(let c of comps)await pcbInsert('pcb_components',{user_id:uid(),pcb_project_id:project.id,reference:c[0],value:c[1],category:c[2],manufacturer_part:c[3],footprint:c[4],quantity:c[5],status:'Planned'});
 }
 if(!(state.pcb_revisions||[]).some(x=>x.pcb_project_id===project.id)){
  await pcbInsert('pcb_revisions',{user_id:uid(),pcb_project_id:project.id,revision:'Rev A0',status:'Planning',summary:'Initial architecture, connector plan, component list, and unresolved ESP32 pin assignments.'});
 }
 toast('Rev A starter loaded');await load();view='pcb';render()
 }catch(error){console.error(error);toast('PCB starter error: '+error.message);alert('PCB starter could not finish: '+error.message)}
}
function openPCBForm(table,obj){
 let pId=localStorage.getItem('pcbProjectId')||(state.pcb_projects||[])[0]?.id||'',h='';
 if(table==='pcb_projects')h=field('name','Board name',obj.name,'text',true)+field('revision','Revision',obj.revision||'Rev A')+field('status','Status',obj.status||'Planning')+field('board_width_mm','Width mm',obj.board_width_mm||100,'number')+field('board_height_mm','Height mm',obj.board_height_mm||75,'number')+field('layer_count','Layers',obj.layer_count||4,'number')+field('description','Description',obj.description,'textarea')+field('notes','Design goals and notes',obj.notes,'textarea');
 if(table==='pcb_pins')h=field('pin_name','Pin label',obj.pin_name,'text',true)+field('gpio','GPIO',obj.gpio||'TBD')+field('function','Function',obj.function,'text',true)+field('peripheral','Peripheral',obj.peripheral)+field('voltage','Voltage',obj.voltage)+field('connector','Connector',obj.connector)+field('direction','Direction',obj.direction)+field('conflict_status','Conflict status',obj.conflict_status||'Open')+field('notes','Notes',obj.notes,'textarea');
 if(table==='pcb_connectors')h=field('connector_name','Connector name',obj.connector_name,'text',true)+field('connector_type','Type',obj.connector_type)+field('pin_count','Pin count',obj.pin_count||4,'number')+field('bike','Bike',obj.bike||'Universal')+field('purpose','Purpose',obj.purpose,'textarea')+field('pinout_text','Pinout JSON',JSON.stringify(obj.pinout||[],null,2),'textarea')+field('notes','Notes',obj.notes,'textarea');
 if(table==='pcb_components'){let opts=(state.parts||[]).map(x=>`<option value="${x.id}" ${x.id===obj.bom_part_id?'selected':''}>${esc(x.source_id||'')} ${esc(x.part)}</option>`).join('');h=field('reference','Reference',obj.reference)+field('value','Value',obj.value,'text',true)+field('category','Category',obj.category)+field('manufacturer_part','Manufacturer part',obj.manufacturer_part,'text',true)+field('footprint','Footprint',obj.footprint)+field('quantity','Quantity',obj.quantity||1,'number')+field('status','Status',obj.status||'Planned')+`<div class="field full"><label>Linked BOM item</label><select name="bom_part_id"><option value="">None</option>${opts}</select></div>`+field('notes','Notes',obj.notes,'textarea')}
 if(table==='pcb_revisions')h=field('revision','Revision',obj.revision||'Rev A1')+field('status','Status',obj.status||'Draft')+field('summary','Summary',obj.summary,'textarea');
 let z=$('#modal');z.innerHTML=`<div class="modalCard card"><div class="rowtop"><h3>${obj.id?'Edit':'Add'} ${table.replace('pcb_','')}</h3><button id="pcbClose" class="icon">✕</button></div><form id="pcbForm"><div class="formgrid">${h}</div><div class="formactions"><button type="button" id="pcbCancel" class="secondary">Cancel</button><button class="primary">Save</button></div></form></div>`;z.classList.remove('hidden');$('#pcbClose').onclick=$('#pcbCancel').onclick=()=>z.classList.add('hidden');$('#pcbForm').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target),r=Object.fromEntries(f.entries());r.user_id=uid();if(table!=='pcb_projects')r.pcb_project_id=obj.pcb_project_id||pId;if(table==='pcb_projects'){r.board_width_mm=+r.board_width_mm||null;r.board_height_mm=+r.board_height_mm||null;r.layer_count=+r.layer_count||4}if(table==='pcb_pins')r.required=true;if(table==='pcb_connectors'){r.pin_count=+r.pin_count||0;try{r.pinout=JSON.parse(r.pinout_text||'[]')}catch{toast('Pinout JSON is invalid');return}delete r.pinout_text}if(table==='pcb_components'){r.quantity=+r.quantity||1;r.bom_part_id=r.bom_part_id||null}let q=obj.id?supabase.from(table).update(r).eq('id',obj.id):supabase.from(table).insert(r);let{error}=await q;if(error)toast(error.message);else{z.classList.add('hidden');await load()}}}
async function deletePCBRecord(v){
 let[t,id]=v.split(':');
 let isProject=t==='pcb_projects';
 let message=isProject
  ? 'Delete this entire PCB project? This also removes its pins, connectors, components, and revision history. This cannot be undone.'
  : 'Delete this PCB record? This cannot be undone.';
 if(!confirm(message))return;
 let{error}=await supabase.from(t).delete().eq('id',id);
 if(error){toast(error.message);return}
 if(isProject){
  localStorage.removeItem('pcbProjectId');
  localStorage.removeItem('pcbTab');
  toast('PCB project deleted');
 }else toast('PCB record deleted');
 await load()
}

async function garageUpload(files,proofCategory){
 const taskId=localStorage.getItem('garageTaskId');if(!taskId){toast('Choose an active work package first.');return}
 await uploadAttachment(taskId,files,proofCategory)
}
function startGarageDictation(){
 const area=$('#garageNoteText'),status=$('#speechStatus');
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SpeechRecognition){status.textContent='Voice dictation is not available in this browser. Use the iPhone keyboard microphone or type the note.';area.focus();return}
 const rec=new SpeechRecognition();rec.lang='en-US';rec.interimResults=true;rec.continuous=false;
 status.textContent='Listening…';
 rec.onresult=e=>{let text=[...e.results].map(r=>r[0].transcript).join(' ');area.value=(area.value+' '+text).trim()};
 rec.onerror=e=>status.textContent='Dictation error: '+e.error;
 rec.onend=()=>status.textContent='Dictation stopped. Review and save the note.';
 rec.start()
}
async function saveGarageNote(){
 const taskId=localStorage.getItem('garageTaskId'),task=state.tasks.find(x=>x.id===taskId),body=$('#garageNoteText')?.value.trim();
 if(!taskId||!body){toast('Choose a package and enter a note.');return}
 const {error}=await supabase.from('notes').insert({user_id:uid(),title:`Garage update — ${task.source_id||task.title}`,category:'Garage Progress',bike:task.bike||'Universal',body:`Work package: ${task.title}\n\n${body}`});
 if(error){toast(error.message);return}
 $('#garageNoteText').value='';toast('Garage note saved');await load()
}
function garageAskAI(){
 const taskId=localStorage.getItem('garageTaskId');if(!taskId){toast('Choose a work package first.');return}
 view='ai';shell();render();
 setTimeout(()=>{let sel=$('#aiForm select[name="taskId"]'),msg=$('#aiForm textarea[name="message"]');if(sel)sel.value=taskId;if(msg)msg.value='Review this work package using its checklist, proof requirements, attachments, results, and dependencies. Tell me exactly what to do next and what evidence is still missing.';msg?.focus()},80)
}
function showTelemetryPanel(){
 let z=$('#modal');z.innerHTML=`<div class="modalCard card telemetryPanel"><div class="rowtop"><div><span class="eyebrow">LIVE DEVICE STATUS</span><h2>Telemetry</h2></div><button id="telemetryClose" class="icon">✕</button></div>
 <div class="telemetryStatus"><span class="telemetryDot offline"></span><div><b>No motorcycle data device connected</b><div class="sub">The cloud app is ready, but the ESP32 upload/live-stream endpoint has not been added yet.</div></div></div>
 <div class="telemetryTiles"><div><span>RPM</span><b>—</b></div><div><span>Speed</span><b>—</b></div><div><span>Coolant</span><b>—</b></div><div><span>Suspension</span><b>—</b></div></div>
 <p class="muted">This panel is intentionally honest: it will show real values only after the ESP32 telemetry backend is connected.</p>
 <button id="telemetryTask" class="primary">Open telemetry development tasks</button></div>`;
 z.classList.remove('hidden');$('#telemetryClose').onclick=()=>z.classList.add('hidden');$('#telemetryTask').onclick=()=>{z.classList.add('hidden');view='roadmap';shell();render()}
}

async function sendAI(e){
 e.preventDefault();let f=new FormData(e.target),message=String(f.get('message')||'').trim(),taskId=String(f.get('taskId')||'')||null;if(!message)return;
 let btn=e.submitter;btn.disabled=true;btn.textContent='Thinking…';
 const {data,error}=await supabase.functions.invoke('ai-chat',{body:{message,taskId}});
 btn.disabled=false;btn.textContent='Ask AI';
 if(error){toast(error.message||'AI request failed');return}
 if(data?.error){toast(data.error);return}
 e.target.reset();toast(data?.proposals?.length?`AI replied with ${data.proposals.length} proposal(s)`:'AI replied');await load()
}
async function reviewProposal(id,decision){
 const label=decision==='approve'?'Apply this AI proposal?':'Reject this AI proposal?';if(!confirm(label))return;
 const {data,error}=await supabase.functions.invoke('ai-apply-proposal',{body:{proposalId:id,decision}});
 if(error){toast(error.message||'Proposal action failed');return}
 if(data?.error){toast(data.error);return}
 toast(decision==='approve'?'Proposal applied':'Proposal rejected');await load()
}
async function init(){let{data}=await supabase.auth.getSession();session=data.session;supabase.auth.onAuthStateChange((_e,s)=>{session=s;if(!s)auth();else{shell();load()}});if(!session)auth();else{shell();await load()}}
init();
