import { supabase } from './supabase.js';

const DB_NAME='moto-mission-offline-v1';
const DB_VERSION=1;
const ROAD_STORE='road_context';
const PACK_STORE='route_packs';
const ACTIVE_ROUTE_KEY='motoOfflineActiveRouteId';
const FRESH_MS=24*60*60*1000;
const STALE_MS=30*24*60*60*1000;
const OFFLINE_FALLBACK_MS=180*24*60*60*1000;
const ROAD_RADIUS_MI=.18;
const nativeFetch=window.fetch.bind(window);

let databasePromise=null;
let latestFix=null;
let latestRoad=null;
let lastCachedAnnouncement=0;
let revalidating=new Map();

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const rad=value=>value*Math.PI/180;
const miles=(a,b)=>{if(!a||!b)return Infinity;const R=3958.7613,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),q=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q))};
const angleDiff=(a,b)=>!Number.isFinite(a)||!Number.isFinite(b)?0:Math.abs(((a-b+540)%360)-180);
const headingBucket=value=>Number.isFinite(value)?Math.round((((value%360)+360)%360)/45)%8:0;
const pointKey=(lat,lon,heading=0)=>`${Number(lat).toFixed(4)}:${Number(lon).toFixed(4)}:${headingBucket(heading)}`;
const esc=(value='')=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

function openDatabase(){
  if(databasePromise)return databasePromise;
  databasePromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(ROAD_STORE)){
        const store=db.createObjectStore(ROAD_STORE,{keyPath:'id'});
        store.createIndex('updatedAt','updatedAt');
        store.createIndex('routePackId','routePackId');
      }
      if(!db.objectStoreNames.contains(PACK_STORE)){
        const store=db.createObjectStore(PACK_STORE,{keyPath:'id'});
        store.createIndex('updatedAt','updatedAt');
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Offline database failed to open'));
  });
  return databasePromise;
}

async function transact(storeName,mode,operation){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(storeName,mode);
    const store=transaction.objectStore(storeName);
    let result;
    try{result=operation(store,transaction)}catch(error){reject(error);return}
    transaction.oncomplete=()=>resolve(result);
    transaction.onerror=()=>reject(transaction.error||new Error('Offline database transaction failed'));
    transaction.onabort=()=>reject(transaction.error||new Error('Offline database transaction aborted'));
  });
}

async function getAll(storeName){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const request=db.transaction(storeName,'readonly').objectStore(storeName).getAll();
    request.onsuccess=()=>resolve(request.result||[]);
    request.onerror=()=>reject(request.error);
  });
}

function apiLimitMph(payload){return finite(payload?.limit?.mph??payload?.limit?.display??payload?.limit_mph)}
function isPersistentSource(payload){
  if(payload?.cache?.persistent===false)return false;
  if(payload?.cache?.persistent===true)return true;
  return /openstreetmap|offline route|moto mission route pack/i.test(String(payload?.source||''));
}
function normalizeRoadPayload(payload={}){
  const mph=apiLimitMph(payload);
  return {
    ...payload,
    road:payload.road||null,
    limit:payload.limit||(Number.isFinite(mph)?{mph,display:`${Math.round(mph)} mph`}:null),
    source:payload.source||'Moto Mission road cache',
    confidence:payload.confidence||'Unknown',
    cache:{persistent:isPersistentSource(payload),maxAgeSeconds:Math.round(STALE_MS/1000),offlineFallbackSeconds:Math.round(OFFLINE_FALLBACK_MS/1000),...(payload.cache||{})}
  };
}

