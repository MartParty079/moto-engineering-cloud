import { supabase } from './supabase.js';

const $=q=>document.querySelector(q);
let selectedRideId=null;

async function removeRide(id){
 if(!id)return false;
 const samples=await supabase.from('ride_samples').delete().eq('session_id',id);
 if(samples.error){alert(samples.error.message);return false}
 const session=await supabase.from('ride_sessions').delete().eq('id',id);
 if(session.error){alert(session.error.message);return false}
 return true
}

async function discardActiveRide(){
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem('motoActiveRide')||'null')}catch{}
 if(!saved?.id)return alert('No active ride was found.');
 if(!confirm('Stop and discard this ride? The ride and all recorded sensor samples will be permanently deleted.'))return;
 const button=$('#rideDiscard');if(button){button.disabled=true;button.textContent='DISCARDING…'}
 if(!await removeRide(saved.id)){if(button){button.disabled=false;button.textContent='STOP & DISCARD'}return}
 localStorage.removeItem('motoActiveRide');
 localStorage.removeItem('motoRideHiddenAt');
 localStorage.removeItem('motoRideInterrupted');
 try{navigator.clearAppBadge?.()}catch{}
 location.reload()
}

async function deleteSavedRide(id){
 if(!id)return;
 if(!confirm('Permanently delete this saved ride and all of its sensor samples? This will remove it from Ride Log and bike totals. Motorcycle odometer values will not be changed.'))return;
 const button=$('#deleteSavedRide');if(button){button.disabled=true;button.textContent='DELETING…'}
 if(!await removeRide(id)){if(button){button.disabled=false;button.textContent='DELETE RIDE'}return}
 document.querySelector('#rideDetailModal')?.remove();
 location.reload()
}

function addDiscardButton(){
 const stop=$('#rideStop');if(!stop||$('#rideDiscard'))return;
 const button=document.createElement('button');
 button.id='rideDiscard';button.type='button';button.className='rideStop';button.textContent='STOP & DISCARD';
 Object.assign(button.style,{marginTop:'10px',background:'transparent',border:'1px solid #ef4444',color:'#fca5a5'});
 button.onclick=discardActiveRide;
 stop.insertAdjacentElement('afterend',button)
}

function addSavedDeleteButton(){
 const modal=$('#rideDetailModal');if(!modal||!selectedRideId||$('#deleteSavedRide'))return;
 const actions=modal.querySelector('.rideLogActions')||modal.querySelector('section');
 const button=document.createElement('button');
 button.id='deleteSavedRide';button.type='button';button.className='rideStop';button.textContent='DELETE RIDE';
 Object.assign(button.style,{marginTop:'10px',background:'transparent',border:'1px solid #ef4444',color:'#fca5a5'});
 button.onclick=()=>deleteSavedRide(selectedRideId);
 actions.appendChild(button)
}

document.addEventListener('click',event=>{
 const row=event.target.closest('[data-ride-session],[data-ride-detail]');
 if(row)selectedRideId=row.dataset.rideSession||row.dataset.rideDetail||null;
 setTimeout(()=>{addDiscardButton();addSavedDeleteButton()},30)
},true);
window.addEventListener('moto-open-ride',event=>{selectedRideId=event.detail;setTimeout(addSavedDeleteButton,30)});
new MutationObserver(()=>{addDiscardButton();addSavedDeleteButton()}).observe(document.body,{childList:true,subtree:true});
addDiscardButton();
