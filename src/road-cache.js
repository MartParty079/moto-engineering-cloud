// Local OSM matches only; no paid-provider data is persisted. Never extrapolate past a segment.
export const headingDifference = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const coordinate = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
const heading = h => Number.isFinite(h) && h >= 0 && h < 360;
const ageLimit = 30 * 86400000;
export function segmentDistance(point, geometry) {
  if (!coordinate(point) || !Array.isArray(geometry) || geometry.length !== 2 || !geometry.every(coordinate)) return Infinity;
  const [a,b] = geometry, scale = 111320 * Math.cos(point.lat * Math.PI / 180);
  const ax = (a.lon-point.lon)*scale, ay = (a.lat-point.lat)*111320;
  const dx = (b.lon-a.lon)*scale, dy = (b.lat-a.lat)*111320, length = dx*dx+dy*dy;
  if (!length) return Infinity;
  const t = -(ax*dx+ay*dy)/length;
  if (t < 0 || t > 1) return Infinity;
  return Math.hypot(ax+t*dx,ay+t*dy);
}
const position = p => ({lat:p.latitude,lon:p.longitude});
const separation = (a,b) => Math.hypot((a.lat-b.lat)*111320,(a.lon-b.lon)*111320*Math.cos(a.lat*Math.PI/180));
export class RoadCache {
  constructor(storage) { this.storage=storage; this.entries=[]; this.zones=[]; this.key=null; this.previous=null; this.version=0; }
  scope(owner, backend) {
    const key=owner ? `moto-road-cache-v1:${backend}:${owner}` : null;
    if(key===this.key)return;
    this.key=key; this.entries=[]; this.zones=[]; this.previous=null; this.version++;
    try {
      const saved=JSON.parse(this.storage?.getItem(key)||'null');
      this.entries=(saved?.entries||[]).filter(e=>this.valid(e)).slice(-400);
      this.zones=(saved?.zones||[]).filter(z=>coordinate(z)&&Number.isFinite(z.at)&&Date.now()-z.at>=0&&Date.now()-z.at<ageLimit&&typeof z.from==='string'&&typeof z.to==='string'&&heading(z.heading)).slice(-100);
    } catch { this.entries=[]; this.zones=[]; }
  }
  valid(e) { return e && Number.isFinite(e.at)&&Date.now()-e.at>=0&&Date.now()-e.at<ageLimit&&heading(e.heading)&&Array.isArray(e.geometry)&&e.geometry.length===2&&e.geometry.every(coordinate)&&e.data&&typeof e.data.name==='string'&&/^\d+$/.test(e.data.limit)&&Number(e.data.limit)>0&&Number(e.data.limit)<=250&&typeof e.data.source==='string'&&e.data.source.startsWith('OpenStreetMap')&&typeof e.roadId==='string'; }
  save() { if(this.key)try{this.storage?.setItem(this.key,JSON.stringify({entries:this.entries,zones:this.zones}));}catch{/* Storage full/disabled: in-memory cache still works. */} }
  remember(payload,data,fix,at) {
    if(!this.key||!data||!heading(fix.heading)||!Number.isFinite(fix.accuracy)||fix.accuracy>40||fix.accuracy<0)return;
    const entry={at,heading:fix.heading,geometry:payload.geometry,roadId:payload.roadId,data};
    if(!Array.isArray(entry.geometry)||entry.geometry.length!==2||!entry.geometry.every(coordinate)||typeof entry.roadId!=='string'||!data.source?.startsWith('OpenStreetMap')||segmentDistance(position(fix),entry.geometry)>30)return;
    // A fresh unknown limit invalidates the old value for this exact directed segment.
    this.entries=this.entries.filter(e=>!(e.roadId===entry.roadId&&JSON.stringify(e.geometry)===JSON.stringify(entry.geometry)&&headingDifference(e.heading,entry.heading)<40));
    if(!this.valid(entry)){this.previous=null;this.save();return;}
    const previous=this.previous;
    if(previous&&at-previous.at>0&&at-previous.at<120000&&data.limit!==previous.data.limit&&data.name===previous.data.name&&!['Unknown','Unnamed road'].includes(data.name)&&headingDifference(fix.heading,previous.heading)<40&&separation(position(fix),previous.point)<1500) {
      const zone={...position(fix),at,heading:fix.heading,from:previous.data.limit,to:data.limit};
      if(!this.zones.some(z=>z.to===zone.to&&headingDifference(z.heading,zone.heading)<40&&separation(z,zone)<80))this.zones.push(zone);
      this.zones=this.zones.slice(-100);
    }
    this.previous={...entry,point:position(fix)};
    this.entries=this.entries.filter(e=>this.valid(e)&&!(e.roadId===entry.roadId&&JSON.stringify(e.geometry)===JSON.stringify(entry.geometry)&&headingDifference(e.heading,entry.heading)<40));
    this.entries.push(entry);this.entries=this.entries.slice(-400);this.save();
  }
  match(fix) {
    if(!heading(fix.heading)||!Number.isFinite(fix.accuracy)||fix.accuracy<0||fix.accuracy>40)return null;
    const candidates=this.entries.filter(e=>this.valid(e)&&headingDifference(e.heading,fix.heading)<35).map(e=>({e,d:segmentDistance(position(fix),e.geometry)})).filter(x=>x.d<=25).sort((a,b)=>a.d-b.d||b.e.at-a.e.at);
    if(!candidates.length)return null;
    const best=candidates[0];
    if(candidates.some(x=>x!==best&&x.d-best.d<12&&(x.e.roadId!==best.e.roadId||x.e.data.limit!==best.e.data.limit)))return null;
    return best.e;
  }
  nearZone(fix) { return heading(fix.heading)&&this.zones.some(z=>Date.now()-z.at<ageLimit&&headingDifference(z.heading,fix.heading)<40&&separation(z,position(fix))<250); }
  clear() { if(this.key)try{this.storage?.removeItem(this.key);}catch{} this.entries=[];this.zones=[];this.previous=null;this.version++; }
}
const storage={getItem:key=>globalThis.localStorage?.getItem(key),setItem:(key,value)=>globalThis.localStorage?.setItem(key,value),removeItem:key=>globalThis.localStorage?.removeItem(key)};
export const roadCache=new RoadCache(storage);
