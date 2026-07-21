const RIDE_DASH_SELECTOR='#rideDashOverlay';
const RIDE_OS_PAGE_SELECTOR='[data-fixed-ride-os-page="true"]';
const RIDE_OS_TAB_SELECTOR='[data-fixed-ride-os-tab="true"]';

function currentPageIndex(pages){
  return Math.max(0,Math.round(pages.scrollLeft/Math.max(1,pages.clientWidth)));
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
      pageList[index]?.scrollIntoView({behavior:'smooth',inline:'start'});
    };
  });
  if(dots){
    const active=Math.min(pageList.length-1,currentPageIndex(pages));
    dots.innerHTML=pageList.map((_,index)=>`<i class="${index===active?'active':''}"></i>`).join('');
    tabList.forEach((tab,index)=>tab.classList.toggle('active',index===active));
  }
  if(page===pages.children[0]&&pages.scrollLeft<pages.clientWidth*.5){
    tabs.firstElementChild?.classList.add('active');
  }
}

function ensureRideOsPage(overlay=document.querySelector(RIDE_DASH_SELECTOR)){
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
  }

  let tab=tabs.querySelector(RIDE_OS_TAB_SELECTOR);
  if(!tab){
    tab=document.createElement('button');
    tab.type='button';
    tab.dataset.fixedRideOsTab='true';
    tab.textContent='RIDE DASH';
    tabs.insertBefore(tab,tabs.firstElementChild);
  }

  const host=page.querySelector('[data-ride-os-host]');
  if(host){
    host.appendChild(ribbon);
    host.appendChild(hero);
  }

  overlay.dataset.rideOsDedicatedPage='ready';
  syncRideNavigation(overlay,page);
  syncRideStatus(overlay);
  return page;
}

function scheduleRideOsPage(overlay){
  const target=overlay||document.querySelector(RIDE_DASH_SELECTOR);
  if(ensureRideOsPage(target))return;
  requestAnimationFrame(()=>ensureRideOsPage(target));
}

window.addEventListener('moto-ride-dash-rendered',event=>scheduleRideOsPage(event.detail?.overlay));
window.addEventListener('moto-ride-dash-opened',event=>scheduleRideOsPage(event.detail?.overlay));
window.addEventListener('moto-ride-dash-refreshed',event=>{
  const overlay=event.detail?.overlay||document.querySelector(RIDE_DASH_SELECTOR);
  syncRideStatus(overlay);
});
window.addEventListener('moto-ride-dash-closed',event=>{
  if(event.detail?.overlay)delete event.detail.overlay.dataset.rideOsDedicatedPage;
});

new MutationObserver(mutations=>{if(mutations.some(mutation=>[...mutation.addedNodes].some(node=>node.nodeType===1&&(node.matches?.(RIDE_DASH_SELECTOR)||node.querySelector?.(RIDE_DASH_SELECTOR)))))scheduleRideOsPage()}).observe(document.body,{childList:true,subtree:false});
scheduleRideOsPage();
