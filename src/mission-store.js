export class MissionStore {
  constructor(project) {this.name=`moto-mission-state-v1:${new URL(project).origin}`;this.connection=null;}
  open() {
    if(!globalThis.indexedDB)return Promise.reject(new Error('Local storage is unavailable.'));
    if(!this.connection)this.connection=new Promise((resolve,reject)=>{
      const request=indexedDB.open(this.name,1);
      request.onupgradeneeded=()=>request.result.createObjectStore('state',{keyPath:['owner','key']});
      request.onerror=()=>{this.connection=null;reject(request.error)};
      request.onblocked=()=>{this.connection=null;reject(new Error('Close other Moto tabs to open storage.'))};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.connection=null};resolve(db)};
    });
    return this.connection;
  }
  async update(owner,key,change) {
    if(!owner||!key)throw new Error('Account and storage key required.');
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite',{durability:'strict'}),store=tx.objectStore('state');let value,failure;
      tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(failure||tx.error||new Error('Storage failed.'));tx.onerror=()=>{};
      const req=store.get([owner,key]);req.onsuccess=()=>{try{value=change(req.result?.value);if(value instanceof Promise)throw new Error('Storage updates must be synchronous.');store.put({owner,key,value})}catch(error){failure=error;tx.abort()}};
    });
  }
  async get(owner,key) {
    if(!owner||!key)throw new Error('Account and storage key required.');
    const db=await this.open();
    return new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly'),request=tx.objectStore('state').get([owner,key]);let value;request.onsuccess=()=>{value=request.result?.value};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error)});
  }
  put(owner,key,value) {return this.update(owner,key,()=>value);}
}
