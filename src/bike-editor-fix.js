import { supabase } from './supabase.js';

const $=q=>document.querySelector(q);
const esc=(s='')=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
let session=null;

async function getSession(){if(session)return session;const {data}=await supabase.auth.getSession();session=data.session;return session}

async function openBikeEditor(id){const s=await getSession();if(!s)return;const {data:bike,error}=await supabase.from('bikes').select('*').eq('id',id).single();if(error){alert(error.message);return}
 const old=$('#bikeEditOverlay');if(old)old.remove();
 const o=document.createElement('div');o.id='bikeEditOverlay';o.className='rideModal';o.innerHTML=`<section><header><div><small>MOTORCYCLE PROFILE</small><h3>Edit motorcycle</h3></div><button id="closeBikeEdit">×</button></header><form id="bikeEditForm" class="bikeEditForm">
 <label>Name<input name="name" value="${esc(bike.name||'')}" required></label>
 <div class="bikeEditTwo"><label>Year<input name="year" value="${esc(bike.year||'')}"></label><label>Make<input name="make" value="${esc(bike.make||'')}"></label></div>
 <label>Model<input name="model" value="${esc(bike.model||'')}"></label>
 <label>Odometer<input name="odometer" type="number" step="0.1" value="${esc(bike.odometer||0)}"></label>
 <label>Notes<textarea name="notes">${esc(bike.notes||'')}</textarea></label>
 <label class="bikePhotoEdit">Bike photo<input name="photo" type="file" accept="image/*"></label>
 ${bike.image_url?`<img class="bikeEditPreview" src="${esc(bike.image_url)}" alt="Bike photo">`:''}
 <button class="rideStart">SAVE MOTORCYCLE</button></form></section>`;
 document.body.appendChild(o);$('#closeBikeEdit').onclick=()=>o.remove();o.onclick=e=>{if(e.target===o)o.remove()};
 $('#bikeEditForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),photo=f.get('photo');let image_url=bike.image_url||null;
 if(photo&&photo.size){if(photo.size>5*1024*1024){alert('Use an image smaller than 5 MB.');return}const ext=(photo.name.split('.').pop()||'jpg').toLowerCase(),path=`${s.user.id}/${bike.id}-${Date.now()}.${ext}`;const up=await supabase.storage.from('bike-images').upload(path,photo,{contentType:photo.type,upsert:true});if(up.error){alert(up.error.message);return}image_url=supabase.storage.from('bike-images').getPublicUrl(path).data.publicUrl}
 const row={name:f.get('name'),year:f.get('year')||null,make:f.get('make')||null,model:f.get('model')||null,odometer:Number(f.get('odometer')||0),notes:f.get('notes')||null,image_url,updated_at:new Date().toISOString()};const r=await supabase.from('bikes').update(row).eq('id',bike.id);if(r.error){alert(r.error.message);return}o.remove();location.reload()};
}

function bind(){document.querySelectorAll('[data-edit^="bikes:"]').forEach(btn=>{if(btn.dataset.bikeEditorBound)return;btn.dataset.bikeEditorBound='1';btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openBikeEditor(btn.dataset.edit.split(':')[1])},true)})}
new MutationObserver(bind).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});bind();
