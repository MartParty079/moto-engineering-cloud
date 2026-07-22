const ENDPOINTS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];
const ESTIMATED_MPH={motorway:70,motorway_link:45,trunk:65,trunk_link:45,primary:55,primary_link:40,secondary:45,secondary_link:35,tertiary:35,tertiary_link:30,residential:30,unclassified:30,living_street:15,service:15};
const toRad=value=>value*Math.PI/180;
const toDeg=value=>value*180/Math.PI;
const pretty=value=>value?String(value).replaceAll('_',' ').replace(/\b\w/g,char=>char.toUpperCase()):'Unknown';

function parseLimit(value){
  if(value===null||value===undefined||value==='')return null;
  const raw=String(value).trim(),number=Number.parseFloat(raw);
  if(!Number.isFinite(number))return null;
  const mph=/km\/?h|kph|kmph/i.test(raw)?number*.621371:number;
  return {display:`${Math.round(mph)} mph`,mph:Math.round(mph),raw};
}
function bearing(a,b){
  const p1=toRad(a.lat),p2=toRad(b.lat),deltaLon=toRad(b.lon-a.lon);
  return(toDeg(Math.atan2(Math.sin(deltaLon)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(deltaLon)))+360)%360;
}
function sample(items,max){
  if(items.length<=max)return items;
  const output=[];
  for(let index=0;index<max;index++)output.push(items[Math.round(index*(items.length-1)/(max-1))]);
  return output;
}
function normalizeCoordinates(input){
  return sample((Array.isArray(input)?input:[]).map(item=>({lon:Number(item?.[0]),lat:Number(item?.[1])})).filter(point=>Number.isFinite(point.lat)&&Number.isFinite(point.lon)&&Math.abs(point.lat)<=90&&Math.abs(point.lon)<=180),90);
}
function roadLimit(tags={}){
  const mapped=parseLimit(tags.maxspeed||tags['maxspeed:forward']||tags['maxspeed:backward']);
  if(mapped)return {limit:mapped,limitKind:'mapped',confidence:'High'};
  const estimate=ESTIMATED_MPH[tags.highway];
  if(estimate)return {limit:{display:`≈ ${estimate} mph`,mph:estimate,raw:null,estimated:true},limitKind:'estimated',confidence:'Low'};
  return {limit:null,limitKind:'unknown',confidence:'Unknown'};
}
async function timedFetch(url,options={},timeoutMs=18000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
}
function compactRecords(ways){
  const records=[],seen=new Set();
  for(const way of ways){
    const geometry=(way.geometry||[]).map(point=>({lat:Number(point.lat),lon:Number(point.lon)})).filter(point=>Number.isFinite(point.lat)&&Number.isFinite(point.lon));
    if(geometry.length<2)continue;
    const tags=way.tags||{},resolved=roadLimit(tags),step=Math.max(1,Math.ceil(geometry.length/28));
    for(let index=0;index<geometry.length;index+=step){
      const point=geometry[index],next=geometry[Math.min(geometry.length-1,index+1)]||geometry[Math.max(0,index-1)],heading=next&&next!==point?bearing(point,next):null;
      const key=`${point.lat.toFixed(4)}:${point.lon.toFixed(4)}:${Math.round((heading||0)/45)}:${way.id}`;
      if(seen.has(key))continue;seen.add(key);
      records.push({
        lat:point.lat,lon:point.lon,heading,
        payload:{
          status:'road',source:'OpenStreetMap · Offline route pack',road:tags.name||tags.ref||tags.destination||'Unnamed road',
          limit:resolved.limit,limitKind:resolved.limitKind,confidence:resolved.confidence,direction:'route corridor',
          type:pretty(tags.highway),surface:pretty(tags.surface),lanes:tags.lanes||'—',bearing:heading,
          cache:{persistent:true,maxAgeSeconds:2592000,offlineFallbackSeconds:15552000},
          diagnostic:`Downloaded from OpenStreetMap way ${way.id} for offline route matching.`
        }
      });
      if(records.length>=5000)return records;
    }
  }
  return records;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  const coordinates=normalizeCoordinates(req.body?.coordinates);
  if(coordinates.length<2)return res.status(400).json({error:'Route needs at least two valid coordinates'});
  const coordinateList=coordinates.map(point=>`${point.lat},${point.lon}`).join(',');
  const query=`[out:json][timeout:18];way(around:160,${coordinateList})[highway];out tags geom;`;
  const failures=[];
  for(const endpoint of ENDPOINTS){
    try{
      const response=await timedFetch(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8',accept:'application/json','user-agent':'MotoEngineeringCloud/1.4'},body:new URLSearchParams({data:query})});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json(),ways=(data.elements||[]).filter(element=>element.type==='way'&&element.tags?.highway),records=compactRecords(ways);
      return res.status(200).json({routeId:req.body?.routeId||null,name:req.body?.name||'Route',roadCount:ways.length,records,source:new URL(endpoint).hostname,attribution:'© OpenStreetMap contributors · ODbL 1.0'});
    }catch(error){failures.push(`${new URL(endpoint).hostname}: ${error.name==='AbortError'?'timeout':error.message}`)}
  }
  return res.status(502).json({error:'Offline route road scan failed',details:failures});
}
