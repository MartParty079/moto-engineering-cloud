const ENDPOINTS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];

const toRad=x=>x*Math.PI/180;
function miles(a,b){const R=3958.7613,dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon),q=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function pretty(value){return value?String(value).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()):'Unknown'}
function parseLimit(value){if(!value)return null;const raw=String(value).trim(),n=Number.parseFloat(raw);if(!Number.isFinite(n))return {display:raw,mph:null,raw};const mph=/km\/?h|kph/i.test(raw)?n*0.621371:n;return {display:`${Math.round(mph)} mph`,mph:Math.round(mph),raw}}
async function overpass(endpoint,query){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);try{const response=await fetch(endpoint,{method:'POST',signal:controller.signal,headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','accept':'application/json','user-agent':'MotoEngineeringCloud/1.0'},body:new URLSearchParams({data:query})});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json()}finally{clearTimeout(timer)}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=45, stale-while-revalidate=180');
  const lat=Number(req.query.lat),lon=Number(req.query.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return res.status(400).json({error:'Invalid coordinates'});
  const query=`[out:json][timeout:8];way(around:80,${lat},${lon})[highway];out tags center;`;
  const errors=[];
  for(const endpoint of ENDPOINTS){
    const source=new URL(endpoint).hostname;
    try{
      const data=await overpass(endpoint,query),ways=(data.elements||[]).filter(x=>x.type==='way'&&x.tags?.highway);
      if(!ways.length)return res.status(200).json({status:'no-road',source,diagnostic:'No mapped highway was returned within 80 meters.'});
      const picked=ways.map(way=>({way,distance:miles({lat,lon},{lat:way.center?.lat??lat,lon:way.center?.lon??lon})})).sort((a,b)=>a.distance-b.distance||Number(Boolean(b.way.tags.maxspeed))-Number(Boolean(a.way.tags.maxspeed)))[0];
      const tags=picked.way.tags||{};
      return res.status(200).json({status:'road',source,distance:picked.distance,road:tags.name||tags.ref||tags.destination||'Unnamed road',limit:parseLimit(tags.maxspeed),type:pretty(tags.highway),surface:pretty(tags.surface),lanes:tags.lanes||'—',diagnostic:tags.maxspeed?`Matched ${tags.highway} about ${Math.round(picked.distance*5280)} ft away. maxspeed=${tags.maxspeed}.`:`Matched ${tags.highway} about ${Math.round(picked.distance*5280)} ft away, but this road has no maxspeed tag.`});
    }catch(error){errors.push(`${source}: ${error.name==='AbortError'?'timeout':error.message}`)}
  }
  return res.status(502).json({error:'Road data providers unavailable',details:errors});
}
