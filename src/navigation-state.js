const STORAGE_KEY='motoCurrentView';
let restoring=false;

function rememberView(target){
  const button=target?.closest?.('[data-v]');
  if(!button?.dataset?.v)return;
  localStorage.setItem(STORAGE_KEY,button.dataset.v);
  history.replaceState(null,'',`#${button.dataset.v}`);
}

function restoreView(){
  if(restoring)return;
  const nav=document.querySelector('#nav');
  if(!nav)return;
  const requested=(location.hash||'').replace(/^#/,'')||localStorage.getItem(STORAGE_KEY);
  if(!requested)return;
  const button=nav.querySelector(`[data-v="${CSS.escape(requested)}"]`);
  if(!button||button.hidden||button.classList.contains('active'))return;
  restoring=true;
  queueMicrotask(()=>{
    button.click();
    restoring=false;
  });
}

document.addEventListener('click',event=>rememberView(event.target),true);
window.addEventListener('hashchange',restoreView);

const observer=new MutationObserver(()=>queueMicrotask(restoreView));
observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
restoreView();
