// Safe feature layer for the isolated iPhone recorder.
// Loads before recording-isolation.js so it receives GPS/road/route events first,
// then renders only at bounded cadences inside the isolated recording screen.
(() => {
  if (window.__motoRecorderFeaturesV42Installed) return;
  window.__motoRecorderFeaturesV42Installed = true;

  const state = {
    active:false,gps:{},road:{},route:{},weather:{},history:[],lastSample:null,
    acceleration:0,braking:0,grade:null,cornerSpeed:0,maxCornerSpeed:0,turnRate:0,
    fps:60,lag:0,maxLag:0,longTasks:0,memoryMb:null,renderCount:0,
    lastRoadAt:0,lastWeatherAt:0,lastRouteAt:0,monitorExpanded:false,
    timers:new Set(),raf:0,lastFrameAt:0,frames:0,lastFpsAt:0
  };
  const finite=value=>value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value):null;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const angleDelta=(a,b)=>{if(!Number.isFinite(a)||!Number.isFinite(b))return 0;let d=(b-a+540)%360-180;return d};
  const mphToMps=mph=>mph*0.44704;
  const setText=(id,value)=>{const node=document.getElementById(id);const text=String(value??'');if(node&&node.textContent!==text)node.textContent=text};

  function addStyles(){
    if(document.querySelector('style[data-rec-features-v42]'))return;
    const style=document.createElement('style');style.dataset.recFeaturesV42='1';style.textContent=`
      #motoRecordingIsolation .recFeatureGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #motoRecordingIsolation .recFeatureCard{min-width:0;padding:14px;border:1px solid rgba(148,163,184,.18);border-radius:17px;background:#091018}
      #motoRecordingIsolation .recFeatureCard small{display:block;color:#8390a3;font-size:8px;font-weight:900;letter-spacing:.15em}
      #motoRecordingIsolation .recFeatureCard strong{display:block;margin-top:7px;font-size:24px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #motoRecordingIsolation .recFeatureCard span{display:block;margin-top:7px;color:#5eead4;font-size:9px;font-weight:900;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #motoRecordingIsolation .recFeatureWide{grid-column:1/-1}
      #motoRecordingIsolation .recHistory{height:56px;margin-top:8px;width:100%;display:block}
      #motoRecordingIsolation .recMonitor{border:1px solid rgba(96,165,250,.26);border-radius:17px;background:#07101b;overflow:hidden}
      #motoRecordingIsolation .recMonitorToggle{width:100%;min-height:48px;border:0;background:transparent;color:#dbeafe;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font:900 10px/1 system-ui;letter-spacing:.14em}
      #motoRecordingIsolation .recMonitorToggle b{color:#5eead4}
      #motoRecordingIsolation .recMonitorBody{display:none;padding:0 12px 12px;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      #motoRecordingIsolation .recMonitor.open .recMonitorBody{display:grid}
      #motoRecordingIsolation .recMonitorMetric{padding:10px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:#080d14;min-width:0}
      #motoRecordingIsolation .recMonitorMetric small{display:block;color:#738197;font-size:7px;font-weight:900;letter-spacing:.12em}
      #motoRecordingIsolation .recMonitorMetric strong{display:block;margin-top:6px;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #motoRecordingIsolation .recFeatureNote{margin:0;color:#8290a4;font-size:11px;line-height:1.45}
      @media(max-width:390px){#motoRecordingIsolation .recFeatureCard strong{font-size:21px}#motoRecordingIsolation .recMonitorBody{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;document.head.appendChild(style);
  }

  function panelMarkup(){
    return `<section id="recFeaturePanel" class="recFeatureGrid" aria-label="Ride intelligence">
      <article class="recFeatureCard"><small>HEADING</small><strong id="recHeading">--</strong><span id="recHeadingText">WAITING</span></article>
      <article class="recFeatureCard"><small>ELEVATION</small><strong id="recElevation">--</strong><span id="recGrade">GRADE --</span></article>
      <article class="recFeatureCard"><small>ACCELERATION</small><strong id="recAccel">0.00 g</strong><span id="recAccelState">STEADY</span></article>
      <article class="recFeatureCard"><small>BRAKING</small><strong id="recBrake">0.00 g</strong><span id="recBrakeState">STEADY</span></article>
      <article class="recFeatureCard"><small>CORNER SPEED</small><strong id="recCorner">0 MPH</strong><span id="recTurnRate">STRAIGHT</span></article>
      <article class="recFeatureCard"><small>MAX CORNER</small><strong id="recMaxCorner">0 MPH</strong><span>GPS DERIVED</span></article>
      <article class="recFeatureCard"><small>WEATHER</small><strong id="recWeather">--</strong><span id="recWeatherDetail">UPDATING</span></article>
      <article class="recFeatureCard"><small>ROUTE</small><strong id="recRoute">NO ROUTE</strong><span id="recRouteDetail">SELECT A ROUTE</span></article>
      <article class="recFeatureCard recFeatureWide"><small>SPEED HISTORY · LAST 60 SEC</small><svg class="recHistory" viewBox="0 0 300 56" preserveAspectRatio="none" aria-label="Speed history"><polyline id="recSpeedLine" fill="none" stroke="currentColor" stroke-width="2" points="0,52 300,52"/></svg><span id="recSpeedRange">0–0 MPH</span></article>
    </section>
    <section id="recPerfMonitor" class="recMonitor" aria-label="Performance monitor">
      <button id="recMonitorToggle" class="recMonitorToggle" type="button"><span>PERFORMANCE MONITOR</span><b id="recMonitorSummary">STABLE</b></button>
      <div class="recMonitorBody">
        <article class="recMonitorMetric"><small>FPS</small><strong id="recMonFps">--</strong></article>
        <article class="recMonitorMetric"><small>EVENT LAG</small><strong id="recMonLag">--</strong></article>
        <article class="recMonitorMetric"><small>MAX LAG</small><strong id="recMonMaxLag">--</strong></article>
        <article class="recMonitorMetric"><small>MEMORY</small><strong id="recMonMemory">N/A</strong></article>
        <article class="recMonitorMetric"><small>GPS WATCHERS</small><strong id="recMonGps">--</strong></article>
        <article class="recMonitorMetric"><small>DOM NODES</small><strong id="recMonDom">--</strong></article>
        <article class="recMonitorMetric"><small>LONG TASKS</small><strong id="recMonLong">0</strong></article>
        <article class="recMonitorMetric"><small>UI RENDERS</small><strong id="recMonRenders">0</strong></article>
        <article class="recMonitorMetric"><small>BUFFERED</small><strong id="recMonBuffered">0</strong></article>
      </div>
    </section>
    <p class="recFeatureNote">Phase 2 road, route, weather and speed-history features are rate limited. Phase 3 acceleration, braking, grade and corner metrics are GPS-derived. iPhone lean sensors remain disabled.</p>`;
  }

  function mount(){
    const shell=document.querySelector('#motoRecordingIsolation .recShell');if(!shell||document.querySelector('#recFeaturePanel'))return false;
    addStyles();const note=shell.querySelector('.recNote');const host=document.createElement('div');host.innerHTML=panelMarkup();
    const nodes=[...host.children];nodes.forEach(node=>shell.insertBefore(node,note));
    const toggle=document.querySelector('#recMonitorToggle');if(toggle)toggle.onclick=()=>{state.monitorExpanded=!state.monitorExpanded;document.querySelector('#recPerfMonitor')?.classList.toggle('open',state.monitorExpanded)};
    render(true);return true;
  }

  function compass(value){
    if(!Number.isFinite(value))return '--';const dirs=['N','NE','E','SE','S','SW','W','NW'];return `${dirs[Math.round(value/45)%8]} ${Math.round(value)}°`;
  }

  function processGps(detail){
    if(!state.active)return;const now=Number(detail.timestamp||Date.now());const mph=finite(detail.speed)??finite(detail.speedMph)??0;const heading=finite(detail.heading);const altitude=finite(detail.altitude);
    const previous=state.lastSample;
    if(previous&&now>previous.time){
      const dt=clamp((now-previous.time)/1000,.25,4);const accel=(mphToMps(mph)-mphToMps(previous.mph))/dt/9.80665;
      state.acceleration=accel>0?state.acceleration*.55+accel*.45:state.acceleration*.7;
      state.braking=accel<0?state.braking*.55+Math.abs(accel)*.45:state.braking*.7;
      const turn=Math.abs(angleDelta(previous.heading,heading))/dt;state.turnRate=turn;
      state.cornerSpeed=turn>=5&&mph>=5?mph:0;if(state.cornerSpeed>state.maxCornerSpeed)state.maxCornerSpeed=state.cornerSpeed;
      if(Number.isFinite(altitude)&&Number.isFinite(previous.altitude)&&mph>4){const traveled=Math.max(1,mphToMps((mph+previous.mph)/2)*dt);state.grade=clamp((altitude-previous.altitude)/traveled*100,-35,35)}
    }
    state.lastSample={time:now,mph,heading,altitude};state.gps={...state.gps,...detail};
    if(!state.history.length||now-state.history[state.history.length-1].time>=1000){state.history.push({time:now,mph});state.history=state.history.filter(item=>now-item.time<=60000)}
    maybeWeather();render();
  }

  async function maybeWeather(){
    const lat=finite(state.gps.latitude),lon=finite(state.gps.longitude),now=Date.now();if(!state.active||lat===null||lon===null||now-state.lastWeatherAt<600000)return;
    state.lastWeatherAt=now;
    try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`;const response=await fetch(url,{signal:controller.signal,cache:'no-store'});clearTimeout(timer);if(!response.ok)throw new Error('weather');const data=await response.json();state.weather=data.current||{};render(true)}catch{state.weather={error:true}}
  }

  function render(force=false){
    if(!state.active||!document.querySelector('#recFeaturePanel'))return;state.renderCount+=1;
    const heading=finite(state.gps.heading),alt=finite(state.gps.altitude),weather=state.weather;
    setText('recHeading',compass(heading));setText('recHeadingText',state.gps.headingSource||'GPS COURSE');
    setText('recElevation',alt===null?'--':`${Math.round(alt*3.28084)} FT`);setText('recGrade',state.grade===null?'GRADE --':`${state.grade>=0?'CLIMB':'DESCENT'} ${Math.abs(state.grade).toFixed(1)}%`);
    setText('recAccel',`${Math.max(0,state.acceleration).toFixed(2)} g`);setText('recAccelState',state.acceleration>.08?'ACCELERATING':'STEADY');
    setText('recBrake',`${Math.max(0,state.braking).toFixed(2)} g`);setText('recBrakeState',state.braking>.08?'BRAKING':'STEADY');
    setText('recCorner',`${Math.round(state.cornerSpeed)} MPH`);setText('recTurnRate',state.turnRate>=5?`${state.turnRate.toFixed(0)}°/SEC`:'STRAIGHT');setText('recMaxCorner',`${Math.round(state.maxCornerSpeed)} MPH`);
    if(finite(weather.temperature_2m)!==null){setText('recWeather',`${Math.round(weather.temperature_2m)}°F`);setText('recWeatherDetail',`${Math.round(finite(weather.wind_speed_10m)||0)} MPH WIND · ${finite(weather.precipitation)>0?'PRECIP':'DRY'}`)}else{setText('recWeather',weather.error?'OFFLINE':'--');setText('recWeatherDetail',weather.error?'RETRY IN 10 MIN':'UPDATING')}
    const routeName=state.route.name||state.route.routeName||state.route.title;setText('recRoute',routeName||'NO ROUTE');const remain=finite(state.route.distanceRemainingMiles??state.route.remainingMiles);const eta=state.route.eta||state.route.etaText;setText('recRouteDetail',routeName?(remain!==null?`${remain.toFixed(1)} MI${eta?` · ${eta}`:''}`:(eta||'ACTIVE')):'SELECT A ROUTE');
    renderHistory();renderMonitor();
  }

  function renderHistory(){
    const line=document.getElementById('recSpeedLine');if(!line)return;const list=state.history;if(list.length<2){line.setAttribute('points','0,52 300,52');setText('recSpeedRange','0–0 MPH');return}
    const max=Math.max(10,...list.map(item=>item.mph));const min=Math.min(...list.map(item=>item.mph));const first=list[0].time,last=list[list.length-1].time,span=Math.max(1,last-first);const points=list.map(item=>`${((item.time-first)/span*300).toFixed(1)},${(52-item.mph/max*48).toFixed(1)}`).join(' ');line.setAttribute('points',points);setText('recSpeedRange',`${Math.round(min)}–${Math.round(max)} MPH`);
  }

  function renderMonitor(){
    const diag=window.MotoRecordingIsolation?.getDiagnostics?.()||{};const gpsDiag=window.MotoGPSBroker?.getDiagnostics?.()||{};const memory=performance.memory?.usedJSHeapSize;state.memoryMb=memory?memory/1048576:null;state.lag=finite(diag.currentEventLoopLagMs)||0;state.maxLag=Math.max(state.maxLag,finite(diag.maxEventLoopLagMs)||0);
    const stable=state.fps>=25&&state.maxLag<250&&state.longTasks<5;setText('recMonitorSummary',stable?'STABLE':'WATCH');setText('recMonFps',`${Math.round(state.fps)}`);setText('recMonLag',`${Math.round(state.lag)} ms`);setText('recMonMaxLag',`${Math.round(state.maxLag)} ms`);setText('recMonMemory',state.memoryMb===null?'N/A':`${state.memoryMb.toFixed(0)} MB`);setText('recMonGps',gpsDiag.nativeWatchActive?1:0);setText('recMonDom',document.getElementsByTagName('*').length);setText('recMonLong',state.longTasks);setText('recMonRenders',state.renderCount);setText('recMonBuffered',window.MotoRide?.getState?.().bufferedSamples??0);
  }

  function frame(now){
    if(!state.active)return;state.frames+=1;if(!state.lastFpsAt)state.lastFpsAt=now;if(now-state.lastFpsAt>=1000){state.fps=state.frames*1000/(now-state.lastFpsAt);state.frames=0;state.lastFpsAt=now;renderMonitor()}state.raf=requestAnimationFrame(frame)
  }

  function start(){state.active=true;state.history=[];state.lastSample=null;state.maxCornerSpeed=0;state.renderCount=0;state.longTasks=0;state.lastWeatherAt=0;setTimeout(mount,0);setTimeout(mount,80);state.frames=0;state.lastFpsAt=0;state.raf=requestAnimationFrame(frame)}
  function stop(){state.active=false;cancelAnimationFrame(state.raf);state.raf=0;state.timers.forEach(clearTimeout);state.timers.clear()}

  try{if('PerformanceObserver'in window){const observer=new PerformanceObserver(list=>{if(state.active)state.longTasks+=list.getEntries().length});observer.observe({type:'longtask',buffered:true})}}catch{}
  window.addEventListener('moto-recording-isolation-change',event=>event.detail?.active?start():stop());
  window.addEventListener('moto-gps-fix',event=>processGps(event.detail||{}),true);
  window.addEventListener('moto-road-update',event=>{if(!state.active)return;state.road=event.detail||{};render(true)},true);
  window.addEventListener('moto-route-update',event=>{if(!state.active)return;state.route=event.detail||{};render(true)},true);
  window.addEventListener('moto-weather-update',event=>{if(!state.active)return;state.weather=event.detail||{};render(true)},true);
  window.MotoRecorderFeatures={getState:()=>({...state,history:[...state.history]}),render:()=>render(true)};
})();