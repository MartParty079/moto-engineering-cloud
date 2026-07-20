const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];
let polishQueued = false;
let observedNav = null;
let navObserver = null;

function loadRideExperience(){
  if(!document.querySelector('link[data-ride-experience-v2]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/src/ride-experience-v2.css?v=1';
    link.dataset.rideExperienceV2='1';
    document.head.appendChild(link);
  }
  if(!document.querySelector('style[data-ride-navigation-v2]')){
    const style=document.createElement('style');
    style.dataset.rideNavigationV2='1';
    style.textContent=`.motoBottomNav button>svg{display:block;width:18px;height:18px;margin:0 auto 2px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.motoBottomNav button.active>svg{color:var(--accent,#f4512c)}@media(max-width:720px){#rideDashOverlay[data-ride-experience="v2"][data-ride-active="true"] .rideXSmartStrip{display:flex;overflow-x:auto;scrollbar-width:none;padding:3px 4px}#rideDashOverlay[data-ride-experience="v2"][data-ride-active="true"] .rideXSmartStrip::-webkit-scrollbar{display:none}#rideDashOverlay[data-ride-experience="v2"][data-ride-active="true"] .rideXSmartStrip button{flex:0 0 132px;min-height:40px}#rideDashOverlay[data-ride-experience="v2"][data-ride-active="true"] .rideXCompliance{flex-basis:155px}#rideDashOverlay[data-ride-experience="v2"][data-ride-active="false"] #rideXModeButton{display:none!important}}`;
    document.head.appendChild(style);
  }
  if(!window.__motoRideExperienceLoading){
    window.__motoRideExperienceLoading=Promise.all([
      import('./adventure-integration-v2.js?v=1'),
      import('./ride-experience-v2.js?v=1')
    ]).catch(error=>console.error('Ride OS experience failed to load',error));
  }
}

const svg=path=>`<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const navIcon={
  home:svg('<path d="m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z"/>'),
  ride:svg('<circle cx="12" cy="12" r="9"/><path d="M12 12 17 7M6 16h12"/>'),
  maps:svg('<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>'),
  garage:svg('<path d="m3 10 9-7 9 7v11H3V10Zm4 11v-8h10v8M8 16h8"/>'),
  menu:svg('<path d="M4 6h16M4 12h16M4 18h16"/>')
};

function cleanRideTabs(){
  const tabs = $('.ridePageTabs');
  if(!tabs) return;
  const allowed = ['RIDE','WEATHER','TOOLS'];
  const seen = new Set();
  [...tabs.querySelectorAll('button')].forEach(button => {
    const label = button.textContent.trim().toUpperCase();
    if(!allowed.includes(label) || seen.has(label)) button.remove();
    else{ seen.add(label); button.textContent = label; }
  });
  tabs.querySelectorAll('button').forEach((button,index) => { button.dataset.ridePage = String(index); });
  tabs.style.gridTemplateColumns = 'none';
}

function cleanNav(){
  const nav = $('#nav');
  if(!nav) return;
  const ride = $('#rideCenterNav');
  const legacyDash = $('#rideDashNav');
  if(ride && legacyDash && ride !== legacyDash) legacyDash.remove();

  const seen = new Set();
  [...nav.querySelectorAll('button')].forEach(button => {
    const key = (button.id || button.textContent.trim()).toLowerCase().replace(/\s+/g,' ');
    if(seen.has(key) && !button.dataset.v) button.remove();
    else seen.add(key);
  });

  const adventure = $('#adventureNav');
  if(adventure){
    const label=adventure.querySelector('span:nth-of-type(2)');
    if(label) label.textContent='Maps & Routes';
    const badge=adventure.querySelector('em');
    if(badge) badge.textContent='GPX';
    const group = [...nav.querySelectorAll('.navGroup')].find(item => item.querySelector('.navLabel')?.textContent.trim() === 'Operations');
    if(group && !group.contains(adventure)) group.appendChild(adventure);
  }

  if(nav.dataset.touchPolished !== '1'){
    nav.dataset.touchPolished = '1';
    nav.addEventListener('touchmove',event => event.stopPropagation(),{passive:true});
  }
}

function setBottomActive(name){
  const bar = $('#motoBottomNav');
  if(!bar) return;
  bar.querySelectorAll('button').forEach(button => button.classList.toggle('active',button.dataset.go === name));
}

function bottomNav(){
  let bar = $('#motoBottomNav');
  if(!bar){
    bar = document.createElement('nav');
    bar.id = 'motoBottomNav';
    bar.className = 'motoBottomNav';
    bar.innerHTML = `<button data-go="home">${navIcon.home}<span>Home</span></button><button data-go="ride">${navIcon.ride}<span>Ride</span></button><button data-go="maps">${navIcon.maps}<span>Maps</span></button><button data-go="garage">${navIcon.garage}<span>Garage</span></button><button data-go="menu">${navIcon.menu}<span>Menu</span></button>`;
    document.body.appendChild(bar);
  }else if(!bar.querySelector('[data-go="maps"]')){
    const old=bar.querySelector('[data-go="adv"]');
    if(old){old.dataset.go='maps';old.innerHTML=`${navIcon.maps}<span>Maps</span>`;}
  }
  if(bar.dataset.bound === '2') return;
  bar.dataset.bound = '2';
  bar.onclick = event => {
    const button = event.target.closest('button');
    if(!button) return;
    const go = button.dataset.go;
    setBottomActive(go);
    if(go === 'home') document.querySelector('[data-v="dashboard"]')?.click();
    if(go === 'ride') $('#rideCenterNav')?.click();
    if(go === 'maps'){
      if(window.MotoAdventure?.openMap) window.MotoAdventure.openMap();
      else $('#adventureNav')?.click();
    }
    if(go === 'garage') document.querySelector('[data-v="garage"]')?.click();
    if(go === 'menu') $('#nav')?.classList.toggle('open');
  };
}

function closeMenuOnChoice(){
  const nav = $('#nav');
  if(!nav || nav.dataset.polished === '1') return;
  nav.dataset.polished = '1';
  nav.addEventListener('click',event => {
    if(event.target.closest('button') && innerWidth < 781 && !event.target.closest('#adventureNav')) setTimeout(() => nav.classList.remove('open'),80);
  });
}

function observeCurrentNav(){
  const nav = $('#nav');
  if(!nav || nav === observedNav) return;
  navObserver?.disconnect();
  observedNav = nav;
  navObserver = new MutationObserver(schedulePolish);
  navObserver.observe(nav,{childList:true,subtree:true});
}

function polish(){
  loadRideExperience();
  cleanRideTabs();
  cleanNav();
  bottomNav();
  closeMenuOnChoice();
  observeCurrentNav();
}

function schedulePolish(){
  if(polishQueued) return;
  polishQueued = true;
  requestAnimationFrame(() => {
    polishQueued = false;
    polish();
  });
}

const appRoot = document.querySelector('#app');
if(appRoot) new MutationObserver(schedulePolish).observe(appRoot,{childList:true,subtree:false});
new MutationObserver(schedulePolish).observe(document.body,{childList:true,subtree:false});
window.addEventListener('moto-ride-dash-opened',() => setBottomActive('ride'));
window.addEventListener('moto-ride-dash-closed',schedulePolish);
window.addEventListener('moto-route-update',()=>setBottomActive(document.querySelector('#adventureOverlay')?'maps':'ride'));
polish();
