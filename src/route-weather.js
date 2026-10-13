import { segmentMiles, validTrackPoint } from './gpx.js';

const HOUR = 3600000;
export function weatherTimeline(route, departure, mph = 35, count = 8) {
  if (!Number.isFinite(departure) || !Number.isFinite(mph) || mph < 1 || mph > 100) throw new Error('Choose a valid departure time and estimated speed (1–100 mph).');
  const legs = []; let miles = 0;
  for (const segment of route.segments) for (let i=1;i<segment.length;i++) {
    if (!validTrackPoint(segment[i-1]) || !validTrackPoint(segment[i])) throw new Error('Invalid route coordinates.');
    const length = segmentMiles([segment[i-1],segment[i]]);
    if (length > 0) {legs.push({a:segment[i-1],b:segment[i],start:miles,length});miles += length;}
  }
  if (!miles) throw new Error('A route with measurable distance is required.');
  const size = Math.max(1,Math.min(8,Math.trunc(count))),weight = miles / size;
  return Array.from({length:size},(_,i) => {
    const at = (i+.5)*weight,leg = legs.find(l => l.start+l.length >= at) || legs.at(-1),f = (at-leg.start)/leg.length;
    return {lat:leg.a.lat+(leg.b.lat-leg.a.lat)*f,lon:leg.a.lon+(leg.b.lon-leg.a.lon)*f,miles:at,weightMiles:weight,arrival:departure+at/mph*HOUR};
  });
}

const dateKey = (time, zone) => new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
function previousDates(now, zone) {
  const [y,m,d] = dateKey(now,zone).split('-').map(Number);
  return [1,2,3].map(offset => new Date(Date.UTC(y,m-1,d-offset)).toISOString().slice(0,10));
}
export function weatherAtArrival(sample, data, now = Date.now()) {
  const zone = data?.timezone;
  try {dateKey(now,zone || 'invalid')} catch {throw new Error('Weather response lacks a valid local timezone.');}
  const hourly = data.hourly,times = hourly?.time?.map(t => t*1000);
  if (!times?.length || times.some((t,i) => !Number.isFinite(t) || i && t<=times[i-1])) throw new Error('Invalid weather timeline.');
  // Provider precipitation values describe the preceding hour. Select the hour containing arrival.
  const index = times.findIndex(t => t>=sample.arrival && t-sample.arrival<HOUR);
  const value = (field,i) => {
    const n = hourly[field]?.[i];return typeof n === 'number' && Number.isFinite(n) && (!['precipitation','wind_speed_10m'].includes(field)||n>=0) ? n : null;
  };
  const daily = data.daily;
  const previousDays = previousDates(now,zone).map(date => {
    const i = daily?.time?.findIndex(t => dateKey(t*1000,zone)===date) ?? -1;
    const mm = i>=0 ? daily.precipitation_sum?.[i] : null;
    return {date,mm:typeof mm==='number' && Number.isFinite(mm) && mm>=0 ? mm : null};
  });
  // Partial boundary hours are prorated. Require every hour: missing rain is not zero rain.
  let rolling72 = 0,covered = 0;
  times.forEach((t,i) => {
    const overlap = Math.max(0,Math.min(t,now)-Math.max(t-HOUR,now-72*HOUR));
    if (!overlap) return;
    const rain = value('precipitation',i);
    if (rain!==null && rain>=0) {rolling72 += rain*overlap/HOUR;covered += overlap;}
  });
  const probability = index>=0 ? value('precipitation_probability',index) : null;
  return {...sample,timezone:zone,validAt:index>=0 ? times[index] : null,
    probability:probability!==null && probability>=0 && probability<=100 ? probability : null,
    amountMm:index>=0 ? value('precipitation',index) : null,
    windKph:index>=0 ? value('wind_speed_10m',index) : null,
    temperatureC:index>=0 ? value('temperature_2m',index) : null,
    previousDays,rolling72Mm:covered>=72*HOUR-1 ? rolling72 : null,
    historySource:'modelled/reanalysis estimate; not ground observations'};
}

export function rainCoverage(samples, thresholdMm = .1, probability = 50) {
  if (!Number.isFinite(thresholdMm) || thresholdMm<0 || !Number.isFinite(probability) || probability<0 || probability>100) throw new Error('Invalid rain thresholds.');
  let total=0,known=0,wet=0;
  for(const s of samples){total+=s.weightMiles;if(s.probability===null||s.amountMm===null)continue;known+=s.weightMiles;if(s.probability>=probability&&s.amountMm>=thresholdMm)wet+=s.weightMiles;}
  return {percent:total && Math.abs(known-total)<.000001 ? wet/total*100 : null,knownPercent:total ? known/total*100 : 0,definition:`Sampled route length with precipitation ≥${thresholdMm} mm and probability ≥${probability}% at estimated arrival`};
}

export function surfacePotential(sample, {surface='unknown', drainage='unknown', soil='unknown'} = {}) {
  const factors = [`72h rain: ${sample.rolling72Mm==null?'unknown':sample.rolling72Mm.toFixed(1)+' mm'}`,`surface: ${surface}`,`drainage: ${drainage}`,`soil: ${soil}`];
  if(surface!=='unpaved'||drainage==='unknown'||soil==='unknown'||sample.rolling72Mm==null||sample.temperatureC==null) return {mud:'unknown',dust:'unknown',confidence:'insufficient inputs',factors};
  const mud=sample.rolling72Mm>=20&&drainage==='poor'?'high':sample.rolling72Mm>=5?'moderate':'low';
  // Soil moisture/dry duration and ground observations are absent; zero rain cannot prove dust.
  return {mud,dust:'unknown',confidence:'low; uncalibrated estimate',factors};
}

export async function fetchRouteWeather(samples, fetcher = fetch) {
  const params = new URLSearchParams({latitude:samples.map(s=>s.lat.toFixed(4)).join(','),longitude:samples.map(s=>s.lon.toFixed(4)).join(','),hourly:'precipitation_probability,precipitation,temperature_2m,wind_speed_10m',daily:'precipitation_sum',past_days:'4',forecast_days:'7',timezone:'auto',timeformat:'unixtime'});
  const response=await fetcher(`https://api.open-meteo.com/v1/forecast?${params}`,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Weather unavailable (${response.status}).`);
  const data=await response.json(),locations=Array.isArray(data)?data:[data];
  if(locations.length!==samples.length)throw new Error('Incomplete route forecast.');
  const fetchedAt=Date.now();
  return {provider:'Open-Meteo',fetchedAt,issuedAt:null,resolution:'hourly; model-dependent spatial grid',samples:samples.map((s,i)=>weatherAtArrival(s,locations[i],fetchedAt))};
}
