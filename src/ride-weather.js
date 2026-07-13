const $=q=>document.querySelector(q);
let lastCoords=null,lastWeatherAt=0,loading=false;

function cardinal(deg){
  if(!Number.isFinite(deg))return '—';
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg/45)%8];
}
function localTime(value){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
}
function setText(id,value){const el=$(id);if(el)el.textContent=value}
function showPage(index){
  const viewport=$('#rideSwipeViewport'),track=$('#rideSwipeTrack');
  if(!viewport||!track)return;
  const page=index===1?1:0;
  viewport.dataset.page=String(page);
  track.style.transform=`translateX(-${page*50}%)`;
  document.querySelectorAll('[data-ride-page]').forEach(b=>b.classList.toggle('active',Number(b.dataset.ridePage)===page));
  if(page===1)refreshWeather(false);
}
function weatherMarkup(){return `<section class="rideWeatherPage">
  <div class="rideWeatherHeading"><div><small>LOCAL RIDING WEATHER</small><h3 id="rideWeatherLocation">Current location</h3></div><button id="refreshRideWeather" class="rideWeatherRefresh" type="button">↻</button></div>
  <div id="rideWeatherStatus" class="rideWeatherStatus">Waiting for location…</div>
  <div class="rideWeatherHero"><strong id="rideWeatherTemp">--°</strong><div><span id="rideWeatherRain">--% rain</span><small id="rideWeatherUpdated">Not updated</small></div></div>
  <div class="rideWeatherGrid">
    <article><small>CHANCE OF RAIN</small><strong id="rideWeatherRainCard">--%</strong></article>
    <article><small>HUMIDITY</small><strong id="rideWeatherHumidity">--%</strong></article>
    <article><small>WIND</small><strong id="rideWeatherWind">-- mph</strong><span id="rideWeatherWindDir">—</span></article>
    <article><small>SUNRISE</small><strong id="rideWeatherSunrise">--</strong></article>
    <article><small>SUNSET</small><strong id="rideWeatherSunset">--</strong></article>
    <article><small>DAILY RAIN MAX</small><strong id="rideWeatherRainMax">--%</strong></article>
  </div>
  <a id="openLocalWeather" class="rideWeatherLink" href="https://weather.apple.com/" target="_blank" rel="noopener">OPEN LOCAL WEATHER</a>
  <p class="rideWeatherFoot">Forecast follows the phone’s current GPS position. Swipe right to return to ride metrics.</p>
</section>`}
function enhanceRideLive(){
  const body=$('#rideCenterBody');
  if(!body||!body.querySelector('#rideStop')||body.querySelector('#rideSwipeViewport'))return;
  const current=[...body.childNodes];
  const tabs=document.createElement('div');
  tabs.className='ridePageTabs';
  tabs.innerHTML='<button type="button" data-ride-page="0" class="active">RIDE</button><button type="button" data-ride-page="1">WEATHER</button>';
  const viewport=document.createElement('div');
  viewport.id='rideSwipeViewport';viewport.className='rideSwipeViewport';viewport.dataset.page='0';
  const track=document.createElement('div');track.id='rideSwipeTrack';track.className='rideSwipeTrack';
  const ride=document.createElement('section');ride.className='rideSwipePage rideDataPage';
  current.forEach(node=>ride.appendChild(node));
  const weather=document.createElement('section');weather.className='rideSwipePage';weather.innerHTML=weatherMarkup();
  track.append(ride,weather);viewport.appendChild(track);body.append(tabs,viewport);
  tabs.querySelectorAll('[data-ride-page]').forEach(b=>b.onclick=()=>showPage(Number(b.dataset.ridePage)));
  $('#refreshRideWeather').onclick=()=>refreshWeather(true);
  let startX=null;
  viewport.addEventListener('touchstart',e=>{startX=e.touches[0]?.clientX??null},{passive:true});
  viewport.addEventListener('touchend',e=>{if(startX===null)return;const dx=(e.changedTouches[0]?.clientX??startX)-startX;startX=null;if(Math.abs(dx)<45)return;showPage(dx<0?1:0)},{passive:true});
  refreshWeather(false);
}
async function fetchForecast(lat,lon){
  const params=new URLSearchParams({latitude:String(lat),longitude:String(lon),current:'temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,wind_direction_10m',daily:'sunrise,sunset,precipitation_probability_max',temperature_unit:'fahrenheit',wind_speed_unit:'mph',timezone:'auto',forecast_days:'1'});
  const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if(!response.ok)throw new Error(`Weather service returned ${response.status}`);
  return response.json();
}
function getPosition(force=false){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error('Location is not available.'));
    if(lastCoords&&!force)return resolve(lastCoords);
    navigator.geolocation.getCurrentPosition(p=>{lastCoords={latitude:p.coords.latitude,longitude:p.coords.longitude};resolve(lastCoords)},reject,{enableHighAccuracy:true,maximumAge:force?0:300000,timeout:15000});
  });
}
async function refreshWeather(force=false){
  if(loading)return;
  if(!force&&Date.now()-lastWeatherAt<10*60*1000)return;
  loading=true;setText('#rideWeatherStatus','Updating local weather…');
  try{
    const c=await getPosition(force),data=await fetchForecast(c.latitude,c.longitude),cur=data.current||{},daily=data.daily||{};
    const rain=Number(cur.precipitation_probability),temp=Number(cur.temperature_2m),humidity=Number(cur.relative_humidity_2m),wind=Number(cur.wind_speed_10m),dir=Number(cur.wind_direction_10m),rainMax=Number(daily.precipitation_probability_max?.[0]);
    setText('#rideWeatherTemp',Number.isFinite(temp)?`${Math.round(temp)}°`:'--°');
    setText('#rideWeatherRain',Number.isFinite(rain)?`${Math.round(rain)}% rain`:'--% rain');
    setText('#rideWeatherRainCard',Number.isFinite(rain)?`${Math.round(rain)}%`:'--%');
    setText('#rideWeatherHumidity',Number.isFinite(humidity)?`${Math.round(humidity)}%`:'--%');
    setText('#rideWeatherWind',Number.isFinite(wind)?`${Math.round(wind)} mph`:'-- mph');
    setText('#rideWeatherWindDir',Number.isFinite(dir)?`${cardinal(dir)} · ${Math.round(dir)}°`:'—');
    setText('#rideWeatherSunrise',localTime(daily.sunrise?.[0]));
    setText('#rideWeatherSunset',localTime(daily.sunset?.[0]));
    setText('#rideWeatherRainMax',Number.isFinite(rainMax)?`${Math.round(rainMax)}%`:'--%');
    setText('#rideWeatherUpdated',`Updated ${new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`);
    setText('#rideWeatherStatus','Live forecast for your current position');
    const link=$('#openLocalWeather');if(link)link.href=`https://weather.com/weather/today/l/${c.latitude},${c.longitude}`;
    lastWeatherAt=Date.now();
  }catch(error){setText('#rideWeatherStatus',`Weather unavailable: ${error.message||error}`)}finally{loading=false}
}
const observer=new MutationObserver(()=>queueMicrotask(enhanceRideLive));
observer.observe(document.body,{childList:true,subtree:true});
enhanceRideLive();
