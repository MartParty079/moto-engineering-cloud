const RIDE_DASH_SELECTOR='#rideDashOverlay';
const RIDE_OS_PAGE_SELECTOR='[data-fixed-ride-os-page="true"]';
const RIDE_OS_TAB_SELECTOR='[data-fixed-ride-os-tab="true"]';

let lastRideActive=false;
let restoreTimer=0;

function currentPageIndex(pages){
  return Math.max(0,Math.round(pages.scrollLeft/Math.max(1,pages.clientWidth)));
}

function rideIsActive(overlay){
  const control=overlay?.querySelector('#dashRideControl');
  const state=window.MotoRide?.getState?.()||{};
  return Boolean(
    control?.classList.contains('recording')||
    control?.classList.contains('starting')||
    state.active||
    state.starting
  );
}

function rideOsPageMarkup(){
  return `<div class="rideV3DedicatedShell">
    <div class="rideV3DedicatedHost" data-ride-os-host></div>
    <div class="rideV3DedicatedStatus" data-ride-os-status>
      <span class="rideV3DedicatedDot" aria-hidden="true"></span>
      <div><small data-ride-os-status-label>SYSTEM READY</small><strong data-ride-os-status-bike>Select a motorcycle to begin</strong></div>
    </div>
  </div>`;
}

function syncRideStatus(overlay){
  if(!overlay?.isConnected)return;
  const source=overlay.querySelector('#dashRideControl');
  const target=overlay.querySelector('[data-ride-os-status]');
  if(!source||!target)return;
  const sourceStatus=overlay.querySelector('#dashRideStatus');
  const sourceBike=overlay.querySelector('#dashRideBike');
  const sourceDot=overlay.querySelector('#dashRideDot');
  const targetStatus=target.querySelector('[data-ride-os-status-label]');
  const targetBike=target.querySelector('[data-ride-os-status-bike]');
  const targetDot=target.querySelector('.rideV3DedicatedDot');
  if(targetStatus&&sourceStatus)targetStatus.textContent=sourceStatus.textContent;
  if(targetBike&&sourceBike)targetBike.textContent=sourceBike.textContent;
  target.classList.toggle('recording',source.classList.contains('recording'));
  target.classList.toggle('starting',source.classList.contains('starting'));
  targetDot?.classList.toggle('live',Boolean(sourceDot?.classList.contains('live')));
}

function selectRideOsPage(overlay,behavior='auto'){
  if(!overlay?.isConnected)return false;
  const pages=overlay.querySelector('#dashPages');
  const tabs=overlay.querySelector('#dashTabs');
  const page=pages?.querySelector(RIDE_OS_PAGE_SELECTOR);
  const tab=tabs?.querySelector(RIDE_OS_TAB_SELECTOR);
  if(!pages||!page)return false;

  const left=page.offsetLeft;
  if(Math.abs(pages.scrollLeft-left)>2){
    try{pages.scrollTo({left,top:0,behavior});}
    catch{pages.scrollLeft=left;}
  }
  page.scrollTop=0;
  [...(tabs?.children||[])].forEach(item=>item.classList.toggle('active',item===tab));
  overlay.dataset.rideOsPageVisible='true';
  return true;
}

function syncRideNavigation(overlay,page){
  const pages=overlay.querySelector('#dashPages');
  const tabs=overlay.querySelector('#dashTabs');
  const dots=overlay.querySelector('#dashDots');
  if(!pages||!tabs)return;
  const pageList=[...pages.children];
  const tabList=[...tabs.children];
  pageList.forEach((item,index)=>{item.dataset.page=String(index)});
  tabList.forEach((tab,index)=>{
    tab.dataset.page=String(index);
    tab.onclick=()=>{
      if(tab.matches(RIDE_OS_TAB_SELECTOR)){
        selectRideOsPage(overlay,'smooth');
        return;
      }
      pageList[index]?.scrollIntoView({behavior:'smooth',inline:'start'});
    };
  });
  if(dots){
    const active=Math.min(pageList.length-1,currentPageIndex(pages));
    dots.innerHTML=pageList.map((_,index)=>`<i class="${index===active?'active':''}"></i>`).join('');
    tabList.forEach((tab,index)=>tab.classList.toggle('active',index===active));
  }
}

