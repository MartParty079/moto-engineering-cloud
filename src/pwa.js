const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(console.error))}

function installGuide(){
  document.querySelector('#iosInstallOverlay')?.remove();
  const overlay=document.createElement('div');
  overlay.id='iosInstallOverlay';
  overlay.innerHTML=`<section class="iosInstallCard"><button class="iosInstallClose" aria-label="Close">×</button><img src="/app-icon.svg" alt="MotoCloud icon"><div><small>INSTALL ON IPHONE</small><h2>Add MotoCloud to your Home Screen</h2><ol><li>Tap the <b>Share</b> button in Safari.</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. MotoCloud will launch like a normal app.</li></ol><p>Your sign-in remains available and the app shell can open when connectivity is weak.</p></div></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.iosInstallClose').onclick=()=>overlay.remove();
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
}

function addInstallButton(){
  if(isStandalone||document.querySelector('#installMotoCloud'))return;
  const button=document.createElement('button');
  button.id='installMotoCloud';
  button.type='button';
  button.innerHTML='<span>⇩</span><b>Install App</b>';
  button.onclick=installGuide;
  document.body.appendChild(button);
}

const observer=new MutationObserver(addInstallButton);
observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:false});
addInstallButton();

if(isIOS&&!isStandalone&&!localStorage.getItem('motocloud-install-seen')){
  setTimeout(()=>{installGuide();localStorage.setItem('motocloud-install-seen','1')},1800);
}
