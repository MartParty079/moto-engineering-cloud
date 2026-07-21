const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const PWA_BUILD='adventure-route-manager-v21';
const SHELL_CACHE='motocloud-shell-v21';

async function clearLegacyMotoCaches(){
  if(!('caches' in window))return;
  try{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('motocloud-shell-')&&key!==SHELL_CACHE).map(key=>caches.delete(key)));
  }catch(error){console.warn('Legacy cache cleanup skipped',error)}
}
if(localStorage.getItem('motoPwaBuild')!==PWA_BUILD){localStorage.setItem('motoPwaBuild',PWA_BUILD);void clearLegacyMotoCaches()}
if('serviceWorker' in navigator){window.addEventListener('load',async()=>{try{const registration=await navigator.serviceWorker.register('/sw.js?v=21',{updateViaCache:'none'});await registration.update();registration.addEventListener('updatefound',()=>{const worker=registration.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='activated')console.info('Moto Mission Adventure controls and route manager update installed.')})})}catch(error){console.error(error)}})}
function installGuide(){document.querySelector('#iosInstallOverlay')?.remove();const overlay=document.createElement('div');overlay.id='iosInstallOverlay';overlay.innerHTML=`<section class="iosInstallCard"><button class="iosInstallClose" aria-label="Close">×</button><img src="/app-icon.svg" alt="Moto Mission icon"><div><small>INSTALL ON IPHONE</small><h2>Add Moto Mission to your Home Screen</h2><ol><li>Tap the <b>Share</b> button in Safari.</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. Moto Mission will launch like a normal app.</li></ol><p>Your sign-in remains available and the app shell can open when connectivity is weak.</p></div></section>`;document.body.appendChild(overlay);overlay.querySelector('.iosInstallClose').onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove()}}
function addInstallButton(){if(isStandalone||document.querySelector('#installMotoCloud'))return;const button=document.createElement('button');button.id='installMotoCloud';button.type='button';button.innerHTML='<span>⇩</span><b>Install App</b>';button.onclick=installGuide;document.body.appendChild(button)}
const observer=new MutationObserver(addInstallButton);observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:false});addInstallButton();
if(isIOS&&!isStandalone&&!localStorage.getItem('motocloud-install-seen'))setTimeout(()=>{installGuide();localStorage.setItem('motocloud-install-seen','1')},1800);
