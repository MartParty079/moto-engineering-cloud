const STORAGE_KEY='motoCurrentView';
let restoring=false;
let restoreQueued=false;
let lastApplied='';

function rememberView(target){
  const button=target?.closest?.('[data-v]');
  if(!button?.dataset?.v)return;
  const next=button.dataset.v;
  lastApplied=next;
  localStorage.setItem(STORAGE_KEY,next);
  if(location.hash!==`#${next}`)history.replaceState(null,'',`#${next}`);
}

function restoreView(){
  if(restoring)return;
  const nav=document.querySelector('#nav');
  if(!nav)return;
  const requested=(location.hash||'').replace(/^#/,'')||localStorage.getItem(STORAGE_KEY);
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

const observer=new MutationObserver(queueRestore);
observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:false});
queueRestore();
