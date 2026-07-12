const APP_NAME='Marty Moto Party';

function setText(el,value){
 if(el&&el.textContent!==value)el.textContent=value;
}

function applyBranding(){
 if(document.title!==APP_NAME)document.title=APP_NAME;
 setText(document.querySelector('.brandCopy h1'),APP_NAME);
 setText(document.querySelector('.brandCopy p'),'Moto mission control');
 setText(document.querySelector('.navIntro strong'),APP_NAME);
 setText(document.querySelector('.navFooter b'),APP_NAME);
 const authEyebrow=document.querySelector('main .eyebrow');
 if(authEyebrow&&authEyebrow.textContent.includes('MOTO ENGINEERING'))setText(authEyebrow,APP_NAME.toUpperCase());
}

function addRideCenterOverview(){
 const main=document.querySelector('#main');
 const overview=document.querySelector('[data-v="dashboard"].active');
 if(!main||!overview||main.querySelector('#rideOverviewCard'))return;
 const cards=main.querySelector('.two');
 if(!cards)return;
 const ridesText=document.querySelector('[data-v="rides"]')?.textContent||'Ride Log';
 const card=document.createElement('section');
 card.id='rideOverviewCard';
 card.className='card rideOverviewCard';
 card.innerHTML=`<div class="rowtop"><div><span class="eyebrow">RIDE CENTER</span><h3>Record, review, and manage every ride</h3><p>Launch the phone sensor logger, review recent rides, and jump directly into the ride workflow.</p></div><span class="badge">LIVE</span></div><div class="rideOverviewGrid"><div class="rideOverviewMetric"><span>Status</span><strong>Ready</strong></div><div class="rideOverviewMetric"><span>Logger</span><strong>GPS + IMU</strong></div><div class="rideOverviewMetric"><span>History</span><strong>${ridesText.trim()}</strong></div></div><div class="actions"><button id="openRideCenterOverview" class="primary">Open Ride Center</button><button id="openRideLogOverview" class="secondary">View Ride Log</button></div>`;
 cards.parentNode.insertBefore(card,cards);
 card.querySelector('#openRideCenterOverview').onclick=()=>document.querySelector('#rideCenterNav')?.click();
 card.querySelector('#openRideLogOverview').onclick=()=>document.querySelector('[data-v="rides"]')?.click();
}

let queued=false;
function refresh(){
 if(queued)return;
 queued=true;
 requestAnimationFrame(()=>{
  queued=false;
  applyBranding();
  addRideCenterOverview();
 });
}

const appRoot=document.querySelector('#app');
if(appRoot)new MutationObserver(refresh).observe(appRoot,{childList:true,subtree:true});
refresh();
