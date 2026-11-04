import {mountSegments,metricCard,escapeUI as esc} from './ui-components.js';
import {missionStore} from './rider-preferences.js';
import {routeOwner,localRoutes} from './route-library.js';
import {mountRouteWeather} from './route-weather-ui.js';
import {fetchRouteWeather,reserveWeatherBudget,weatherCondition} from './route-weather.js';

const $=(s,root)=>root.querySelector(s);
export async function mountWeatherWorkspace(main,body){
  const owner=await routeOwner();if(!main.isConnected)return;
  let units='imperial',snapshot=await missionStore.get(owner,'weather-location');
  const current=async()=>main.isConnected&&await routeOwner()===owner;
  if(!await current())return;
  const lifecycle=new AbortController(),{signal}=lifecycle;
  body.innerHTML=`<section data-pane="now"><article class="card"><h3>Weather at your location</h3><p>Hourly model estimate, not a live observation. Fetch uses your coordinates. No background polling.</p><button type="button" data-weather-here class="primary">Use current location</button></article><div data-location-weather></div></section>
    <section data-pane="route" hidden><article class="card"><h3>Along a saved route</h3><label>Route<select data-weather-route><option value="">Choose saved GPX</option></select></label><p>Forecasts use estimated arrival times. Radar imagery is not a future prediction.</p><button type="button" data-route-list-refresh>Refresh route list</button></article><div data-weather-route-detail></div></section>
    <section data-pane="area" hidden><article class="card"><h3>Inspect an area</h3><form data-weather-area><div class="missionFormGrid"><label>Latitude<input name="lat" type="number" step="any" min="-90" max="90" required></label><label>Longitude<input name="lon" type="number" step="any" min="-180" max="180" required></label></div><button class="primary" type="submit">Fetch area forecast</button></form></article><div data-area-weather></div></section>
    <p role="status" data-weather-workspace-status></p><details class="card"><summary>Radar & ground conditions</summary><div class="actions"><button type="button" data-weather-radar>Open radar map</button></div><section data-radar-container hidden><div class="actions"><button type="button" data-radar-refresh>Load latest past frame</button><button type="button" data-radar-stop>Hide radar</button><button type="button" data-radar-fullscreen aria-label="Toggle fullscreen radar">⛶</button></div><p data-radar-status role="status">No radar frame loaded.</p><div class="mmWeatherRadarStage"><div class="mmMapViewport" data-weather-map></div></div></section><p>Past radar imagery is not a forecast. Frame generation time may differ from individual radar observation times. Free public imagery is low resolution and online only.</p><p>Rain totals below are modeled estimates for the previous 24, 48 and 72 hours. Mud needs surface/drainage/soil inputs; dust remains unknown without moisture and ground evidence. Use Route for the existing caveated surface model.</p></details>`;
  const status=$('[data-weather-workspace-status]',body);
  mountSegments($('[data-workspace-modes]',main),[['now','Now'],['route','Route'],['area','Area']],mode=>{main.dataset.mode=mode;body.querySelectorAll('[data-pane]').forEach(pane=>{pane.hidden=pane.dataset.pane!==mode;});if(mode==='route')void listRoutes();});
  main.dataset.mode='now';
  const radar=$('[data-radar-container]',body),radarHost=$('[data-weather-map]',body),radarStatus=$('[data-radar-status]',body);
  $('[data-weather-radar]',body).onclick=async()=>{radar.hidden=false;try{await window.MotoMapWorkspace?.mount?.(radarHost);window.MotoMapWorkspace?.resize?.();}catch(error){radarStatus.textContent=error.message;}};
  $('[data-radar-refresh]',body).onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{if(!await current())return;await window.MotoMapWorkspace?.mount?.(radarHost);const result=await window.MotoRideOS3?.setWeatherRadar?.(true,{quiet:true});radarStatus.textContent=result?.enabled?`Past radar frame generated ${new Date(result.time).toLocaleString()} · ${result.ageMinutes} min old${result.partial?' · some tiles unavailable':''} · not a forecast`:result?.error||'Radar integration is loading.';}finally{button.disabled=false;}};
  $('[data-radar-stop]',body).onclick=()=>{void window.MotoRideOS3?.setWeatherRadar?.(false);radar.hidden=true;radar.classList.remove('mmRadarFullscreen');};
  $('[data-radar-fullscreen]',body).onclick=async()=>{
    const dialog=document.createElement('dialog');dialog.id='missionRadarFullscreen';dialog.className='mmRadarFullscreen mmRadarDialog';
    dialog.innerHTML='<header><strong>Radar · past imagery</strong><button type="button" data-close aria-label="Close fullscreen radar">×</button></header><p data-frame-label></p><div class="mmWeatherRadarStage"><div class="mmMapViewport" data-fullscreen-map></div></div>';
    $('[data-frame-label]',dialog).textContent=radarStatus.textContent;document.body.appendChild(dialog);
    $('[data-close]',dialog).onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{if(!main.isConnected){dialog.remove();return;}const target=window.MotoWorkspace?.getView()==='dashboard'?document.querySelector('#missionMapViewport'):radarHost;const overlay=dialog.querySelector('#adventureOverlay');if(target&&overlay)target.replaceChildren(overlay);dialog.remove();void window.MotoMapWorkspace?.mount?.(target);},{once:true});
    dialog.showModal();await window.MotoMapWorkspace?.mount?.($('[data-fullscreen-map]',dialog));window.MotoMapWorkspace?.resize?.();
  };
  window.addEventListener('moto-workspace-change',event=>{if(event.detail.view==='weather'&&!radar.hidden)void window.MotoMapWorkspace?.mount?.(radarHost);if(event.detail.view!=='weather')document.querySelector('#missionRadarFullscreen')?.close();},{signal});
  window.addEventListener('moto-workspaces-reset',()=>{document.querySelector('#missionRadarFullscreen')?.close();lifecycle.abort();},{once:true,signal});
  const display=(host,saved)=>{
    if(!saved)return;const sample=saved.samples[0];
    const temp=value=>value==null?'—':`${Math.round(units==='metric'?value:value*9/5+32)}°${units==='metric'?'C':'F'}`;
    const wind=value=>value==null?'—':(units==='metric'?value:value/1.609344).toFixed(0);
    host.innerHTML=`<article class="card"><p>${esc(saved.label)} · fetched ${esc(new Date(saved.fetchedAt).toLocaleString())}</p><p>Hourly forecast valid ${sample.validAt?esc(new Date(sample.validAt).toLocaleString()):'time unavailable'} · cached age ${Math.max(0,Math.round((Date.now()-saved.fetchedAt)/60000))} min</p><div class="mmMetricGrid">${metricCard('Temperature',temp(sample.temperatureC))}${metricCard('Rain probability',sample.probability==null?'—':sample.probability,'%')}${metricCard('Wind',wind(sample.windKph),units==='metric'?'km/h':'mph')}${metricCard('Gusts',wind(sample.gustKph),units==='metric'?'km/h':'mph')}${metricCard('Wind direction',sample.windDirection??'—','°')}</div><p>${weatherCondition(sample.weatherCode)} · High ${temp(sample.highC)} / Low ${temp(sample.lowC)}. Missing values stay unknown.</p></article><details class="card" open><summary>Previous rainfall · model estimates</summary><div class="mmMetricGrid">${[24,48,72].map(hours=>metricCard(`${hours} hours`,sample[`rolling${hours}Mm`]==null?'—':sample[`rolling${hours}Mm`].toFixed(1),'mm')).join('')}</div><p>Mud risk: unknown here · Dust risk: unknown. These are modeled/reanalysis rainfall estimates, not actual ground observations.</p></details><details class="card"><summary>Next 12 hours</summary><div class="mmHourly">${(sample.hourly||[]).map(hour=>`<div><b>${esc(new Date(hour.time).toLocaleTimeString([],{hour:'numeric'}))}</b><span>${temp(hour.temperatureC)}</span><small>${hour.probability==null?'—':hour.probability+'%'} rain</small></div>`).join('')||'<p>Hourly data unavailable.</p>'}</div></details><p><a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo · CC BY 4.0</a> · Free non-commercial beta · No paid fallback</p>`;
  };
  display($('[data-location-weather]',body),snapshot);
  async function listRoutes(){try{if(!await current())return;const select=$('[data-weather-route]',body),selected=select.value,routes=await localRoutes.list(owner);if(!await current())return;select.innerHTML='<option value="">Choose saved GPX</option>'+routes.map(route=>`<option value="${esc(route.id)}">${esc(route.name)}</option>`).join('');select.value=selected;}catch(error){status.textContent=error.message;}}
  $('[data-route-list-refresh]',body).onclick=listRoutes;
  $('[data-weather-route]',body).onchange=async event=>{try{if(!await current())return;const id=event.target.value,host=$('[data-weather-route-detail]',body);if(!id){host.replaceChildren();return;}const route=await localRoutes.get(owner,id);if(!await current())return;await mountRouteWeather(host,route,current);}catch(error){status.textContent=error.message;}};
  async function fetchAt(lat,lon,host,label){
    if(!Number.isFinite(lat)||lat<-90||lat>90||!Number.isFinite(lon)||lon<-180||lon>180)throw new Error('Enter valid coordinates.');
    if(!await current())return;
    await reserveWeatherBudget(missionStore,1);
    status.textContent='Fetching hourly weather estimate…';
    const next={...await fetchRouteWeather([{lat,lon,arrival:Date.now(),weightMiles:1}]),label};
    if(!await current())return;await missionStore.put(owner,'weather-location',next);snapshot=next;display(host,next);status.textContent='Forecast saved. Ground conditions remain estimates.';
  }
  $('[data-weather-here]',body).onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{if(!navigator.geolocation)throw new Error('Location is unavailable.');const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,maximumAge:60000,timeout:15000}));await fetchAt(position.coords.latitude,position.coords.longitude,$('[data-location-weather]',body),'Phone location');}catch(error){status.textContent=`${error.message} ${snapshot?'Last saved estimate retained.':''}`;}finally{button.disabled=false;}};
  $('[data-weather-area]',body).onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=$('button',form);button.disabled=true;try{const values=new FormData(form);if(!values.get('lat')||!values.get('lon'))throw new Error('Latitude and longitude are required.');await fetchAt(Number(values.get('lat')),Number(values.get('lon')),$('[data-area-weather]',body),'Selected area');}catch(error){status.textContent=`${error.message} Last saved estimate retained.`;}finally{button.disabled=false;}};
  window.addEventListener('moto-interface-preferences',event=>{units=event.detail.units;if(main.isConnected)display($('[data-location-weather]',body),snapshot);},{signal});
  try{const prefs=await missionStore.get(owner,'interface');units=prefs?.units||'imperial';if(await current())display($('[data-location-weather]',body),snapshot);}catch{}
  await listRoutes();
}
