import { editRoute, elevationProfile } from './route-editing.js';
import { supabase } from './supabase.js';
import { RouteStore } from './route-store.js';
import { parseGPX, downloadGPX, MAX_GPX_BYTES } from './gpx.js';

export const localRoutes = new RouteStore(supabase.supabaseUrl || location.origin);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
export async function routeOwner() {
  const {data,error}=await supabase.auth.getSession();
  const user=data?.session?.user;
  if(error||!user?.id||user.is_anonymous||!user.email_confirmed_at)throw new Error('Sign in with a verified invited account to access routes.');
  return user.id;
}

export function preview(route) {
  const points=[...route.segments.flat(),...route.waypoints];
  let minLat=90,maxLat=-90,minLon=180,maxLon=-180;
  for(const p of points){minLat=Math.min(minLat,p.lat);maxLat=Math.max(maxLat,p.lat);minLon=Math.min(minLon,p.lon);maxLon=Math.max(maxLon,p.lon)}
  // A geometry preview needs no tiles/provider. Each segment stays separate across capture gaps.
  const latitude=(minLat+maxLat)/2,scaleX=Math.max(.01,Math.cos(latitude*Math.PI/180));
  const width=(maxLon-minLon)*scaleX,height=maxLat-minLat,scale= Math.min(460/Math.max(width,.00001),210/Math.max(height,.00001));
  const xy=p=>`${(250+(p.lon-(minLon+maxLon)/2)*scaleX*scale).toFixed(2)},${(125-(p.lat-latitude)*scale).toFixed(2)}`;
  return `<svg class="missionTrackPreview" viewBox="0 0 500 250" role="img" aria-label="Track geometry preview, without a basemap"><rect width="500" height="250" rx="16" fill="#101923"/>${route.segments.map(segment=>`<polyline points="${segment.map(xy).join(' ')}" fill="none" stroke="#bcd58b" stroke-width="3"/>`).join('')}${route.segments.map(segment=>{const [x,y]=xy(segment[0]).split(',');return `<circle cx="${x}" cy="${y}" r="4" fill="#bcd58b"/>`}).join('')}${route.waypoints.map(point=>`<circle cx="${xy(point).split(',')[0]}" cy="${xy(point).split(',')[1]}" r="4" fill="#ff8154"/>`).join('')}</svg>`;
}

function routeDescription(route) {
  return `<p>${route.pointCount} points · ${route.segmentCount??route.segments.length} segments · ${route.waypointCount??route.waypoints.length} waypoints · ${route.distanceMiles.toFixed(2)} mi</p>`;
}

