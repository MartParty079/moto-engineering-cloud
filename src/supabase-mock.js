const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const now=()=>new Date().toISOString();
let sequence=10;

const user={id:'e2e-user',email:'test@moto-mission.local'};
const session={user,access_token:'e2e-token'};
const featureKeys=['dashboard','garage_mode','motorcycles','maintenance','ride_log','parts','work_packages','engineering','pcb','firmware','notebook','project_files','ai_assistant'];
const database=new Map(Object.entries({
  bikes:[{id:'bike-test-1',user_id:user.id,year:2022,make:'Honda',model:'CRF450RL',name:'2022 Honda CRF450RL',odometer:4125,gps_odometer_miles:0,rides_since_odometer_confirm:0,tank_capacity_gallons:2,created_at:now()}],
  tasks:[{id:'task-1',user_id:user.id,title:'Validate GPS recorder',source_id:'R002',stage:'2 - Ride Testing',status:'Testing',sort_order:1,created_at:now()}],
  parts:[{id:'part-1',user_id:user.id,part:'ESP32-S3 DevKit',category:'Electronics',quantity:1,created_at:now()}],
  notes:[{id:'note-1',user_id:user.id,title:'E2E test workspace',body:'Local browser evidence mode',created_at:now()}],
  maintenance:[{id:'maint-1',user_id:user.id,service:'Oil change',bike_id:'bike-test-1',created_at:now()}],
  user_profiles:[{id:'profile-1',user_id:user.id,display_name:'Moto Mission Test',role:'owner',created_at:now()}],
  feature_flags:featureKeys.map((feature_key,index)=>({id:`flag-${index+1}`,feature_key,name:feature_key.replaceAll('_',' '),area:index<5?'garage':'engineering',enabled:true,release_stage:'production',minimum_role:'rider',sort_order:index,created_at:now()})),
  user_feature_access:[],user_activity_events:[],
  rides:[],ride_sessions:[],ride_samples:[],firmware:[],engineering_items:[],task_media:[],task_attachments:[],task_dependencies:[],ai_messages:[],ai_change_proposals:[],pcb_projects:[],pcb_components:[],pcb_pins:[],pcb_connectors:[],pcb_revisions:[],fuel_entries:[],adventure_routes:[],ride_notes:[],road_condition_tags:[]
}));

class Query{
  constructor(table){this.table=table;this.action='select';this.payload=null;this.filters=[];this.limitCount=null;this.wantSingle=false;this.wantMaybeSingle=false;this.returnRows=false}
  select(){this.returnRows=true;return this}
  insert(payload){this.action='insert';this.payload=Array.isArray(payload)?payload:[payload];return this}
  upsert(payload){this.action='upsert';this.payload=Array.isArray(payload)?payload:[payload];return this}
  update(payload){this.action='update';this.payload=payload;return this}
  delete(){this.action='delete';return this}
  eq(column,value){this.filters.push(row=>String(row?.[column])===String(value));return this}
  neq(column,value){this.filters.push(row=>String(row?.[column])!==String(value));return this}
  not(column,operator,value){if(operator==='is'&&value===null)this.filters.push(row=>row?.[column]!==null&&row?.[column]!==undefined);return this}
  is(column,value){this.filters.push(row=>row?.[column]===value);return this}
  in(column,values){const set=new Set((values||[]).map(String));this.filters.push(row=>set.has(String(row?.[column])));return this}
  gte(column,value){this.filters.push(row=>Number(row?.[column])>=Number(value));return this}
  lte(column,value){this.filters.push(row=>Number(row?.[column])<=Number(value));return this}
  contains(){return this}
  order(){return this}
  limit(value){this.limitCount=Number(value);return this}
  range(from,to){this.limitCount=Math.max(0,Number(to)-Number(from)+1);return this}
  single(){this.wantSingle=true;return this}
  maybeSingle(){this.wantMaybeSingle=true;return this}
  async execute(){
    const current=database.get(this.table)||[];
    let matching=current.filter(row=>this.filters.every(filter=>filter(row)));
    if(this.action==='insert'||this.action==='upsert'){
      const inserted=this.payload.map(item=>({id:item.id||`${this.table}-${++sequence}`,created_at:item.created_at||now(),updated_at:item.updated_at||now(),...clone(item)}));
      current.push(...inserted);database.set(this.table,current);matching=inserted;
    }else if(this.action==='update'){
      matching.forEach(row=>Object.assign(row,clone(this.payload),{updated_at:this.payload?.updated_at||now()}));
    }else if(this.action==='delete'){
      const doomed=new Set(matching);database.set(this.table,current.filter(row=>!doomed.has(row)));
    }
    if(Number.isFinite(this.limitCount))matching=matching.slice(0,this.limitCount);
    let data=clone(matching);
    if(this.wantSingle)data=data[0]||null;
    if(this.wantMaybeSingle)data=data[0]||null;
    if((this.action==='update'||this.action==='delete')&&!this.returnRows&&!this.wantSingle&&!this.wantMaybeSingle)data=null;
    return{data,error:null,count:Array.isArray(data)?data.length:data?1:0};
  }
  then(resolve,reject){return this.execute().then(resolve,reject)}
}

const auth={
  getSession:async()=>({data:{session},error:null}),
  signInWithPassword:async()=>({data:{session},error:null}),
  signUp:async()=>({data:{session},error:null}),
  signOut:async()=>({error:null}),
  onAuthStateChange(callback){queueMicrotask(()=>callback?.('SIGNED_IN',session));return{data:{subscription:{unsubscribe(){}}}}}
};

const storage={
  from(){return{
    upload:async(path)=>({data:{path},error:null}),
    remove:async()=>({data:[],error:null}),
    getPublicUrl:path=>({data:{publicUrl:`/e2e/${encodeURIComponent(path)}`}}),
    createSignedUrl:async path=>({data:{signedUrl:`/e2e/${encodeURIComponent(path)}`},error:null})
  }}
};

export function createMockSupabase(){
  return{
    auth,storage,
    from:table=>new Query(table),
    rpc:async()=>({data:[],error:null}),
    __database:database,
    __reset(){for(const [key,value] of database)database.set(key,value.filter(row=>!String(row.id||'').includes('ride_sessions-')&&!String(row.id||'').includes('ride_samples-')))}
  };
}