const APP_NAME='Marty Moto Party';

function applyBranding(){
 document.title=APP_NAME;
 const brand=document.querySelector('.brandCopy h1');if(brand)brand.textContent=APP_NAME;
 const brandSub=document.querySelector('.brandCopy p');if(brandSub)brandSub.textContent='Moto mission control';
 const intro=document.querySelector('.navIntro strong');if(intro)intro.textContent=APP_NAME;
 const footer=document.querySelector('.navFooter b');if(footer)footer.textContent=APP_NAME;
 const authEyebrow=document.querySelector('main .eyebrow');if(authEyebrow&&authEyebrow.textContent.includes('MOTO ENGINEERING'))authEyebrow.textContent=APP_NAME.toUpperCase();
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
function refresh(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;applyBranding();addRideCenterOverview()})}
new MutationObserver(refresh).observe(document.documentElement,{childList:true,subtree:true});
refresh();
