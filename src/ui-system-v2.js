const MIN_VISIBLE_MS=180;
const MAX_VISIBLE_MS=1600;
let shownAt=0;
let awaitingContent=false;
let hideTimer=null;
let failsafeTimer=null;
let themePinned=false;

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

function refresh(){
  ensureThemeLast();
  regroupNavigation();
  if(!document.querySelector('#main')){
    hideSkeleton();
    return;
  }
  hideSkeletonWhenReady();
}

document.addEventListener('click',event=>{
  if(event.target.closest('#nav [data-v]'))showSkeleton();
},true);

const observer=new MutationObserver(()=>queueMicrotask(refresh));
observer.observe(document.body,{childList:true,subtree:true});

window.MotoPageSkeleton={show:showSkeleton,hide:hideSkeleton};
window.addEventListener('moto-page-loading',showSkeleton);
window.addEventListener('moto-page-ready',hideSkeleton);
window.addEventListener('pageshow',()=>setTimeout(hideSkeleton,0));
window.addEventListener('error',hideSkeleton);
window.addEventListener('unhandledrejection',hideSkeleton);

ensureThemeLast();
regroupNavigation();
hideSkeleton();
