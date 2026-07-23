const VERSION='v39';
const APP_CACHE=`motocloud-app-${VERSION}`;
const RUNTIME_CACHE=`motocloud-runtime-${VERSION}`;
const IMAGE_CACHE=`motocloud-images-${VERSION}`;
const ACTIVE_CACHES=new Set([APP_CACHE,RUNTIME_CACHE,IMAGE_CACHE]);
const CORE_URLS=[
  '/',
  '/manifest.webmanifest',
  '/app-icon.svg',
  '/src/mobile-fix.css',
  '/src/access-control.css?v=3',
  '/src/access-bootstrap.css?v=2',
  '/src/pwa.css',
  '/src/ride-center.css?v=20',
  '/src/ride-safe-enhancements.css?v=10',
  '/src/adventure-mode.css?v=9',
  '/src/ride-hud.css?v=1',
  '/src/ride-analytics.css?v=1',
  '/src/adventure-tools.css?v=2',
  '/src/adventure-ride-control.css?v=2',
  '/src/ride-dashboard.css?v=4',
  '/src/ride-dashboard-compact.css?v=1',
  '/src/ride-dashboard-header-controls.css?v=4',
  '/src/ride-dashboard-map-page.css?v=3',
  '/src/ride-dashboard-themes.css?v=1',
  '/src/ride-experience-v2.css?v=2',
  '/src/ride-experience-hotfix.css?v=1',
  '/src/ride-os-v3.css?v=1',
  '/src/ride-os-v3-page.css?v=2',
  '/src/offline-cache.css?v=1',
  '/src/ride-picker-stability.css?v=1',
  '/src/ride-lean-bridge.css?v=1',
  '/src/adventure-ui-tweaks.css?v=1',
  '/src/ui-polish.css?v=1',
  '/src/motorcycle-profiles.css?v=3',
  '/src/marty-brand.css?v=1',
  '/src/site-audit.css?v=1',
  '/src/garage-health.css?v=7',
  '/src/garage-compact.css?v=3',
  '/src/ui-system-v2.css?v=2',
  '/src/adaptive-layout.css?v=1',
  '/src/mobile-workflow-fixes.css?v=7',
  '/src/garage-center.css?v=2',
  '/src/security-center.css?v=1',
  '/src/mobile-layout-hotfix.css?v=1',
  '/src/ride-dash-live-hotfix.css?v=1',
  '/src/ride-dash-visual-fix.css?v=1',
  '/src/app-interaction-stability.css?v=1',
  '/src/adaptive-layout.js?v=1',
  '/src/road-provider-default.js?v=1',
  '/src/main.js',
  '/src/navigation-state.js?v=1',
  '/src/cirkit-link.js',
  '/src/access-control.js?v=3',
  '/src/access-bootstrap.js?v=3',
  '/src/pwa.js?v=39',
  '/src/gps-shared.js?v=5',
  '/src/ios-motion-disable.js?v=1',
  '/src/startup-permissions.js?v=4',
  '/src/ride-center.js?v=22',
  '/src/ride-start-guard.js?v=3',
  '/src/provider-auth-fix.js?v=2',
  '/src/offline-cache.js?v=1',
  '/src/ride-safe-enhancements.js?v=13',
  '/src/iphone-recording-safe-mode.js?v=1',
  '/src/ride-lean-bridge.js?v=2',
  '/src/garage-observer-guard.js?v=2',
  '/src/garage-health.js?v=8',
  '/src/garage-compact.js?v=4',
  '/src/adventure-mode.js?v=10',
  '/src/adventure-heading-fix.js?v=2',
  '/src/ride-hud.js?v=1',
  '/src/ride-analytics.js?v=3',
  '/src/adventure-tools.js?v=2',
  '/src/adventure-ride-control.js?v=2',
  '/src/ride-dashboard.js?v=5',
  '/src/ride-dashboard-header-controls.js?v=4',
  '/src/ride-dashboard-map-page.js?v=5',
  '/src/adventure-ui-tweaks.js?v=1',
  '/src/bike-editor-fix.js',
  '/src/ride-log-bridge.js?v=4',
  '/src/ride-delete.js?v=1',
  '/src/motorcycle-profiles.js?v=3',
  '/src/marty-brand.js?v=2',
  '/src/ui-polish.js?v=4',
  '/src/ride-experience-safety.js?v=1',
  '/src/ride-os-v3.js?v=1',
  '/src/ride-os-v3-page.css?v=2',
  '/src/ride-os-v3-page.js?v=4',
  '/src/provider-dashboard.js?v=1',
  '/src/ui-system-v2.js?v=3',
  '/src/mobile-workflow-fixes.js?v=7',
  '/src/garage-center.js?v=2',
  '/src/security-center.js?v=1',
  '/src/security-admin-guard.js?v=1',
  '/src/mobile-layout-hotfix.js?v=1',
  '/src/ride-dash-visual-fix.js?v=1',
  '/src/ride-performance-guard.js?v=1',
  '/src/app-interaction-stability.js?v=1'
];

