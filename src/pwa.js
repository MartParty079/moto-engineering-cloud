import './ride-dash-visual-fix.js?v=1';
import './recorder-scroll-v43.css';
import './recorder-road-context-v45.js?v=2';
import './recorder-phase4-v44.js?v=1';

const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const PWA_BUILD='ai-removed-speed-limits-v46';
const ACTIVE_CACHES=['motocloud-app-v46','motocloud-runtime-v46','motocloud-images-v46'];

function loadOfflineCache(){
  if(!document.querySelector('link[data-offline-cache]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/src/offline-cache.css?v=1';link.dataset.offlineCache='1';document.head.appendChild(link)}
  import('/src/offline-cache.js?v=1').catch(error=>console.error('Offline cache module failed to load',error));
}
function loadIPhoneCleanup(){
  if(!isIOS||document.querySelector('link[data-iphone-ui-cleanup]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/src/iphone-ui-cleanup.css?v=1';link.dataset.iphoneUiCleanup='1';document.head.appendChild(link);
}
loadOfflineCache();loadIPhoneCleanup();
import('/src/ride-performance-guard.js?v=1').catch(error=>console.error('Ride visual stability module failed to load',error));
async function clearLegacyMotoCaches(){if(!('caches'in window))return;try{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('motocloud-')&&!ACTIVE_CACHES.includes(key)).map(key=>caches.delete(key)))}catch(error){console.warn('Legacy cache cleanup skipped',error)}}
if(localStorage.getItem('motoPwaBuild')!==PWA_BUILD)localStorage.setItem('motoPwaBuild',PWA_BUILD)
if('serviceWorker'in navigator){navigator.serviceWorker.addEventListener('controllerchange',()=>window.dispatchEvent(new CustomEvent('moto-app-cache-updated')));window.addEventListener('load',async()=>{try{const registration=await navigator.serviceWorker.register('/sw.js?v=46',{updateViaCache:'none'});await registration.update();registration.addEventListener('updatefound',()=>{const worker=registration.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='activated'){void clearLegacyMotoCaches();console.info('Moto Mission AI removal and speed-limit v46 installed.');window.dispatchEvent(new CustomEvent('moto-app-cache-updated'))}})});}catch(error){console.error(error)}})}
function installGuide(){document.querySelector('#iosInstallOverlay')?.remove();const overlay=document.createElement('div');overlay.id='iosInstallOverlay';overlay.innerHTML=`<section class="iosInstallCard"><button type="button" class="iosInstallClose" aria-label="Close">×</button><img src="/app-icon.svg" alt="Moto Mission icon"><div><small>INSTALL ON IPHONE</small><h2>Add Moto Mission to your Home Screen</h2><ol><li>Tap the <b>Share</b> button in Safari.</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ol></div></section>`;document.body.appendChild(overlay);overlay.querySelector('.iosInstallClose').onclick=()=>overlay.remove();overlay.onclick=event=>{if(event.target===overlay)overlay.remove()}}
function addInstallButton(){if(isStandalone||document.querySelector('#installMotoCloud'))return;const button=document.createElement('button');button.id='installMotoCloud';button.type='button';button.innerHTML='<span>⇩</span><b>Install App</b>';button.onclick=installGuide;document.body.appendChild(button)}
const observer=new MutationObserver(addInstallButton);observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:false});addInstallButton();
if(isIOS&&!isStandalone&&!localStorage.getItem('motocloud-install-seen'))setTimeout(()=>{installGuide();localStorage.setItem('motocloud-install-seen','1')},1800);