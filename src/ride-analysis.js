import {validTrackPoint,segmentMiles} from './gpx.js';

export function analyzeRide(rows,{toleranceMph=3,interruptions=[]}={}) {
  if(!Number.isFinite(toleranceMph)||toleranceMph<0||toleranceMph>30)throw new Error('Speeding tolerance must be 0–30 mph.');
  const points=[],events=[],segments=[];let segment=[],previous=null,lastTime=-Infinity,distanceMiles=0,weightedSpeed=0,knownSeconds=0,movingSeconds=0,maxSpeedMph=null,invalidGPS=0,unknownLimitSeconds=0,speedingSeconds=0;
  for(const row of rows){
    const time=Date.parse(row.recorded_at);if(!Number.isFinite(time)||time<lastTime)throw new Error('Ride timeline is invalid or out of order.');lastTime=time;
    if(row.latitude==null&&row.longitude==null)continue;
    const point={lat:row.latitude,lon:row.longitude,time,speedMph:Number.isFinite(row.speed_mps)&&row.speed_mps>=0&&row.speed_mps<=250/2.236936?row.speed_mps*2.236936:null,accuracy:Number.isFinite(row.accuracy_m)&&row.accuracy_m>=0?row.accuracy_m:null,elevation:Number.isFinite(row.altitude_m)?row.altitude_m:null};
    if(!validTrackPoint(point)){invalidGPS++;previous=null;if(segment.length)segments.push(segment);segment=[];continue;}
    const seconds=previous?(time-previous.time)/1000:0,gap=seconds>30||previous&&interruptions.some(i=>previous.time<=i.from&&time>=i.to);
    if(gap){events.push({type:'Capture gap',time:previous.time,end:time,confidence:'recorded interval',index:points.length});if(segment.length)segments.push(segment);segment=[];}
    if(previous&&!gap&&seconds>0){
      if(point.accuracy!==null&&previous.accuracy!==null&&point.accuracy<=80&&previous.accuracy<=80){const miles=segmentMiles([previous,point]);if(miles<.5)distanceMiles+=miles;}
      if(point.speedMph!==null&&previous.speedMph!==null){weightedSpeed+=(point.speedMph+previous.speedMph)/2*seconds;knownSeconds+=seconds;if((point.speedMph+previous.speedMph)/2>1)movingSeconds+=seconds;}
      // A current lookup cannot be substituted for a historical matched speed limit.
      const limit=row.matched_limit_mph,trusted=Number.isFinite(limit)&&limit>0&&limit<=150&&row.limit_confidence==='high'&&Boolean(row.limit_provider)&&row.limit_valid_at&&Math.abs(time-Date.parse(row.limit_valid_at))<=30000;
      if(!trusted)unknownLimitSeconds+=seconds;
      else if(point.speedMph!==null&&point.speedMph>limit+toleranceMph){speedingSeconds+=seconds;events.push({type:'Above recorded matched limit',time,index:points.length,confidence:'matched high-confidence limit',limitMph:limit,speedMph:point.speedMph});}
    }
    if(point.speedMph!==null)maxSpeedMph=Math.max(maxSpeedMph??0,point.speedMph);
    points.push(point);segment.push(point);previous=point;
  }
  if(segment.length)segments.push(segment);
  return {points,segments,events,summary:{version:1,sampleCount:rows.length,gpsCount:points.length,invalidGPS,distanceMiles,knownSpeedSeconds:knownSeconds,averageSpeedMph:knownSeconds?weightedSpeed/knownSeconds:null,maxSpeedMph,movingSeconds,unknownLimitSeconds,speedingSeconds,lean:'unavailable without persisted source/calibration/quality metadata'}};
}

export function compactTrace(segments,maxPoints=250) {
  const count=segments.reduce((n,s)=>n+s.length,0),stride=Math.max(1,Math.ceil(count/maxPoints));
  return segments.map(s=>s.filter((p,i)=>i===0||i===s.length-1||i%stride===0).map(p=>({lat:p.lat,lon:p.lon,time:p.time})));
}

export function reduceReviewCache(entries,keep=10) {
  if(!Number.isInteger(keep)||keep<1||keep>100)throw new Error('Detailed ride retention must be 1–100.');
  const sorted=[...entries].sort((a,b)=>b.startedAt-a.startedAt);
  return sorted.map((entry,index)=>{
    if(index<keep||entry.pinned||entry.detail!=='full')return entry;
    if(!entry.summary||entry.summary.invalidGPS||entry.summary.sampleCount!==entry.rows?.length||!entry.backupConfirmed)return entry;
    return {...entry,detail:'compact',rows:undefined,trace:compactTrace(entry.trace),reducedAt:Date.now()};
  });
}
