import { validTrackPoint, MAX_GPX_BYTES, MAX_GPX_POINTS, serializeGPX } from './gpx.js';

export class RouteStore {
  constructor(project) { this.name=`moto-route-library-v1:${new URL(project).origin}`;this.connection=null; }
  open() {
    if(!globalThis.indexedDB)return Promise.reject(new Error('Local route storage is unavailable.'));
    if(!this.connection)this.connection=new Promise((resolve,reject)=>{
      const request=indexedDB.open(this.name,1);
      request.onupgradeneeded=()=>{
        request.result.createObjectStore('routes',{keyPath:['owner','id']}).createIndex('owner','owner');
        request.result.createObjectStore('geometry',{keyPath:['owner','id']});
        request.result.createObjectStore('originals',{keyPath:['owner','id']});
      };
      request.onerror=()=>{this.connection=null;reject(request.error)};
      request.onblocked=()=>{this.connection=null;reject(new Error('Close other Moto tabs to open route storage.'))};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.connection=null};resolve(db)};
    });
    return this.connection;
  }
  async transaction(owner,mode,action) {
    if(typeof owner!=='string'||!owner)throw new Error('Sign in before accessing saved routes.');
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['routes','geometry','originals'],mode,{durability:'strict'});let result,failure;
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||new Error('Route storage failed.'));tx.onerror=()=>{};
      try{action(tx,value=>{result=value},error=>{failure=error;tx.abort()})}catch(error){failure=error;tx.abort()}
    });
  }
  async import(owner,filename,original,parsed) {
    const points=parsed?.segments?.flat();
    if(!(original instanceof Blob)||!original.size||original.size>MAX_GPX_BYTES||!points||points.length<2||points.length>MAX_GPX_POINTS||!points.every(validTrackPoint)||!(parsed.waypoints||[]).every(validTrackPoint))throw new Error('Invalid GPX import.');
    const id=crypto.randomUUID(),record={owner,id,name:parsed.name,filename,kind:parsed.kind,pointCount:points.length,segmentCount:parsed.segments.length,waypointCount:parsed.waypoints.length,waypointNames:parsed.waypoints.map(p=>p.name||''),distanceMiles:parsed.distanceMiles,gainFeet:parsed.gainFeet,createdAt:Date.now(),bytes:original.size};
    return this.transaction(owner,'readwrite',(tx,done)=>{
      // Add-only storage keeps the original separate and immutable. No automatic cleanup exists.
      tx.objectStore('routes').add(record);tx.objectStore('geometry').add({owner,id,segments:parsed.segments,waypoints:parsed.waypoints});tx.objectStore('originals').add({owner,id,file:original});done(record);
    });
  }
  async derive(owner, sourceIds, name, parsed, operation) {
    if (!Array.isArray(sourceIds) || !sourceIds.length || sourceIds.some(id => typeof id !== 'string')) throw new Error('A source route is required.');
    const file = new Blob([serializeGPX({name, ...parsed})], {type:'application/gpx+xml'});
    if (file.size > MAX_GPX_BYTES) throw new Error('Edited GPX exceeds the 10 MB limit.');
    const id = crypto.randomUUID(), filename = `${name.replace(/[\\/:*?"<>|]/g,'-') || 'edited-route'}.gpx`;
    return this.transaction(owner, 'readwrite', (tx, done, fail) => {
      let remaining = sourceIds.length;
      for (const sourceId of sourceIds) {
        const request = tx.objectStore('routes').get([owner,sourceId]);
        request.onsuccess = () => {
          if (!request.result) return fail(new Error('Source route does not belong to this account.'));
          if (--remaining) return;
          const record = {owner,id,name,filename,kind:'track',pointCount:parsed.pointCount,segmentCount:parsed.segments.length,waypointCount:parsed.waypoints.length,waypointNames:parsed.waypoints.map(p=>p.name||''),distanceMiles:parsed.distanceMiles,gainFeet:parsed.gainFeet,createdAt:Date.now(),bytes:file.size,sourceIds:[...sourceIds],operation,version:1};
          tx.objectStore('routes').add(record);
          tx.objectStore('geometry').add({owner,id,segments:parsed.segments,waypoints:parsed.waypoints});
          tx.objectStore('originals').add({owner,id,file});done(record);
        };
      }
    });
  }
  list(owner) { return this.transaction(owner,'readonly',(tx,done)=>{const req=tx.objectStore('routes').index('owner').getAll(owner);req.onsuccess=()=>done(req.result.sort((a,b)=>b.createdAt-a.createdAt))}); }
  get(owner,id) { return this.transaction(owner,'readonly',(tx,done,fail)=>{
    const req=tx.objectStore('routes').get([owner,id]);req.onsuccess=()=>{
      if(!req.result)return fail(new Error('No saved route belongs to this account.'));
      const geometry=tx.objectStore('geometry').get([owner,id]);geometry.onsuccess=()=>{if(!geometry.result)return fail(new Error('Saved route geometry is unavailable.'));done({...req.result,...geometry.result})};
    };
  }); }
  original(owner,id) { return this.transaction(owner,'readonly',(tx,done,fail)=>{const req=tx.objectStore('originals').get([owner,id]);req.onsuccess=()=>req.result?done(req.result.file):fail(new Error('Original GPX is unavailable for this account.'))}); }
}
