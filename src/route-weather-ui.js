import {riderPreferences} from './rider-preferences.js';
import {supabase} from './supabase.js';
import {MissionStore} from './mission-store.js';
import {routeOwner} from './route-library.js';
import {weatherTimeline,fetchRouteWeather,rainCoverage,surfacePotential} from './route-weather.js';

const store=new MissionStore(supabase.supabaseUrl||location.origin);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
export async function mountRouteWeather(host,route,isCurrent) {
  const owner=await routeOwner();if(!await isCurrent())return;
  const prefs=await riderPreferences(owner);const key=`weather:${route.id}`,cached=await store.get(owner,key);if(!await isCurrent())return;
  const local=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  host.innerHTML=`<article class="card"><h3>Weather along ${esc(route.name)}</h3><p>Eight locations sampled at estimated arrival time. Timing assumes constant speed, excludes stops and disconnected track gaps. Forecast grids do not establish exact rain boundaries.</p><form data-weather-form><div class="missionFormGrid"><label>Departure<input name="departure" type="datetime-local" value="${local}" required/></label><label>Estimated travel speed (mph)<input name="speed" type="number" min="1" max="100" value="35" required/></label><label>Rain probability threshold (%)<input name="probability" type="number" min="0" max="100" value="50" required/></label><label>Rain amount threshold (mm/h)<input name="rain" type="number" min="0" step="0.1" value="0.1" required/></label><label>Surface<select name="surface"><option value="unknown">Unknown</option><option value="paved">Paved</option><option value="unpaved">Unpaved</option></select></label><label>Drainage<select name="drainage"><option value="unknown">Unknown</option><option value="good">Good</option><option value="poor">Poor</option></select></label><label>Soil<select name="soil"><option value="unknown">Unknown</option><option value="clay">Clay</option><option value="sand">Sand</option></select></label></div><button class="primary" type="submit">Fetch route forecast</button></form><p data-weather-status role="status"></p><div data-weather-result></div><p><a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather by Open-Meteo · CC BY 4.0</a>. Free API for non-commercial beta use. Coordinates are sent only when you fetch. No paid fallback.</p></article>`;
  const status=host.querySelector('[data-weather-status]'),result=host.querySelector('[data-weather-result]'),form=host.querySelector('form');let snapshot=cached;
  const display=()=>{
    if(!snapshot)return;
    const values=new FormData(form),coverage=rainCoverage(snapshot.samples,Number(values.get('rain')),Number(values.get('probability')));
    const age=Math.max(0,Math.floor((Date.now()-snapshot.fetchedAt)/60000));
    result.innerHTML=`<h4>${age>30?'STALE cached forecast':'Cached forecast'} · fetched ${esc(new Date(snapshot.fetchedAt).toLocaleString())} (${age} min ago)</h4><p>Departure: ${esc(new Date(snapshot.departure).toLocaleString())} · ${snapshot.speed} mph assumption. ${esc(snapshot.resolution)}. Provider issue time unavailable. Forecast uncertainty increases with distance/time and grid resolution.</p>${prefs.weatherAlerts&&coverage.percent>0?'<p role="status">Route rain notice: one or more sampled locations meet your thresholds. Review timing and uncertainty before departure.</p>':''}<p>${coverage.percent==null?'Unknown':coverage.percent.toFixed(0)+'%'} projected rain coverage · ${coverage.knownPercent.toFixed(0)}% sampled coverage known</p><p>${esc(coverage.definition)}. Approximate sampled estimate, not measured rain area.</p><div class="missionWeatherScroll"><table><thead><tr><th>Route / arrival</th><th>Forecast</th><th>Previous full local days</th><th>Rolling 72h</th><th>Surface potential</th></tr></thead><tbody>${snapshot.samples.map(s=>{const risk=surfacePotential(s,Object.fromEntries(values));return `<tr><td>${s.miles.toFixed(1)} mi<br>${esc(new Date(s.arrival).toLocaleString())}<br>${esc(s.timezone)}</td><td>${s.probability==null?'Unknown':s.probability+'%'} rain<br>${s.amountMm==null?'Unknown':s.amountMm+' mm/h'}<br>${s.windKph==null?'Unknown':s.windKph+' km/h wind'}<br>${s.temperatureC==null?'Unknown':s.temperatureC+' °C'}</td><td>${s.previousDays.map(d=>`${esc(d.date)}: ${d.mm==null?'Unknown':d.mm.toFixed(1)+' mm'}`).join('<br>')}</td><td>${s.rolling72Mm==null?'Unavailable':s.rolling72Mm.toFixed(1)+' mm'}<br>Partial hours prorated</td><td>Mud: ${risk.mud}<br>Dust: ${risk.dust}<br>${esc(risk.confidence)}<br>${risk.factors.map(esc).join('<br>')}</td></tr>`}).join('')}</tbody></table></div><p>Rain history is modelled/reanalysis, not observed ground rainfall. Dust remains unknown without dry duration, soil moisture and ground conditions. No riding-speed recommendation is made.</p>`;
  };
  if(cached){status.textContent='Last saved forecast retained. Fetch to update its departure/time assumptions.';display();}
  form.onchange=()=>{try{display()}catch(error){status.textContent=error.message}};
  form.onsubmit=async event=>{
    event.preventDefault();const submit=form.querySelector('button');submit.disabled=true;
    try{
      if(!await isCurrent()||!host.isConnected)return;
      if(window.MotoRide?.getState?.().active)throw new Error('Prepare route weather before recording.');
      const values=new FormData(form),departure=new Date(values.get('departure')).getTime(),speed=Number(values.get('speed'));
      if(departure<Date.now()-3600000||departure>Date.now()+6*86400000)throw new Error('Choose departure within the next six days.');
      const samples=weatherTimeline(route,departure,speed),day=new Date().toISOString().slice(0,10);
      // Atomic per-device reservation counts failures too. This is not a cross-device project quota.
      await store.update('device',`weather-budget:${day}`,used=>{used=Number(used)||0;if(used+samples.length>96)throw new Error('This device’s daily route-weather allowance is exhausted. Cached forecasts remain available.');return used+samples.length});
      if(!await isCurrent()||!host.isConnected)return;
      status.textContent='Fetching arrival-time forecasts…';
      const fetched=await fetchRouteWeather(samples);
      if(!await isCurrent()||!host.isConnected)return;
      snapshot={...fetched,departure,speed};await store.put(owner,key,snapshot);status.textContent='Forecast saved on this device. Refresh after a reroute or ETA change.';display();
    }catch(error){if(host.isConnected){status.textContent=`${error.message} ${snapshot?'Last saved forecast retained; live update unavailable.':''}`;display();}}finally{if(submit.isConnected)submit.disabled=false}
  };
}