async function putRoadRecord({lat,lon,heading,payload,routePackId=null,observedAt=Date.now()}){
  if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon)))return false;
  const normalized=normalizeRoadPayload(payload);
  if(!routePackId&&!isPersistentSource(normalized))return false;
  const bearing=finite(normalized.bearing??heading);
  const id=`${routePackId||'live'}:${pointKey(lat,lon,bearing??0)}`;
  const row={
    id,lat:Number(lat),lon:Number(lon),heading:bearing,routePackId,
    payload:normalized,observedAt:Number(observedAt)||Date.now(),updatedAt:Date.now(),
    freshUntil:(Number(observedAt)||Date.now())+FRESH_MS,
    staleUntil:(Number(observedAt)||Date.now())+STALE_MS,
    expiresAt:(Number(observedAt)||Date.now())+OFFLINE_FALLBACK_MS
  };
  await transact(ROAD_STORE,'readwrite',store=>store.put(row));
  return true;
}

async function putRoadRecords(records,routePackId){
  const now=Date.now();
  await transact(ROAD_STORE,'readwrite',store=>{
    for(const record of records){
      if(!Number.isFinite(Number(record.lat))||!Number.isFinite(Number(record.lon)))continue;
      const payload=normalizeRoadPayload(record.payload||record);
      const heading=finite(record.heading??payload.bearing);
      store.put({
        id:`${routePackId}:${pointKey(record.lat,record.lon,heading??0)}`,
        lat:Number(record.lat),lon:Number(record.lon),heading,routePackId,payload,
        observedAt:now,updatedAt:now,freshUntil:now+FRESH_MS,staleUntil:now+STALE_MS,expiresAt:now+OFFLINE_FALLBACK_MS
      });
    }
  });
}

async function deleteRoadsForPack(routePackId){
  const rows=await getAll(ROAD_STORE);
  await transact(ROAD_STORE,'readwrite',store=>rows.filter(row=>row.routePackId===routePackId).forEach(row=>store.delete(row.id)));
}

async function findRoad(lat,lon,heading){
  if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon)))return null;
  const now=Date.now(),point={lat:Number(lat),lon:Number(lon)};
  const rows=await getAll(ROAD_STORE);
  let best=null;
  for(const row of rows){
    if(row.expiresAt<now)continue;
    const distance=miles(point,{lat:row.lat,lon:row.lon});
    if(distance>ROAD_RADIUS_MI)continue;
    const directionPenalty=angleDiff(finite(heading),finite(row.heading))/180*.08;
    const stalePenalty=now>row.staleUntil?.02:now>row.freshUntil?.007:0;
    const score=distance+directionPenalty+stalePenalty;
    if(!best||score<best.score)best={...row,distance,score,ageMs:Math.max(0,now-row.observedAt)};
  }
  return best;
}

function cachedApiPayload(record){
  const ageMs=record.ageMs??Math.max(0,Date.now()-record.observedAt);
  return {
    ...record.payload,
    source:`${String(record.payload?.source||'Offline road cache').replace(/\s·\sCached$/,'')} · Cached`,
    cached:true,cacheAgeMs:ageMs,
    cache:{...(record.payload?.cache||{}),persistent:true,hit:true,ageSeconds:Math.round(ageMs/1000)},
    diagnostic:`Offline cache hit ${Math.round(record.distance*5280)} ft away · ${formatAge(ageMs)} old.`
  };
}

function cachedResponse(record){
  return new Response(JSON.stringify(cachedApiPayload(record)),{status:200,headers:{'content-type':'application/json','x-moto-cache':'HIT'}});
}

function formatAge(milliseconds){
  const minutes=Math.max(0,Math.round(milliseconds/60000));
  if(minutes<60)return `${minutes} min`;
  const hours=Math.round(minutes/60);
  if(hours<48)return `${hours} hr`;
  return `${Math.round(hours/24)} d`;
}

function roadRequestDetails(input){
  try{
    const raw=typeof input==='string'?input:input?.url;
    const url=new URL(raw,location.href);
    if(url.origin!==location.origin||url.pathname!=='/api/road-info')return null;
    return {url,lat:finite(url.searchParams.get('lat')),lon:finite(url.searchParams.get('lon')),heading:finite(url.searchParams.get('heading'))};
  }catch{return null}
}

