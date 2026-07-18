const $=q=>document.querySelector(q);
let queued=false;

function closeMenu(){
  const nav=$('#nav');
  nav?.classList.remove('open');
  document.body.classList.remove('menu-open');
  document.querySelector('.menuButton')?.setAttribute('aria-expanded','false');
}

function removeAdminBadge(){
  document.querySelectorAll('#accessRoleBadge,.accessRoleBadge').forEach(el=>el.remove());
}

function regroupParts(){
  const nav=$('#nav');
  const parts=nav?.querySelector('[data-v="parts"]');
  if(!nav||!parts)return;
  const engineeringButton=nav.querySelector('[data-v="engineering"]');
  const roadmapButton=nav.querySelector('[data-v="roadmap"]');
  const pcbButton=nav.querySelector('[data-v="pcb"]');
  const anchor=engineeringButton||roadmapButton||pcbButton;
  const group=anchor?.closest('.navGroup');
  if(!group)return;
  const label=group.querySelector('.navLabel');
  if(label&&label.textContent.trim()!=='ENGINEERING')label.textContent='ENGINEERING';
  if(parts.parentElement!==group){
    if(engineeringButton)engineeringButton.after(parts);
    else if(roadmapButton)roadmapButton.after(parts);
    else group.appendChild(parts);
  }
}

function syncActiveView(){
  const active=$('#nav [data-v].active');
  const view=active?.dataset.v||'';
  if(view&&document.body.dataset.activeView!==view)document.body.dataset.activeView=view;
  else if(!view&&document.body.dataset.activeView)delete document.body.dataset.activeView;
  document.body.classList.toggle('garage-view',view==='garage');
}

function openAdventureFromRideCenter(){
  closeMenu();
  document.querySelector('#rideCenterOverlay')?.remove();
  requestAnimationFrame(()=>{
    const adventure=$('#adventureNav');
    if(adventure){adventure.click();return}
    document.querySelector('.motoBottomNav button:nth-child(3)')?.click();
  });
}

function addRideCenterAdventureShortcut(){
  const actions=$('#rideCenterOverlay .rideHeaderActions');
  if(!actions||$('#rideCenterAdventure'))return;
  const button=document.createElement('button');
  button.id='rideCenterAdventure';
  button.type='button';
  button.className='rideCenterAdventure';
  button.textContent='ADV MAP';
  button.setAttribute('aria-label','Open Adventure map');
  button.onclick=openAdventureFromRideCenter;
  actions.prepend(button);
}

function sync(){
  removeAdminBadge();
  regroupParts();
  syncActiveView();
  addRideCenterAdventureShortcut();
  if($('#adventureOverlay'))closeMenu();
}

function queueSync(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;sync()});
}

document.addEventListener('click',event=>{
  const trigger=event.target.closest('#adventureNav,[data-open-adventure],.motoBottomNav button');
  if(trigger&&(trigger.id==='adventureNav'||/adventure/i.test(trigger.textContent||'')))closeMenu();
  queueSync();
},true);

const observer=new MutationObserver(queueSync);
observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
window.addEventListener('pageshow',queueSync);
queueSync();