const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const cachesInUse = ['motocloud-app-v50', 'motocloud-runtime-v50', 'motocloud-images-v50'];

async function clearOldCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('motocloud-') && !cachesInUse.includes(key)).map(key => caches.delete(key)));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js?v=50', { updateViaCache: 'none' });
      await registration.update();
      registration.addEventListener('updatefound', () => clearOldCaches());
    } catch (error) { console.error('App installation is unavailable.', error); }
  });
}

function showInstallGuide() {
  document.querySelector('#iosInstallOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'iosInstallOverlay';
  overlay.innerHTML = `<section class="iosInstallCard"><button type="button" class="iosInstallClose" aria-label="Close">×</button><div><h2>Add Moto Mission to your Home Screen</h2><ol><li>Tap Share in Safari.</li><li>Tap Add to Home Screen.</li><li>Tap Add.</li></ol></div></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('button').onclick = () => overlay.remove();
  overlay.onclick = event => { if (event.target === overlay) overlay.remove(); };
}

function addInstallButton() {
  if (standalone || !isIOS) return;
  const host = document.querySelector('.headerActions');
  if (!host || document.querySelector('#installMotoCloud')) return;
  const button = document.createElement('button');
  button.id = 'installMotoCloud';
  button.type = 'button';
  button.textContent = 'Install';
  button.onclick = showInstallGuide;
  host.insertBefore(button, host.lastElementChild);
}

new MutationObserver(addInstallButton).observe(document.querySelector('#app') || document.body, { childList: true });
addInstallButton();