async function storeRoadResponse(details,response){
  if(!response?.ok)return null;
  const data=await response.clone().json().catch(()=>null);
  if(!data||!isPersistentSource(data))return data;
  await putRoadRecord({lat:details.lat,lon:details.lon,heading:details.heading,payload:data});
  return data;
}

function publishLiveRoad(data){
  if(!data)return;
  const mph=apiLimitMph(data);
  const detail={
    road:data.road||null,limit_mph:mph,source:data.source||'MotoCloud',surface:data.surface||null,
    confidence:data.confidence||null,limitKind:data.limitKind||null,reason:'background refresh',
    recordedAt:new Date().toISOString(),cacheStatus:'live',contextLabel:'LIVE'
  };
  window.dispatchEvent(new CustomEvent('moto-road-update',{detail}));
}

async function revalidateRoad(input,init,details,key){
  if(revalidating.has(key))return revalidating.get(key);
  const task=(async()=>{
    try{
      const response=await nativeFetch(input,init);
      if(!response.ok)return;
      const data=await storeRoadResponse(details,response);
      publishLiveRoad(data);
    }catch(error){console.debug('Road cache background refresh skipped',error)}
    finally{revalidating.delete(key)}
  })();
  revalidating.set(key,task);
  return task;
}

window.fetch=async function motoOfflineFetch(input,init){
  const details=roadRequestDetails(input);
  if(!details)return nativeFetch(input,init);
  const record=await findRoad(details.lat,details.lon,details.heading).catch(()=>null);
  const key=`${details.lat}:${details.lon}:${details.heading}`;
  if(record){
    if(navigator.onLine!==false)void revalidateRoad(input,init,details,key);
    return cachedResponse(record);
  }
  try{
    const response=await nativeFetch(input,init);
    if(response.ok)void storeRoadResponse(details,response).catch(error=>console.warn('Road response cache skipped',error));
    return response;
  }catch(error){
    const fallback=await findRoad(details.lat,details.lon,details.heading).catch(()=>null);
    if(fallback)return cachedResponse(fallback);
    throw error;
  }
};

function mutateRoadDetail(detail){
  if(!detail||typeof detail!=='object')return;
  const cached=/cached/i.test(String(detail.source||''))||detail.cacheStatus==='cached';
  detail.cacheStatus=cached?'cached':'live';
  if(cached){
    const age=finite(detail.cacheAgeMs);
    detail.contextLabel=age===null?'CACHED':`CACHED · ${formatAge(age).toUpperCase()} OLD`;
  }else detail.contextLabel='LIVE';
  latestRoad=detail;
  requestAnimationFrame(()=>updateRoadBadges(detail));
}

async function announceCachedRoad(){
  if(!latestFix||Date.now()-lastCachedAnnouncement<5000)return;
  const record=await findRoad(latestFix.lat,latestFix.lon,latestFix.heading).catch(()=>null);
  if(!record)return;
  lastCachedAnnouncement=Date.now();
  const payload=cachedApiPayload(record);
  const detail={
    road:payload.road||null,limit_mph:apiLimitMph(payload),source:payload.source,surface:payload.surface||null,
    confidence:payload.confidence||null,limitKind:payload.limitKind||null,reason:'startup cache',
    recordedAt:new Date(record.observedAt).toISOString(),cacheStatus:'cached',cacheAgeMs:record.ageMs,
    contextLabel:`CACHED · ${formatAge(record.ageMs).toUpperCase()} OLD`
  };
  window.dispatchEvent(new CustomEvent('moto-road-update',{detail}));
}

function updateRoadBadges(detail=latestRoad){
  if(!detail)return;
  const label=detail.contextLabel||'LIVE';
  const tone=detail.cacheStatus==='cached'?'cached':'live';
  const targets=[
    document.querySelector('#rideXSmartStrip .rideXCompliance>span:last-child'),
    document.querySelector('#adventureOverlay .advSpeedHud'),
    document.querySelector('#rideDashOverlay .widget-road')
  ].filter(Boolean);
  for(const target of targets){
    let badge=target.querySelector(':scope > .motoRoadCacheBadge');
    if(!badge){badge=document.createElement('small');badge.className='motoRoadCacheBadge';target.appendChild(badge)}
    badge.dataset.state=tone;badge.textContent=label;badge.title=`Road source: ${detail.source||'unknown'}`;
  }
}

