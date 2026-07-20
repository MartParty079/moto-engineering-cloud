const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];
let polishQueued = false;
let observedNav = null;
let navObserver = null;

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
    bar.innerHTML = `<button data-go="home"><b>⌂</b><span>Home</span></button><button data-go="ride"><b>◉</b><span>Ride</span></button><button data-go="adv"><b>△</b><span>Adventure</span></button><button data-go="garage"><b>◇</b><span>Garage</span></button><button data-go="menu"><b>☰</b><span>Menu</span></button>`;
    document.body.appendChild(bar);
  }
  if(bar.dataset.bound === '1') return;
  bar.dataset.bound = '1';
  bar.onclick = event => {
    const button = event.target.closest('button');
    if(!button) return;
    const go = button.dataset.go;
    setBottomActive(go);
    if(go === 'home') document.querySelector('[data-v="dashboard"]')?.click();
    if(go === 'ride') $('#rideCenterNav')?.click();
    if(go === 'adv') $('#adventureNav')?.click();
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
polish();