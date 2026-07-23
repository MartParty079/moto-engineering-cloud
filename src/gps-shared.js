// Single native geolocation authority for Moto Mission.
// Every legacy watchPosition subscriber is multiplexed through one iOS GPS watch.
(() => {
  const geo = navigator.geolocation;
  if (!geo || window.__motoGpsBrokerInstalled) return;
  window.__motoGpsBrokerInstalled = true;

  const nativeWatch = geo.watchPosition.bind(geo);
  const nativeClear = geo.clearWatch.bind(geo);
  const nativeCurrent = geo.getCurrentPosition.bind(geo);
  const subscribers = new Map();
  let virtualId = 100000;
  let nativeWatchId = null;
  let nativeOptions = null;
  let previousFix = null;
  let latestPosition = null;
  let latestDetail = null;
  let lastPublishedAt = 0;
  let nativeCallbacks = 0;
  let publishedEvents = 0;
  let nativeStarts = 0;
  let nativeErrors = 0;

  const finite = value => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
  const toRad = value => value * Math.PI / 180;

  function distanceFeet(a,b){
    if(!a || !b) return 0;
    const r = 20902231;
    const dLat = toRad(b.latitude-a.latitude);
    const dLon = toRad(b.longitude-a.longitude);
    const q = Math.sin(dLat/2)**2 + Math.cos(toRad(a.latitude))*Math.cos(toRad(b.latitude))*Math.sin(dLon/2)**2;
    return 2*r*Math.asin(Math.sqrt(q));
  }

  function bearingBetween(a,b){
    if(!a || !b) return null;
    const lat1=toRad(a.latitude),lat2=toRad(b.latitude),dLon=toRad(b.longitude-a.longitude);
    const y=Math.sin(dLon)*Math.cos(lat2);
    const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
    return (Math.atan2(y,x)*180/Math.PI+360)%360;
  }

  function normalizedOptions(options={}){
    return {
      enableHighAccuracy: options.enableHighAccuracy !== false,
      maximumAge: Number.isFinite(options.maximumAge) ? Math.max(0,options.maximumAge) : 1500,
      timeout: Number.isFinite(options.timeout) ? Math.max(1000,options.timeout) : 20000
    };
  }

  function combinedOptions(){
    const all=[...subscribers.values()].map(item=>item.options);
    if(!all.length) return normalizedOptions();
    return {
      enableHighAccuracy: all.some(item=>item.enableHighAccuracy),
      maximumAge: Math.min(...all.map(item=>item.maximumAge)),
      timeout: Math.max(...all.map(item=>item.timeout))
    };
  }

  function sameOptions(a,b){
    return Boolean(a&&b&&a.enableHighAccuracy===b.enableHighAccuracy&&a.maximumAge===b.maximumAge&&a.timeout===b.timeout);
  }

  function dispatchFix(detail){
    const minInterval = window.__motoRecordingActive || window.__motoRecordingIsolation ? 1000 : 250;
    const now = performance.now();
    if(now-lastPublishedAt < minInterval) return;
    lastPublishedAt = now;
    publishedEvents += 1;
    window.dispatchEvent(new CustomEvent('moto-gps-fix',{detail}));
  }

  function remember(position){
    if(!position?.coords) return position;
    nativeCallbacks += 1;
    latestPosition = position;
    window.__motoLatestPosition = position;
    const current={latitude:Number(position.coords.latitude),longitude:Number(position.coords.longitude)};
    let heading=finite(position.coords.heading);
    let headingSource=heading===null?'Stationary':'iPhone GPS';
    const movedFeet=distanceFeet(previousFix,current);
    if(heading===null&&previousFix&&movedFeet>=12){
      heading=bearingBetween(previousFix,current);
      headingSource='Calculated course';
    }
    if(!previousFix||movedFeet>=5) previousFix=current;
    latestDetail={
      latitude:current.latitude,
      longitude:current.longitude,
      altitude:finite(position.coords.altitude),
      accuracy:finite(position.coords.accuracy),
      speed:finite(position.coords.speed)===null?null:Number(position.coords.speed)*2.236936,
      speedMps:finite(position.coords.speed),
      heading,
      headingSource,
      timestamp:Number(position.timestamp||Date.now())
    };
    window.MotoGPS=latestDetail;
    window.__motoLatestGpsFix=latestDetail;
    dispatchFix(latestDetail);
    return position;
  }

  function fanOutPosition(position){
    const remembered=remember(position);
    for(const subscriber of subscribers.values()){
      try{subscriber.success?.(remembered)}catch(error){console.error('GPS subscriber failed',error)}
    }
  }

  function fanOutError(error){
    nativeErrors += 1;
    for(const subscriber of subscribers.values()){
      try{subscriber.error?.(error)}catch(callbackError){console.error('GPS error subscriber failed',callbackError)}
    }
  }

  function stopNative(){
    if(nativeWatchId===null) return;
    try{nativeClear(nativeWatchId)}catch{}
    nativeWatchId=null;
    nativeOptions=null;
  }

  function ensureNative(){
    if(!subscribers.size){stopNative();return}
    const next=combinedOptions();
    if(nativeWatchId!==null&&sameOptions(nativeOptions,next)) return;
    stopNative();
    nativeOptions=next;
    nativeStarts += 1;
    nativeWatchId=nativeWatch(fanOutPosition,fanOutError,next);
  }

  function wrappedWatch(success,error,options={}){
    const id=++virtualId;
    subscribers.set(id,{success,error,options:normalizedOptions(options)});
    ensureNative();
    if(latestPosition){
      const age=Date.now()-Number(latestPosition.timestamp||0);
      const allowed=subscribers.get(id)?.options.maximumAge??0;
      if(age<=allowed) queueMicrotask(()=>{if(subscribers.has(id))success?.(latestPosition)});
    }
    return id;
  }

  function wrappedClear(id){
    if(subscribers.delete(id)){
      ensureNative();
      return;
    }
    try{nativeClear(id)}catch{}
  }

  function wrappedCurrent(success,error,options={}){
    const normalized=normalizedOptions(options);
    const age=latestPosition?Date.now()-Number(latestPosition.timestamp||0):Infinity;
    if(latestPosition&&age<=Math.max(normalized.maximumAge,1000)){
      queueMicrotask(()=>success?.(latestPosition));
      return;
    }
    nativeCurrent(position=>success?.(remember(position)),error,normalized);
  }

  window.__motoGpsPublish=remember;
  window.__motoGpsGetLatest=()=>latestPosition;
  window.__motoGpsWaitForFix=(timeoutMs=20000)=>new Promise((resolve,reject)=>{
    if(latestPosition){resolve(latestPosition);return}
    const timer=setTimeout(()=>{window.removeEventListener('moto-gps-fix',onFix);reject(new Error('Waiting for GPS fix'))},timeoutMs);
    const onFix=()=>{clearTimeout(timer);window.removeEventListener('moto-gps-fix',onFix);resolve(latestPosition)};
    window.addEventListener('moto-gps-fix',onFix,{once:true});
  });

  window.MotoGPSBroker={
    getLatest:()=>latestDetail?{...latestDetail}:null,
    getDiagnostics:()=>({
      nativeWatchActive:nativeWatchId!==null,
      nativeWatchStarts:nativeStarts,
      virtualSubscribers:subscribers.size,
      nativeCallbacks,
      publishedEvents,
      nativeErrors,
      recording:Boolean(window.__motoRecordingActive||window.__motoRecordingIsolation)
    }),
    stop:()=>{subscribers.clear();stopNative()}
  };

  try{
    Object.defineProperty(geo,'watchPosition',{configurable:true,value:wrappedWatch});
    Object.defineProperty(geo,'clearWatch',{configurable:true,value:wrappedClear});
    Object.defineProperty(geo,'getCurrentPosition',{configurable:true,value:wrappedCurrent});
  }catch(error){
    console.warn('GPS broker method wrapping unavailable',error);
  }

  nativeCurrent(remember,()=>{},normalizedOptions({maximumAge:10000}));
})();