function ensureRideOsPage(overlay=document.querySelector(RIDE_DASH_SELECTOR),options={}){
  if(!overlay?.isConnected)return null;
  const pages=overlay.querySelector('#dashPages');
  const tabs=overlay.querySelector('#dashTabs');
  const ribbon=overlay.querySelector('.rideV3ModeRibbon');
  const hero=overlay.querySelector('#rideV3Hero');
  if(!pages||!tabs||!ribbon||!hero)return null;

  let page=pages.querySelector(RIDE_OS_PAGE_SELECTOR);
  if(!page){
    page=document.createElement('section');
    page.className='dashPage rideV3DedicatedPage';
    page.dataset.fixedRideOsPage='true';
    page.setAttribute('aria-label','Ride Dash');
    page.innerHTML=rideOsPageMarkup();
    pages.insertBefore(page,pages.firstElementChild);
  }else if(page!==pages.firstElementChild){
    pages.insertBefore(page,pages.firstElementChild);
  }

  let tab=tabs.querySelector(RIDE_OS_TAB_SELECTOR);
  if(!tab){
    tab=document.createElement('button');
    tab.type='button';
    tab.dataset.fixedRideOsTab='true';
    tab.textContent='RIDE DASH';
    tabs.insertBefore(tab,tabs.firstElementChild);
  }else if(tab!==tabs.firstElementChild){
    tabs.insertBefore(tab,tabs.firstElementChild);
  }

  const host=page.querySelector('[data-ride-os-host]');
  if(host){
    if(ribbon.parentElement!==host)host.appendChild(ribbon);
    if(hero.parentElement!==host)host.appendChild(hero);
  }

  overlay.dataset.rideOsDedicatedPage='ready';
  syncRideNavigation(overlay,page);
  syncRideStatus(overlay);

  if(options.select||rideIsActive(overlay)){
    requestAnimationFrame(()=>selectRideOsPage(overlay,'auto'));
  }
  return page;
}

function scheduleRideOsPage(overlay,options={}){
  const target=overlay||document.querySelector(RIDE_DASH_SELECTOR);
  clearTimeout(restoreTimer);
  let attempts=0;
  const retry=()=>{
    attempts+=1;
    if(ensureRideOsPage(target,options))return;
    if(attempts<24)restoreTimer=setTimeout(retry,25);
  };
  retry();
}

window.addEventListener('moto-ride-dash-rendered',event=>scheduleRideOsPage(event.detail?.overlay,{select:rideIsActive(event.detail?.overlay)}));
window.addEventListener('moto-ride-dash-opened',event=>scheduleRideOsPage(event.detail?.overlay,{select:true}));
window.addEventListener('moto-ride-dash-refreshed',event=>{
  const overlay=event.detail?.overlay||document.querySelector(RIDE_DASH_SELECTOR);
  syncRideStatus(overlay);
  const active=rideIsActive(overlay);
  if(active&&!lastRideActive)selectRideOsPage(overlay,'auto');
  lastRideActive=active;
});
window.addEventListener('moto-ride-start-progress',event=>{
  const phase=event.detail?.phase;
  if(['permissions','starting','ready'].includes(phase))scheduleRideOsPage(document.querySelector(RIDE_DASH_SELECTOR),{select:true});
});
window.addEventListener('moto-ride-state',event=>{
  const active=Boolean(event.detail?.active||event.detail?.starting);
  if(active&&!lastRideActive)scheduleRideOsPage(document.querySelector(RIDE_DASH_SELECTOR),{select:true});
  lastRideActive=active;
});
window.addEventListener('moto-ride-dash-closed',event=>{
  if(event.detail?.overlay){
    delete event.detail.overlay.dataset.rideOsDedicatedPage;
    delete event.detail.overlay.dataset.rideOsPageVisible;
  }
  lastRideActive=false;
});

new MutationObserver(mutations=>{
  if(mutations.some(mutation=>[...mutation.addedNodes].some(node=>node.nodeType===1&&(node.matches?.(RIDE_DASH_SELECTOR)||node.querySelector?.(RIDE_DASH_SELECTOR)))))scheduleRideOsPage(null,{select:true});
}).observe(document.body,{childList:true,subtree:false});

scheduleRideOsPage(null,{select:true});