async function getSelectedRoute(){
  const active=document.querySelector('#adventureRouteList [data-id].active');
  const id=active?.dataset.id||localStorage.getItem(ACTIVE_ROUTE_KEY);
  if(!id)return null;
  const {data,error}=await supabase.from('adventure_routes').select('id,name,geojson,distance_miles,updated_at').eq('id',id).maybeSingle();
  if(error)throw error;
  return data||null;
}

function sampleCoordinates(coordinates,max=140){
  const clean=(coordinates||[]).map(item=>[Number(item?.[0]),Number(item?.[1])]).filter(item=>Number.isFinite(item[0])&&Number.isFinite(item[1]));
  if(clean.length<=max)return clean;
  const output=[];
  for(let index=0;index<max;index++)output.push(clean[Math.round(index*(clean.length-1)/(max-1))]);
  return output;
}

async function downloadRoutePack(route,progress=()=>{}){
  if(!route?.id)throw new Error('Select a route in Adventure Mode first.');
  const coordinates=sampleCoordinates(route.geojson?.geometry?.coordinates||[]);
  if(coordinates.length<2)throw new Error('The selected route has no usable geometry.');
  progress('Scanning OpenStreetMap roads…');
  const response=await nativeFetch('/api/route-road-cache',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({routeId:route.id,name:route.name,coordinates})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Route cache HTTP ${response.status}`);
  progress(`Saving ${Number(data.records?.length||0).toLocaleString()} road points…`);
  await deleteRoadsForPack(String(route.id));
  await putRoadRecords(data.records||[],String(route.id));
  const pack={id:String(route.id),name:route.name||'Route',distanceMiles:Number(route.distance_miles||0),recordCount:Number(data.records?.length||0),roadCount:Number(data.roadCount||0),updatedAt:Date.now(),attribution:data.attribution||'© OpenStreetMap contributors'};
  await transact(PACK_STORE,'readwrite',store=>store.put(pack));
  progress('Offline route data ready.');
  return pack;
}

async function clearRoads(){await transact(ROAD_STORE,'readwrite',store=>store.clear())}
async function clearPacks(){await transact(PACK_STORE,'readwrite',store=>store.clear());await clearRoads()}
async function clearRuntimeCaches(){
  const registration=await navigator.serviceWorker?.ready;
  registration?.active?.postMessage({type:'CLEAR_RUNTIME_CACHE'});
}
async function warmAppCache(){
  const registration=await navigator.serviceWorker?.ready;
  registration?.active?.postMessage({type:'PRECACHE_NOW'});
}

async function stats(){
  const [roads,packs,cacheNames,estimate]=await Promise.all([
    getAll(ROAD_STORE).catch(()=>[]),getAll(PACK_STORE).catch(()=>[]),
    'caches'in window?caches.keys():Promise.resolve([]),navigator.storage?.estimate?.()||Promise.resolve({})
  ]);
  return {roads:roads.length,packs,cacheNames,usage:Number(estimate.usage||0),quota:Number(estimate.quota||0),lastRoadAt:roads.reduce((max,row)=>Math.max(max,row.updatedAt||0),0)};
}

function formatBytes(bytes){
  if(!Number.isFinite(bytes)||bytes<=0)return'0 MB';
  const units=['B','KB','MB','GB'];let value=bytes,index=0;
  while(value>=1024&&index<units.length-1){value/=1024;index++}
  return `${value.toFixed(index<2?0:1)} ${units[index]}`;
}

async function openManager(){
  document.querySelector('#motoOfflineManager')?.remove();
  const modal=document.createElement('div');modal.id='motoOfflineManager';modal.className='motoOfflineManager';
  modal.innerHTML=`<section role="dialog" aria-modal="true" aria-label="Offline cache manager"><header><div><small>MOTO MISSION</small><h2>Offline & Cache</h2><p>Fast startup, retained road context and downloadable route intelligence.</p></div><button data-cache-close aria-label="Close">×</button></header><div class="motoOfflineStats" data-cache-stats><article><small>APP CACHE</small><strong>CHECKING</strong></article><article><small>ROAD POINTS</small><strong>—</strong></article><article><small>ROUTE PACKS</small><strong>—</strong></article><article><small>DEVICE STORAGE</small><strong>—</strong></article></div><div class="motoOfflineRoute"><div><small>SELECTED ROUTE</small><strong data-cache-route>Checking Adventure routes…</strong><p>Downloads OSM-derived road names, surfaces and mapped or estimated speed limits along the selected route. Map tiles are not bulk-downloaded.</p></div><button data-cache-download>DOWNLOAD ROUTE DATA</button></div><div class="motoOfflineActions"><button data-cache-warm><b>WARM APP CACHE</b><small>Store core dashboards, scripts and styles now</small></button><button data-cache-clear-runtime><b>REFRESH APP FILES</b><small>Clear runtime files, then rebuild the shell cache</small></button><button data-cache-clear-roads><b>CLEAR ROAD CACHE</b><small>Remove retained road and speed-limit points</small></button><button data-cache-clear-packs class="danger"><b>CLEAR ROUTE PACKS</b><small>Remove every downloaded offline route pack</small></button></div><div class="motoOfflinePackList" data-cache-packs></div><footer><span data-cache-status>Ready.</span><button data-cache-close>DONE</button></footer></section>`;
  document.body.appendChild(modal);
  const status=modal.querySelector('[data-cache-status]');
  const setStatus=text=>{if(status)status.textContent=text};
  const render=async()=>{
    const summary=await stats();
    const cards=modal.querySelectorAll('[data-cache-stats] article strong');
    if(cards[0])cards[0].textContent=`${summary.cacheNames.length} CACHES`;
    if(cards[1])cards[1].textContent=summary.roads.toLocaleString();
    if(cards[2])cards[2].textContent=String(summary.packs.length);
    if(cards[3])cards[3].textContent=`${formatBytes(summary.usage)} / ${formatBytes(summary.quota)}`;
    const list=modal.querySelector('[data-cache-packs]');
    list.innerHTML=summary.packs.length?`<h3>DOWNLOADED ROUTES</h3>${summary.packs.sort((a,b)=>b.updatedAt-a.updatedAt).map(pack=>`<article><div><strong>${esc(pack.name)}</strong><small>${pack.recordCount.toLocaleString()} points · ${pack.roadCount.toLocaleString()} roads</small></div><span>${new Date(pack.updatedAt).toLocaleDateString()}</span></article>`).join('')}`:'<p>No route packs downloaded yet.</p>';
  };
  let selectedRoute=null;
  try{selectedRoute=await getSelectedRoute();modal.querySelector('[data-cache-route]').textContent=selectedRoute?`${selectedRoute.name} · ${Number(selectedRoute.distance_miles||0).toFixed(1)} mi`:'No route selected';}catch(error){modal.querySelector('[data-cache-route]').textContent='Route lookup unavailable';setStatus(error.message||String(error))}
  modal.onclick=event=>{if(event.target===modal||event.target.closest('[data-cache-close]'))modal.remove()};
  modal.querySelector('[data-cache-download]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{selectedRoute=selectedRoute||await getSelectedRoute();const pack=await downloadRoutePack(selectedRoute,text=>{button.textContent=text;setStatus(text)});button.textContent='ROUTE DATA READY';setStatus(`${pack.name} saved for offline road matching.`);await render()}catch(error){button.disabled=false;button.textContent='TRY DOWNLOAD AGAIN';setStatus(error.message||String(error))}};
  modal.querySelector('[data-cache-warm]').onclick=async()=>{setStatus('Warming the application cache…');await warmAppCache();setStatus('Core app files queued for caching.');setTimeout(render,800)};
  modal.querySelector('[data-cache-clear-runtime]').onclick=async()=>{setStatus('Refreshing app runtime files…');await clearRuntimeCaches();await warmAppCache();setStatus('Runtime cache refresh requested.');setTimeout(render,800)};
  modal.querySelector('[data-cache-clear-roads]').onclick=async()=>{if(!confirm('Clear retained road and speed-limit data?'))return;await clearRoads();setStatus('Road cache cleared.');render()};
  modal.querySelector('[data-cache-clear-packs]').onclick=async()=>{if(!confirm('Clear all downloaded route packs and their road data?'))return;await clearPacks();setStatus('Route packs cleared.');render()};
  await render();
}

function ensureControls(){
  const rideStatus=document.querySelector('#rideDashOverlay [data-ride-os-status]');
  if(rideStatus&&!rideStatus.querySelector('[data-open-offline-cache]')){
    const button=document.createElement('button');button.type='button';button.dataset.openOfflineCache='1';button.className='motoOfflineOpenButton';button.textContent='OFFLINE';rideStatus.appendChild(button);
  }
  const adventureGrid=document.querySelector('#adventureOverlay #advMoreSheet .advQuickGrid');
  if(adventureGrid&&!adventureGrid.querySelector('[data-open-offline-cache]')){
    const button=document.createElement('button');button.type='button';button.dataset.openOfflineCache='1';button.innerHTML='<span>⇩</span><b>Offline Data</b><small>Cache app and route info</small>';adventureGrid.appendChild(button);
  }
  const routeActions=document.querySelector('#adventureOverlay .advRouteSummaryActions');
  if(routeActions&&!routeActions.querySelector('[data-download-route-cache]')){
    const button=document.createElement('button');button.type='button';button.dataset.downloadRouteCache='1';button.textContent='OFFLINE DATA';routeActions.appendChild(button);
  }
  updateRoadBadges();
}

document.addEventListener('click',event=>{
  const routeButton=event.target.closest?.('#adventureRouteList [data-id]');
  if(routeButton?.dataset.id)localStorage.setItem(ACTIVE_ROUTE_KEY,routeButton.dataset.id);
  if(event.target.closest?.('[data-open-offline-cache]'))openManager();
  const download=event.target.closest?.('[data-download-route-cache]');
  if(download){
    download.disabled=true;const original=download.textContent;
    getSelectedRoute().then(route=>downloadRoutePack(route,text=>{download.textContent=text})).then(pack=>{download.textContent='OFFLINE READY';setTimeout(()=>{download.textContent=original;download.disabled=false},1800);window.dispatchEvent(new CustomEvent('moto-offline-route-ready',{detail:pack}))}).catch(error=>{download.textContent='DOWNLOAD FAILED';download.title=error.message||String(error);setTimeout(()=>{download.textContent=original;download.disabled=false},2200)})
  }
},true);

window.addEventListener('moto-gps-fix',event=>{
  const detail=event.detail||{};
  if(Number.isFinite(Number(detail.latitude))&&Number.isFinite(Number(detail.longitude))){latestFix={lat:Number(detail.latitude),lon:Number(detail.longitude),heading:finite(detail.heading)};const active=window.MotoRide?.getState?.()?.active;if(active&&!latestRoad)void announceCachedRoad()}
});
window.addEventListener('moto-road-update',event=>mutateRoadDetail(event.detail));
window.addEventListener('moto-ride-state',event=>{if(event.detail?.active)void announceCachedRoad();else latestRoad=null});
window.addEventListener('online',()=>{if(latestFix)window.MotoRideTools?.refreshRoad?.()});

new MutationObserver(ensureControls).observe(document.body,{childList:true,subtree:true});
setInterval(ensureControls,1200);
ensureControls();

window.MotoOfflineCache={open:openManager,findRoad,putRoadRecord,downloadRoutePack,getSelectedRoute,stats,clearRoads,clearPacks,warmAppCache};