export async function mountRouteLibrary(host) {
  host.innerHTML='<p role="status">Loading saved routes…</p>';
  let owner;
  try{owner=await routeOwner()}catch(error){if(host.isConnected)host.textContent=error.message;return}
  if(!host.isConnected)return;
  host.innerHTML=`<header><div><h3>Saved on this device</h3><p>Import and preview GPX without a map connection. Keep an exported copy; browser storage can be cleared.</p></div><label class="secondary missionImport">Import GPX<input id="missionGpxInput" type="file" accept=".gpx,application/gpx+xml" aria-label="Import GPX"/></label></header><p id="missionRouteStatus" role="status" aria-live="polite"></p><div id="missionGpxPreview"></div><label class="missionRouteFilter">Search saved routes<input id="missionRouteSearch" type="search" placeholder="Route or waypoint name"/></label><div id="missionLocalRoutes"></div>`;
  const status=host.querySelector('#missionRouteStatus'),stage=host.querySelector('#missionGpxPreview'),list=host.querySelector('#missionLocalRoutes'),input=host.querySelector('#missionGpxInput');
  let saved=[],pending=null;
  const current=async()=>host.isConnected&&await routeOwner()===owner;
  const report=error=>{if(host.isConnected)status.textContent=error.message||String(error)};
  const renderList=()=>{
    const query=host.querySelector('#missionRouteSearch').value.trim().toLocaleLowerCase();
    const matches=saved.filter(route=>!query||`${route.name} ${route.filename} ${(route.waypointNames||[]).join(' ')}`.toLocaleLowerCase().includes(query));
    list.innerHTML=matches.map(route=>`<article class="card missionSavedRoute" data-local-route="${route.id}"><span class="missionState">${route.sourceIds ? 'Edited copy' : 'Local original'} · ${esc(route.kind)}</span><h3>${esc(route.name)}</h3>${routeDescription(route)}<small>${esc(route.filename)}</small><div class="actions"><button type="button" class="secondary" data-route-preview="${route.id}">Preview</button><button type="button" class="secondary" data-route-original="${route.id}">Download original</button><button type="button" class="secondary" data-route-edit="${route.id}">Edit copy</button><button type="button" class="secondary" data-route-weather="${route.id}">Route weather</button><button type="button" class="primary" data-route-map="${route.id}">Show on Map</button></div></article>`).join('')||`<div class="empty"><h3>${query?'No matching routes':'Bring your next ride'}</h3><p>${query?'Try another route or waypoint name.':'Import a GPX file to preview, edit a copy, and check weather along the way.'}</p></div>`;
    list.querySelectorAll('[data-route-preview]').forEach(button=>button.onclick=async()=>{try{if(!await current())return;const route=await localRoutes.get(owner,button.dataset.routePreview);if(!await current())return;stage.innerHTML=`<article class="card"><h3>${esc(route.name)}</h3>${routeDescription(route)}${preview(route)}${profileSVG(route)}<p>Saved geometry. Preview only; no turn instructions or offline rerouting.</p>${route.waypoints.length?`<p>Waypoints: ${route.waypoints.map(p=>esc(p.name||'Unnamed waypoint')).join(', ')}</p>`:''}</article>`}catch(error){report(error)}});
    list.querySelectorAll('[data-route-original]').forEach(button=>button.onclick=async()=>{try{if(!await current())return;const route=saved.find(r=>r.id===button.dataset.routeOriginal),original=await localRoutes.original(owner,route.id);if(!await current())return;downloadGPX(original,route.filename)}catch(error){report(error)}});
    list.querySelectorAll('[data-route-edit]').forEach(button=>button.onclick=()=>openEditor(button.dataset.routeEdit).catch(report));
    list.querySelectorAll('[data-route-weather]').forEach(button=>button.onclick=async()=>{try{if(!await current())return;const route=await localRoutes.get(owner,button.dataset.routeWeather);if(!await current())return;const {mountRouteWeather}=await import('./route-weather-ui.js');await mountRouteWeather(stage,route,current)}catch(error){report(error)}});
    list.querySelectorAll('[data-route-map]').forEach(button=>button.onclick=async()=>{try{if(!await current())return;if(window.MotoRide?.getState?.().active)throw new Error('Stop recording before changing route setup.');if(!window.MotoAdventure?.openLocalRoute)throw new Error('Map tools are still loading. Try again.');window.MotoAdventure.openLocalRoute(button.dataset.routeMap)}catch(error){report(error)}});
  };
  const openEditor=async id=>{
    if(!await current())return;
    if(window.MotoRide?.getState?.().active)throw new Error('Stop recording before editing routes.');
    const route=await localRoutes.get(owner,id);if(!await current())return;
    stage.innerHTML=`<form class="card missionRouteEditor"><h3>Edit a separate copy</h3><p>Your source GPX remains unchanged. Split and merge keep separate segments; they do not invent connecting roads.</p><label>Name<input name="name" required maxlength="160" value="${esc(route.name)} copy"/></label><div class="missionFormGrid"><label>First point<input name="from" type="number" min="1" max="${route.pointCount-1}" value="1" required/></label><label>Last point<input name="to" type="number" min="2" max="${route.pointCount}" value="${route.pointCount}" required/></label><label>Split before point (optional)<input name="split" type="number" min="2" max="${route.pointCount}"/></label><label>Append saved geometry<select name="merge"><option value="">None</option>${saved.filter(r=>r.id!==id).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label></div><label><input name="reverse" type="checkbox"/> Reverse selected geometry</label><details><summary>Edit one point in the selected range</summary><label>Point number<input name="pointIndex" type="number" min="1"/></label><label>Latitude<input name="lat" type="number" step="any" min="-90" max="90"/></label><label>Longitude<input name="lon" type="number" step="any" min="-180" max="180"/></label></details><div data-edit-preview>${preview(route)}${profileSVG(route)}</div><p data-edit-status role="status"></p><div class="actions"><button type="button" data-preview-edit>Preview changes</button><button type="submit" class="primary" disabled>Save edited copy</button></div></form>`;
    const form=stage.querySelector('form'),message=form.querySelector('[data-edit-status]'),submit=form.querySelector('[type="submit"]');let candidate=null;
    form.oninput=()=>{candidate=null;submit.disabled=true};form.onchange=form.oninput;
    form.querySelector('[data-preview-edit]').onclick=async()=>{
      try{
        if(!await current())return;
        if(window.MotoRide?.getState?.().active)throw new Error('Stop recording before editing routes.');
        const values=new FormData(form),merge=values.get('merge')?await localRoutes.get(owner,values.get('merge')):null;
        if(!await current()||!form.isConnected)return;
        const point=values.get('pointIndex')?{index:Number(values.get('pointIndex'))-1,lat:values.get('lat')===''?NaN:Number(values.get('lat')),lon:values.get('lon')===''?NaN:Number(values.get('lon'))}:null;
        candidate={name:String(values.get('name')).trim(),sources:merge?[id,merge.id]:[id],geometry:editRoute(route,{from:Number(values.get('from'))-1,to:Number(values.get('to'))-1,reverse:values.get('reverse')==='on',splitAt:values.get('split')?Number(values.get('split'))-1:null,point,merge})};
        if(!candidate.name)throw new Error('Enter a name.');
        form.querySelector('[data-edit-preview]').innerHTML=preview(candidate.geometry)+profileSVG(candidate.geometry);
        message.textContent=`${route.pointCount} source points → ${candidate.geometry.pointCount} edited points; ${candidate.geometry.segments.length} segments. Original remains unchanged. Point timestamps belong to the source recording.`;submit.disabled=false;
      }catch(error){candidate=null;submit.disabled=true;message.textContent=error.message}
    };
    form.onsubmit=async event=>{
      event.preventDefault();const item=candidate;if(!item)return;submit.disabled=true;
      try{if(!await current())return;if(window.MotoRide?.getState?.().active)throw new Error('Stop recording before saving edits.');await localRoutes.derive(owner,item.sources,item.name,item.geometry,'geometry-edit');if(!await current())return;stage.innerHTML='';status.textContent='Edited copy saved. Source originals preserved.';await refresh();window.dispatchEvent(new CustomEvent('moto-local-routes-update'))}catch(error){message.textContent=error.message;submit.disabled=false}
    };
  };
  const refresh=async()=>{saved=await localRoutes.list(owner);if(await current())renderList()};
  host.querySelector('#missionRouteSearch').oninput=renderList;
  input.onchange=async()=>{
    stage.innerHTML='';pending=null;const file=input.files?.[0];input.value='';if(!file)return;
    try{
      if(!await current())return;
      if(file.size>MAX_GPX_BYTES)throw new Error('GPX files must be at most 10 MB.');
      if(window.MotoRide?.getState?.().active)throw new Error('Stop recording before importing a route.');
      const parsed=parseGPX(await file.text(),file.name);
      if(!await current())return;
      pending={file,parsed};status.textContent='Preview ready. Save to keep the original on this device.';
      stage.innerHTML=`<article class="card"><h3>${esc(parsed.name)}</h3>${routeDescription(parsed)}${preview(parsed)}<p>The original file, timestamps, elevations, waypoints, and segment boundaries will be preserved.</p><button type="button" id="missionSaveGpx" class="primary">Save original GPX</button></article>`;
      const save=stage.querySelector('#missionSaveGpx');save.onclick=async()=>{
        const item=pending;if(!item)return;save.disabled=true;
        try{
          if(!await current())return;
          if(window.MotoRide?.getState?.().active)throw new Error('Stop recording before saving a route.');
          await localRoutes.import(owner,item.file.name,item.file,item.parsed);
          if(!await current())return;
          pending=null;stage.innerHTML='';status.textContent='Original GPX saved on this device. No cloud upload was made.';await refresh();window.dispatchEvent(new CustomEvent('moto-local-routes-update'));
        }catch(error){report(error);if(save.isConnected)save.disabled=false}
      };
    }catch(error){report(error)}
  };
  try{await refresh()}catch(error){report(error)}
}

function profileSVG(route) {
  const samples=elevationProfile(route),known=samples.filter(p=>p.elevation!==null);
  if(known.length<2)return '<p>Elevation profile unavailable: fewer than two elevation measurements.</p>';
  const min=known.reduce((n,p)=>Math.min(n,p.elevation),Infinity),max=known.reduce((n,p)=>Math.max(n,p.elevation),-Infinity),total=samples.at(-1).miles;
  const lines=[];let run=[];let last=null;
  for(const p of samples){if(p.elevation===null||last!==p.segment){if(run.length)lines.push(run);run=[]}if(p.elevation!==null)run.push(`${20+460*p.miles/Math.max(.001,total)},${110-90*(p.elevation-min)/Math.max(1,max-min)}`);last=p.segment}if(run.length)lines.push(run);
  return `<figure><figcaption>Recorded elevation ${min.toFixed(0)}–${max.toFixed(0)} m · gaps preserved</figcaption><svg viewBox="0 0 500 130" role="img" aria-label="Elevation profile">${lines.map(l=>`<polyline points="${l.join(' ')}" fill="none" stroke="#ff8154" stroke-width="3"/>`).join('')}</svg></figure>`;
}
