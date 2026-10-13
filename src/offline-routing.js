import {segmentMiles,validTrackPoint} from './gpx.js';

const allowed=new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','living_street','service','track']);
const blocked=value=>['no','private','destination','customers','delivery','agricultural','forestry','permit'].includes(value);
export function osmGraph(data,bounds) {
  if(!Array.isArray(data?.elements)||data.elements.length>100000)throw new Error('OSM region is invalid or exceeds the beta size limit.');
  const nodes=new Map(data.elements.filter(e=>e.type==='node' && !e.tags?.barrier && !blocked(e.tags?.motorcycle||e.tags?.motor_vehicle||e.tags?.access)).map(e=>[String(e.id),{id:String(e.id),lat:e.lat,lon:e.lon}]));
  if([...nodes.values()].some(n=>!validTrackPoint(n)))throw new Error('Invalid OSM coordinates.');
  const edges=[],ways=new Set();
  for(const way of data.elements.filter(e=>e.type==='way')){
    const tags=way.tags||{},access=tags.motorcycle||tags.motor_vehicle||tags.vehicle||tags.access;
    if(!allowed.has(tags.highway)||blocked(access)||tags.area==='yes'||Object.keys(tags).some(k=>k.includes('conditional'))||tags.highway==='construction')continue;
    if(!Array.isArray(way.nodes)||way.nodes.some(id=>!nodes.has(String(id))))continue;
    ways.add(String(way.id));
    const oneWay=tags['oneway:motorcycle']||tags.oneway||(tags.junction==='roundabout'?'yes':'no');
    for(let i=1;i<way.nodes.length;i++){
      const from=String(way.nodes[i-1]),to=String(way.nodes[i]),miles=segmentMiles([nodes.get(from),nodes.get(to)]);
      if(miles<=0||[nodes.get(from),nodes.get(to)].some(n=>n.lat<bounds[0]||n.lat>bounds[2]||n.lon<bounds[1]||n.lon>bounds[3]))continue;
      const base={way:String(way.id),miles,name:tags.name||tags.ref||'Unnamed road',highway:tags.highway,surface:tags.surface||'unknown',toll:tags.toll==='yes'};
      if(oneWay!=='-1')edges.push({...base,from,to});
      if(!['yes','1','true'].includes(oneWay))edges.push({...base,from:to,to:from});
    }
  }
  const restrictions=[];
  for(const relation of data.elements.filter(e=>e.type==='relation'&&e.tags?.type==='restriction')){
    if(relation.tags.except?.split(';').includes('motorcycle'))continue;
    const from=relation.members?.find(m=>m.role==='from'),to=relation.members?.find(m=>m.role==='to'),via=relation.members?.filter(m=>m.role==='via');
    const rule=relation.tags['restriction:motorcycle']||relation.tags.restriction;
    if(!from||!to||!ways.has(String(from.ref)))continue;
    // Via-way and conditional turn restrictions need a larger state machine. Exclude their from-way, conservatively.
    if(via?.length!==1||via[0].type!=='node'||!rule||Object.keys(relation.tags).some(k=>k.includes('conditional'))){
      for(let i=edges.length-1;i>=0;i--)if(edges[i].way===String(from.ref))edges.splice(i,1);
      continue;
    }
    restrictions.push({from:String(from.ref),to:String(to.ref),via:String(via[0].ref),only:rule.startsWith('only_')});
  }
  const used=new Set(edges.flatMap(e=>[e.from,e.to]));
  if(!edges.length)throw new Error('No supported public motorcycle road network was returned.');
  return {version:1,bounds,nodes:[...nodes.values()].filter(n=>used.has(n.id)),edges,restrictions,attribution:'© OpenStreetMap contributors · ODbL',createdAt:Date.now()};
}

export function regionBounds(center,radiusKm) {
  if(!validTrackPoint(center)||!Number.isFinite(radiusKm)||radiusKm<.25||radiusKm>2||Math.abs(center.lat)>80)throw new Error('Choose a center below 80° latitude and radius between 0.25 and 2 km.');
  const lat=radiusKm/111.32,lon=lat/Math.cos(center.lat*Math.PI/180);
  if(Math.abs(center.lon)+lon>180)throw new Error('Regions crossing the date line are unsupported.');
  return [center.lat-lat,center.lon-lon,center.lat+lat,center.lon+lon];
}
export async function downloadOSMRegion(center,radiusKm,fetcher=fetch) {
  const bounds=regionBounds(center,radiusKm),bbox=bounds.map(n=>n.toFixed(6)).join(',');
  const query=`[out:json][timeout:25][maxsize:16777216];way[highway](${bbox})->.roads;(.roads;relation(bw.roads)[type=restriction];);(._;>;);out body;`;
  const response=await fetcher('https://overpass-api.de/api/interpreter',{method:'POST',body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`OSM download unavailable (${response.status}).`);
  const content=await response.text();if(content.length>16*1024*1024)throw new Error('Region exceeds 16 MB. Choose a smaller area.');
  const data=JSON.parse(content);if(data.remark)throw new Error('OSM returned incomplete data. Choose a smaller area or retry later.');
  return osmGraph(data,bounds);
}

class Queue {
  constructor(){this.items=[];}
  push(value){const a=this.items;a.push(value);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].cost<=value.cost)break;a[i]=a[p];i=p;}a[i]=value;}
  pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].cost<a[c].cost)c++;if(a[c].cost>=last.cost)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