async function cacheCore(){
  const cache=await caches.open(APP_CACHE);
  await Promise.allSettled(CORE_URLS.map(async url=>{
    const response=await fetch(new Request(url,{cache:'reload'}));
    if(response.ok)await cache.put(url,response);
  }));
}

async function trimCache(name,maxEntries){
  const cache=await caches.open(name),keys=await cache.keys();
  if(keys.length<=maxEntries)return;
  await Promise.all(keys.slice(0,keys.length-maxEntries).map(key=>cache.delete(key)));
}

async function staleWhileRevalidate(request,event,cacheName=RUNTIME_CACHE){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request,{ignoreVary:true});
  const update=fetch(request).then(async response=>{
    if(response.ok){await cache.put(request,response.clone());await trimCache(cacheName,180)}
    return response;
  });
  event?.waitUntil(update.catch(()=>undefined));
  return cached||update;
}

async function cacheFirst(request,cacheName=IMAGE_CACHE){
  const cache=await caches.open(cacheName),cached=await cache.match(request,{ignoreVary:true});
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok){await cache.put(request,response.clone());await trimCache(cacheName,100)}
  return response;
}

async function navigationResponse(request){
  const cache=await caches.open(APP_CACHE);
  const cached=await cache.match('/');
  const network=fetch(request,{cache:'no-store'}).then(async response=>{
    if(response.ok)await cache.put('/',response.clone());
    return response;
  });
  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('navigation timeout')),2500));
  try{return await Promise.race([network,timeout])}
  catch{
    if(cached)return cached;
    try{return await network}catch{}
    return new Response('<!doctype html><title>Moto Mission Offline</title><main style="font-family:system-ui;background:#07090f;color:white;min-height:100vh;padding:40px"><h1>Moto Mission</h1><p>The app shell is not cached yet. Reconnect once, open the app, then try again.</p></main>',{headers:{'content-type':'text/html'}});
  }
}

self.addEventListener('install',event=>{event.waitUntil(cacheCore());self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('motocloud-')&&!ACTIVE_CACHES.has(key)).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==location.origin)return;
  if(url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){event.respondWith(navigationResponse(request));return}
  if(['script','style','worker'].includes(request.destination)){event.respondWith(staleWhileRevalidate(request,event));return}
  if(['image','font'].includes(request.destination)){event.respondWith(cacheFirst(request));return}
  if(url.pathname.startsWith('/src/')||url.pathname==='/manifest.webmanifest'||url.pathname==='/app-icon.svg'){event.respondWith(staleWhileRevalidate(request,event));return}
});
self.addEventListener('message',event=>{
  const type=event.data?.type;
  if(type==='PRECACHE_NOW')event.waitUntil(cacheCore());
  if(type==='CLEAR_RUNTIME_CACHE')event.waitUntil(Promise.all([caches.delete(RUNTIME_CACHE),caches.delete(IMAGE_CACHE)]));
  if(type==='SKIP_WAITING')self.skipWaiting();
});
