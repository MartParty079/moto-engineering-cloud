const VERSION='v50';
const APP_CACHE=`motocloud-app-${VERSION}`;
const RUNTIME_CACHE=`motocloud-runtime-${VERSION}`;
const ACTIVE_CACHES=new Set([APP_CACHE,RUNTIME_CACHE]);
const CORE_URLS=['/','/manifest.webmanifest','/app-icon.svg'];

async function cacheCore(){
  const cache=await caches.open(APP_CACHE);
  await Promise.allSettled(CORE_URLS.map(async url=>{const response=await fetch(new Request(url,{cache:'reload'}));if(response.ok)await cache.put(url,response)}));
}

async function runtime(request,event){
  const cache=await caches.open(RUNTIME_CACHE);
  const cached=await cache.match(request,{ignoreVary:true});
  const update=fetch(request).then(async response=>{if(response.ok)await cache.put(request,response.clone());return response});
  event.waitUntil(update.catch(()=>undefined));
  return cached||update;
}

async function navigation(request){
  const cache=await caches.open(APP_CACHE);
  try{const response=await fetch(request,{cache:'no-store'});if(response.ok)await cache.put('/',response.clone());return response}
  catch{return await cache.match('/')||new Response('<!doctype html><title>Moto Mission Offline</title><main><h1>Moto Mission</h1><p>Reconnect once to cache the app.</p></main>',{headers:{'content-type':'text/html'}})}
}

self.addEventListener('install',event=>{event.waitUntil(cacheCore());self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('motocloud-')&&!ACTIVE_CACHES.has(key)).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){event.respondWith(navigation(request));return}
  if(['script','style','worker','image','font'].includes(request.destination)||url.pathname==='/manifest.webmanifest'){event.respondWith(runtime(request,event))}
});
self.addEventListener('message',event=>{if(event.data?.type==='PRECACHE_NOW')event.waitUntil(cacheCore());if(event.data?.type==='CLEAR_RUNTIME_CACHE')event.waitUntil(caches.delete(RUNTIME_CACHE));if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