export function nearestNode(graph,point,maxMiles=.16) {
  if(!validTrackPoint(point)||!Array.isArray(graph?.bounds)||point.lat<graph.bounds[0]||point.lat>graph.bounds[2]||point.lon<graph.bounds[1]||point.lon>graph.bounds[3])throw new Error('Outside downloaded routing coverage.');
  let best=null,distance=Infinity;for(const node of graph.nodes){const d=segmentMiles([point,node]);if(d<distance){distance=d;best=node}}
  if(!best||distance>maxMiles)throw new Error('No supported road close enough to this position.');
  return best;
}
export function routeOffline(graph,start,end,{avoidHighways=false,avoidTolls=false,avoidUnpaved=false,mode='distance',assumedMph=30}={}) {
  if(!['distance','eta'].includes(mode)||!Number.isFinite(assumedMph)||assumedMph<1||assumedMph>100)throw new Error('Unsupported routing preferences.');
  const first=nearestNode(graph,start),last=nearestNode(graph,end),adj=new Map(),nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  for(const edge of graph.edges){if(avoidHighways&&/^(motorway|trunk)/.test(edge.highway)||avoidTolls&&edge.toll||avoidUnpaved&&!['asphalt','paved','concrete','concrete:plates','paving_stones'].includes(edge.surface))continue;if(!adj.has(edge.from))adj.set(edge.from,[]);adj.get(edge.from).push(edge);}
  const queue=new Queue(),distances=new Map(),previous=new Map(),initial=`${first.id}|`;
  queue.push({node:first.id,way:'',key:initial,cost:0});distances.set(initial,0);let target=null,visited=0;
  while(queue.items.length){const current=queue.pop();if(current.cost!==distances.get(current.key))continue;
    if(++visited>300000)throw new Error('Routing state limit reached. Choose a smaller region.');
    if(current.node===last.id){target=current;break;}
    for(const edge of adj.get(current.node)||[]){
      if((graph.restrictions||[]).some(r=>r.via===current.node&&r.from===current.way&&(r.only?edge.way!==r.to:edge.way===r.to)))continue;
      const key=`${edge.to}|${edge.way}`,cost=current.cost+edge.miles/(mode==='eta'?assumedMph:1);
      if(cost>=(distances.get(key)??Infinity))continue;
      distances.set(key,cost);previous.set(key,{key:current.key,edge});queue.push({node:edge.to,way:edge.way,key,cost});
    }
  }
  if(!target)throw new Error('No route inside this downloaded network with these restrictions. Expand coverage or change preferences.');
  const edges=[];let key=target.key;while(previous.has(key)){const p=previous.get(key);edges.push(p.edge);key=p.key}edges.reverse();
  if(!edges.length)throw new Error('Start and destination match the same network node.');
  const points=[nodes.get(first.id),...edges.map(e=>nodes.get(e.to))],miles=edges.reduce((n,e)=>n+e.miles,0);
  return {points,edges,miles,estimatedMinutes:miles/assumedMph*60,instructions:turnInstructions(points,edges),assumptions:'ETA uses your constant-speed assumption; traffic, elevation and temporary closures are unavailable. Verify signs and access on the ground.'};
}
const bearing=(a,b)=>Math.atan2((b.lon-a.lon)*Math.cos((a.lat+b.lat)/2*Math.PI/180),b.lat-a.lat)*180/Math.PI;
export function turnInstructions(points,edges) {
  const result=[{index:0,text:`Continue on ${edges[0].name}`,miles:0}];let miles=0;
  for(let i=1;i<edges.length;i++){miles+=edges[i-1].miles;const angle=((bearing(points[i],points[i+1])-bearing(points[i-1],points[i])+540)%360)-180;
    if(Math.abs(angle)>=30||edges[i].name!==edges[i-1].name)result.push({index:i,miles,text:`${Math.abs(angle)<30?'Continue':Math.abs(angle)>150?'Turn around':angle>0?'Turn right':'Turn left'} onto ${edges[i].name}`,angle,severity:Math.abs(angle)>100?'sharp':Math.abs(angle)>60?'moderate':'gentle'});
  }
  result.push({index:points.length-1,text:'Arrive at destination',miles:edges.reduce((n,e)=>n+e.miles,0)});return result;
}
