const finite = Number.isFinite;
let lean = null, road = null;
export function setReviewLean(value, at = Date.now()) { lean = finite(value) ? { value, at } : null; }
export function setReviewRoad(data, label, at = Date.now()) {
  road = data && label !== 'Last known' && finite(Number(data.limit)) && Number(data.limit) > 0
    ? { limit: Number(data.limit), source: data.source, cached: Boolean(data.cachedAt), at } : null;
}
export function reviewContext(at = Date.now()) {
  return { lean: lean && at >= lean.at && at-lean.at <= 2000 ? lean.value : null,
    road: road && at >= road.at && at-road.at <= 5000 ? { ...road } : null };
}
export function clearReviewContext() { lean = null; road = null; }
export function reviewStats(rows) {
  let speedSum=0,speeds=0,maxSpeed=null,left=null,right=null,leanCount=0,checked=0,over=0,maxOver=null,coveredSeconds=0,overSeconds=0;
  let minAltitude=null,maxAltitude=null;
  rows.forEach((p,i)=>{
    const mph=finite(p.speed_mps)?p.speed_mps*2.236936:null;
    if(mph!==null){speedSum+=mph;speeds++;maxSpeed=Math.max(maxSpeed??0,mph);}
    if(finite(p.lean_estimate_deg)){leanCount++;left=Math.max(left??0,-p.lean_estimate_deg);right=Math.max(right??0,p.lean_estimate_deg);}
    if(finite(p.altitude_m)){minAltitude=Math.min(minAltitude??Infinity,p.altitude_m);maxAltitude=Math.max(maxAltitude??-Infinity,p.altitude_m);}
    const usable=mph!==null&&finite(p.limit_mph)&&p.limit_mph>0&&finite(p.accuracy_m)&&p.accuracy_m<=40;
    if(usable){checked++;const excess=mph-p.limit_mph;if(excess>0){over++;maxOver=Math.max(maxOver??0,excess);}}
    const prev=rows[i-1],dt=prev?(Date.parse(p.recorded_at)-Date.parse(prev.recorded_at))/1000:0;
    if(usable&&prev&&prev.segment===p.segment&&dt>0&&dt<=5&&finite(prev.speed_mps)&&finite(prev.accuracy_m)&&prev.accuracy_m<=40&&prev.limit_mph===p.limit_mph){coveredSeconds+=dt;if(mph>p.limit_mph&&prev.speed_mps*2.236936>p.limit_mph)overSeconds+=dt;}
  });
  return {average:speeds?speedSum/speeds:null,maxSpeed,left,right,leanCount,checked,over,maxOver,coveredSeconds,overSeconds,minAltitude,maxAltitude};
}
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function rideGpx(name, rows) {
  const segments=[];let segment=[],previous=null;
  for(const p of rows){
    if(!finite(p.latitude)||!finite(p.longitude)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180||!finite(Date.parse(p.recorded_at))){previous=null;if(segment.length)segments.push(segment);segment=[];continue;}
    if(previous&&(p.segment!==previous.segment||Date.parse(p.recorded_at)-Date.parse(previous.recorded_at)>10000)){if(segment.length)segments.push(segment);segment=[];}
    segment.push(`<trkpt lat="${p.latitude}" lon="${p.longitude}">${finite(p.altitude_m)?`<ele>${p.altitude_m}</ele>`:''}<time>${escape(p.recorded_at)}</time></trkpt>`);previous=p;
  }
  if(segment.length)segments.push(segment);
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Moto Mission" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${escape(name)}</name>${segments.map(s=>`<trkseg>${s.join('')}</trkseg>`).join('')}</trk></gpx>`;
}
