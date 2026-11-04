const canonical=view=>({routes:'dashboard',rides:'rideCenter',devices:'rideCenter'}[view]||view);
const STORAGE_KEY='motoCurrentView';
let restoring=false;
let restoreQueued=false;
let lastApplied='';

function rememberView(target){
  const button=target?.closest?.('[data-v]');
  if(!button?.dataset?.v || button.hidden || button.disabled)return;
  const next=canonical(button.dataset.v);
  lastApplied=next;
  localStorage.setItem(STORAGE_KEY,next);
  if(location.hash!==`#${next}`)history.replaceState(null,'',`#${next}`);
}

function restoreView(){
  if(restoring)return;
  const nav=document.querySelector('#nav');
  if(!nav)return;
  const legacy=(location.hash||'').replace(/^#/,'')||localStorage.getItem(STORAGE_KEY);
  const requested=canonical(legacy);
  if(legacy&&legacy!==requested){localStorage.setItem(STORAGE_KEY,requested);history.replaceState(null,'',`#${requested}`);window.MotoWorkspace?.navigate(legacy);return;}
  if(!requested)return;
  const button=nav.querySelector(`[data-v="${CSS.escape(requested)}"]`);
  if(!button||button.hidden||button.classList.contains('active')){
    if(button?.classList.contains('active'))lastApplied=requested;
    return;
  }
  if(lastApplied===requested&&document.querySelector(`[data-v="${CSS.escape(requested)}"].active`))return;
  restoring=true;
  requestAnimationFrame(()=>{
    try{
      const latest=location.hash.replace(/^#/,'')||localStorage.getItem(STORAGE_KEY);
      if(latest!==requested)return; // A newer rider choice supersedes a queued startup restore.
      const current=document.querySelector('#nav')?.querySelector(`[data-v="${CSS.escape(requested)}"]`);
      if(current&&!current.hidden&&!current.classList.contains('active'))current.click();
      lastApplied=requested;
    }finally{
      restoring=false;
    }
  });
}

function queueRestore(){
  if(restoreQueued)return;
  restoreQueued=true;
  requestAnimationFrame(()=>{
    restoreQueued=false;
    restoreView();
  });
}

document.addEventListener('click',event=>rememberView(event.target),true);
window.addEventListener('hashchange',queueRestore);

window.addEventListener('moto-page-ready',queueRestore);
window.addEventListener('moto-access-ready',queueRestore);
window.addEventListener('moto-workspace-change',event=>rememberView(document.querySelector(`#nav [data-v="${CSS.escape(event.detail.view)}"]`)));
queueRestore();
