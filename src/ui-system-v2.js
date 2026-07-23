const MIN_VISIBLE_MS=120;
const MAX_VISIBLE_MS=1400;
let shownAt=0;
let awaitingContent=false;
let hideTimer=null;
let failsafeTimer=null;
let themePinned=false;
let refreshFrame=0;
let observedMain=null;
let mainObserver=null;

function ensureThemeLast(){
  if(themePinned)return;
  const link=document.querySelector('link[data-ui-system-v2]');
  if(link){document.head.appendChild(link);themePinned=true}
}

function skeletonMarkup(){
  return `<div id="pageSkeleton" aria-hidden="true"><div class="pageSkeletonInner">
    <div class="skeletonBlock skeletonEyebrow"></div>
    <div class="skeletonBlock skeletonTitle"></div>
    <div class="skeletonBlock skeletonCopy"></div>
    <div class="skeletonBlock skeletonCopy short"></div>
    <div class="skeletonMetrics">${Array.from({length:4},()=>'<div class="skeletonBlock skeletonMetric"></div>').join('')}</div>
    <div class="skeletonGrid">${Array.from({length:6},()=>'<div class="skeletonBlock skeletonCard"></div>').join('')}</div>
  </div></div>`;
}

function ensureSkeleton(){
  let overlay=document.querySelector('#pageSkeleton');
  if(!overlay){
    document.body.insertAdjacentHTML('beforeend',skeletonMarkup());
    overlay=document.querySelector('#pageSkeleton');
  }
  return overlay;
}

function hideSkeleton(){
  clearTimeout(hideTimer);
  clearTimeout(failsafeTimer);
  document.querySelector('#pageSkeleton')?.classList.remove('visible');
  awaitingContent=false;
}

function showSkeleton(){
  if(!document.querySelector('#main'))return;
  const overlay=ensureSkeleton();
  clearTimeout(hideTimer);
  clearTimeout(failsafeTimer);
  awaitingContent=true;
  shownAt=Date.now();
  overlay.classList.add('visible');
  failsafeTimer=setTimeout(hideSkeleton,MAX_VISIBLE_MS);
}

function hideSkeletonWhenReady(){
  if(!awaitingContent)return;
  const main=document.querySelector('#main');
  if(!main||!main.children.length)return;
  const remaining=Math.max(0,MIN_VISIBLE_MS-(Date.now()-shownAt));
  clearTimeout(hideTimer);
  hideTimer=setTimeout(hideSkeleton,remaining);
}

function regroupNavigation(){
  const nav=document.querySelector('#nav');
  if(!nav)return;
  const groups=[...nav.querySelectorAll('.navGroup')];
  const engineeringGroup=groups.find(group=>{
    const label=group.querySelector('.navLabel')?.textContent.trim();
    return label==='Build'||label==='Engineering';
  });
  const parts=nav.querySelector('[data-v="parts"]');
  if(!engineeringGroup||!parts)return;
  const label=engineeringGroup.querySelector('.navLabel');
  if(label)label.textContent='Engineering';
  if(parts.parentElement!==engineeringGroup){
    const engineeringButton=engineeringGroup.querySelector('[data-v="engineering"]');
    if(engineeringButton)engineeringButton.after(parts);else engineeringGroup.appendChild(parts);
  }
}

function observeMain(){
  const main=document.querySelector('#main');
  if(main===observedMain)return;
  mainObserver?.disconnect();
  observedMain=main;
  if(!main)return;
  mainObserver=new MutationObserver(scheduleRefresh);
  mainObserver.observe(main,{childList:true});
}

function refresh(){
  ensureThemeLast();
  regroupNavigation();
  observeMain();
  if(!document.querySelector('#main')){
    hideSkeleton();
    return;
  }
  hideSkeletonWhenReady();
}

function scheduleRefresh(){
  if(refreshFrame)return;
  refreshFrame=requestAnimationFrame(()=>{
    refreshFrame=0;
    refresh();
  });
}

/* Local page navigation renders synchronously. Do not flash a full-screen loader on every tap. */
document.addEventListener('click',event=>{
  if(event.target.closest('#nav [data-v]'))hideSkeleton();
},true);

const appRoot=document.querySelector('#app');
if(appRoot)new MutationObserver(scheduleRefresh).observe(appRoot,{childList:true});

window.MotoPageSkeleton={show:showSkeleton,hide:hideSkeleton};
window.addEventListener('moto-page-loading',showSkeleton);
window.addEventListener('moto-page-ready',hideSkeleton);
window.addEventListener('pageshow',()=>setTimeout(()=>{hideSkeleton();scheduleRefresh()},0));
window.addEventListener('error',hideSkeleton);
window.addEventListener('unhandledrejection',hideSkeleton);
window.addEventListener('pagehide',()=>mainObserver?.disconnect());

ensureThemeLast();
regroupNavigation();
observeMain();
hideSkeleton();
