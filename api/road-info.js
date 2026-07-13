const ENDPOINTS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];
const ESTIMATED_MPH={motorway:70,motorway_link:45,trunk:65,trunk_link:45,primary:55,primary_link:40,secondary:45,secondary_link:35,tertiary:35,tertiary_link:30,residential:30,unclassified:30,living_street:15,service:15};
const toRad=x=>x*Math.PI/180,toDeg=x=>x*180/Math.PI,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function miles(a,b){const R=3958.7613,dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon),q=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function pretty(value){return value?String(value).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()):'Unknown'}
function parseLimit(value){if(!value)return null;const raw=String(value).trim(),n=Number.parseFloat(raw);if(!Number.isFinite(n))return {display:raw,mph:null,raw};const mph=/km\/?h|kph/i.test(raw)?n*0.621371:n;return {display:`${Math.round(mph)} mph`,mph:Math.round(mph),raw}}
function angleDifference(a,b){if(!Number.isFinite(a)||!Number.isFinite(b))return null;return Math.abs(((a-b+540)%360)-180)}
function bearing(a,b){const p1=toRad(a.lat),p2=toRad(b.lat),dl=toRad(b.lon-a.lon);return (toDeg(Math.atan2(Math.sin(dl)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)))+360)%360}
function projectToSegment(p,a,b){const mean=toRad((a.lat+b.lat+p.lat)/3),kx=69.172*Math.cos(mean),ky=69.0,ax=a.lon*kx,ay=a.lat*ky,bx=b.lon*kx,by=b.lat*ky,px=p.lon*kx,py=p.lat*ky,dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy,t=len2?clamp(((px-ax)*dx+(py-ay)*dy)/len2,0,1):0,x=ax+t*dx,y=ay+t*dy;return {distance:Math.hypot(px-x,py-y),t,bearing:bearing(a,b)}}
function bestSegment(way,p){const g=Array.isArray(way.geometry)?way.geometry:[];let best=null;for(let i=1;i<g.length;i++){const hit=projectToSegment(p,g[i-1],g[i]);if(!best||hit.distance<best.distance)best=hit}if(best)return best;const c=way.center;return {distance:c?miles(p,{lat:c.lat,lon:c.lon}):Infinity,bearing:null,t:0}}
function estimateLimit(type){const mph=ESTIMATED_MPH[type];return mph?{display:`≈ ${mph} mph`,mph,raw:null,estimated:true}:null}
function selectLimit(tags,segmentBearing,heading,relations=[]){const forward=parseLimit(tags['maxspeed:forward']),backward=parseLimit(tags['maxspeed:backward']),general=parseLimit(tags.maxspeed);let chosen=null,direction='general';if(Number.isFinite(heading)&&Number.isFinite(segmentBearing)&&(forward||backward)){const f=angleDifference(heading,segmentBearing),b=angleDifference(heading,(segmentBearing+180)%360);if(f<=b&&forward){chosen=forward;direction='forward'}else if(backward){chosen=backward;direction='backward'}else if(forward){chosen=forward;direction='forward'}}if(!chosen&&general)chosen=general;if(chosen)return {limit:chosen,kind:'mapped',confidence:'High',direction};for(const rel of relations){const value=rel.tags?.maxspeed||rel.tags?.['maxspeed:forward']||rel.tags?.['maxspeed:backward'];const parsed=parseLimit(value);if(parsed)return {limit:parsed,kind:'relation',confidence:'Medium',direction:'route relation'}}const estimated=estimateLimit(tags.highway);return estimated?{limit:estimated,kind:'estimated',confidence:'Low',direction:'road-class estimate'}:{limit:null,kind:'unknown',confidence:'Unknown',direction:'none'}}
async function overpass(endpoint,query){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);try{const response=await fetch(endpoint,{method:'POST',signal:controller.signal,headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','accept':'application/json','user-agent':'MotoEngineeringCloud/1.1'},body:new URLSearchParams({data:query})});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json()}finally{clearTimeout(timer)}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=120');
  const lat=Number(req.query.lat),lon=Number(req.query.lon),heading=Number(req.query.heading),speed=Number(req.query.speed);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return res.status(400).json({error:'Invalid coordinates'});
  const query=`[out:json][timeout:10];way(around:100,${lat},${lon})[highway]->.roads;(.roads;rel(bw.roads)[route=road];);out tags center geom;`;
  const errors=[];
  for(const endpoint of ENDPOINTS){
    const source=new URL(endpoint).hostname;
    try{
      const data=await overpass(endpoint,query),elements=data.elements||[],ways=elements.filter(x=>x.type==='way'&&x.tags?.highway),relations=elements.filter(x=>x.type==='relation');
      if(!ways.length)return res.status(200).json({status:'no-road',source,confidence:'Unknown',diagnostic:'No mapped highway was returned within 100 meters.'});
      const p={lat,lon};
      const ranked=ways.map(way=>{const segment=bestSegment(way,p),diff=angleDifference(heading,segment.bearing),headingPenalty=Number.isFinite(diff)&&Number.isFinite(speed)&&speed>4?Math.min(diff,90)/90*0.035:0,classPenalty=['service','track','path','footway','cycleway'].includes(way.tags.highway)?0.012:0;return {way,segment,score:segment.distance+headingPenalty+classPenalty,diff}}).sort((a,b)=>a.score-b.score);
      const picked=ranked[0],tags=picked.way.tags||{},routeRelations=relations.filter(r=>r.members?.some?.(m=>m.ref===picked.way.id));
      const resolved=selectLimit(tags,picked.segment.bearing,Number.isFinite(heading)?heading:null,routeRelations);
      const road=tags.name||tags.ref||tags.destination||'Unnamed road',feet=Math.round(picked.segment.distance*5280),bearingText=Number.isFinite(picked.segment.bearing)?`${Math.round(picked.segment.bearing)}°`:'unknown';
      const diagnostic=[`Matched ${tags.highway} about ${feet} ft away`,Number.isFinite(picked.diff)?`heading difference ${Math.round(picked.diff)}°`:'heading unavailable',`segment bearing ${bearingText}`,resolved.kind==='mapped'?`${resolved.direction} speed tag ${resolved.limit.raw}`:resolved.kind==='relation'?`route relation speed ${resolved.limit.raw}`:resolved.kind==='estimated'?`estimated from ${tags.highway} classification`:'no mapped or estimated limit'].join(' · ')+'.';
      return res.status(200).json({status:'road',source,distance:picked.segment.distance,road,limit:resolved.limit,limitKind:resolved.kind,confidence:resolved.confidence,direction:resolved.direction,type:pretty(tags.highway),surface:pretty(tags.surface),lanes:tags.lanes||'—',bearing:picked.segment.bearing,headingDifference:picked.diff,diagnostic});
    }catch(error){errors.push(`${source}: ${error.name==='AbortError'?'timeout':error.message}`)}
  }
  return res.status(502).json({error:'Road data providers unavailable',details:errors});
}