import {supabase} from './supabase.js';
import {missionStore} from './rider-preferences.js';
let audio=null,url=null,owner=null,recognition=null,restoreGuidance=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function release(){restoreGuidance?.();window.speechSynthesis?.cancel();audio?.pause();audio=null;if(url)URL.revokeObjectURL(url);url=null;recognition?.abort();recognition=null;if(navigator.mediaSession){navigator.mediaSession.metadata=null;for(const action of ['play','pause','seekbackward','seekforward','seekto']){try{navigator.mediaSession.setActionHandler(action,null)}catch{}}}document.querySelector('#missionMediaOverlay')?.remove();}
export async function openMedia() {
  const {data,error}=await supabase.auth.getSession();if(error||!data.session?.user.id)throw new Error('Sign in before using media.');
  if(owner&&owner!==data.session.user.id)release();owner=data.session.user.id;
  document.querySelector('#missionMediaOverlay')?.remove();
  const modal=document.createElement('div');modal.id='missionMediaOverlay';modal.className='rideModal';
  modal.innerHTML=`<section><header><h3>Media & voice</h3><button type="button" data-close aria-label="Close">×</button></header><p>Play an audio file from this device. OS/helmet controls apply to this player where Media Session is supported. Other apps and subscription services are not controlled.</p><label>Audio file<input data-file type="file" accept="audio/*" ${window.MotoRide?.getState?.().active?'disabled':''}/></label><div data-player></div><label>Guidance audio<select data-policy><option value="duck">Lower music volume</option><option value="pause">Pause music</option><option value="mute">Mute music</option><option value="critical">Critical prompts only</option></select></label><details><summary>Voice ride commands</summary><p>Browser speech recognition may use an online service and microphone permission. It is opt-in and unavailable on some browsers. Supported: start ride, pause ride, resume ride, stop ride. Start/stop require confirmation.</p><button type="button" data-listen>Listen for one command</button><button type="button" data-cancel-voice>Cancel listening</button></details><p data-status role="status"></p></section>`;
  document.body.appendChild(modal);const status=modal.querySelector('[data-status]'),player=modal.querySelector('[data-player]');
  const mediaOwner=owner;const prefs=await missionStore.get(mediaOwner,'media-preferences')||{policy:'duck'};const {data:latest}=await supabase.auth.getSession();if(!modal.isConnected||latest.session?.user.id!==mediaOwner)return;modal.querySelector('[data-policy]').value=prefs.policy;
  const attach=()=>{player.innerHTML='';if(audio){audio.controls=true;player.appendChild(audio)}};attach();
  modal.querySelector('[data-close]').onclick=()=>{recognition?.abort();modal.remove()};
  modal.querySelector('[data-file]').onchange=event=>{
    if(window.MotoRide?.getState?.().active){status.textContent='Stop recording before choosing a new media file.';return;}
    const file=event.target.files?.[0];if(!file)return;
    if(!file.type.startsWith('audio/')||file.size>250*1024*1024){status.textContent='Choose a supported audio file up to 250 MB.';return;}
    audio?.pause();if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(file);audio=new Audio(url);audio.onerror=()=>{status.textContent='This audio format could not be played.'};attach();
    if(navigator.mediaSession&&window.MediaMetadata){navigator.mediaSession.metadata=new MediaMetadata({title:file.name,artist:'Local audio · Moto Mission'});for(const [action,handler] of Object.entries({play:()=>audio?.play().catch(error=>{status.textContent=error.message}),pause:()=>audio?.pause(),seekbackward:event=>{audio.currentTime=Math.max(0,audio.currentTime-(event.seekOffset||10))},seekforward:event=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+(event.seekOffset||10))},seekto:event=>{if(Number.isFinite(event.seekTime))audio.currentTime=event.seekTime}})){try{navigator.mediaSession.setActionHandler(action,handler)}catch{/* Platform does not implement this action. */}}}
    status.textContent='Local audio loaded. Press play; browser autoplay rules still apply.';
  };
  modal.querySelector('[data-policy]').onchange=async event=>{try{if(window.MotoRide?.getState?.().active)throw new Error('Stop recording before changing voice policy.');const {data}=await supabase.auth.getSession();if(data.session?.user.id!==owner)return;await missionStore.put(owner,'media-preferences',{policy:event.target.value})}catch(error){status.textContent=error.message}};
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  modal.querySelector('[data-listen]').disabled=!Recognition;if(!Recognition)status.textContent='Speech recognition unsupported. Manual ride controls remain available.';
  modal.querySelector('[data-cancel-voice]').onclick=()=>{recognition?.abort();status.textContent='Voice listening cancelled.'};
  modal.querySelector('[data-listen]').onclick=()=>{
    recognition?.abort();recognition=new Recognition();recognition.lang='en-US';recognition.interimResults=false;recognition.continuous=false;
    recognition.onerror=event=>{status.textContent=`Voice unavailable: ${event.error}. Use manual ride controls.`};
    recognition.onresult=async event=>{try{
      const {data}=await supabase.auth.getSession();if(data.session?.user.id!==owner||!modal.isConnected)return;
      const text=event.results[0][0].transcript.toLowerCase().trim().replace(/[.!?]$/,'');status.textContent=`Heard: ${text}`;
      if(text==='pause ride')await window.MotoRide.pause();
      else if(text==='resume ride')await window.MotoRide.resume();
      else if(text==='stop ride'){if(confirm('Stop recording and save this ride?'))await window.MotoRide.stop();}
      else if(text==='start ride'){const bikes=window.MotoRide.getBikes();if(bikes.length!==1)throw new Error('Choose a motorcycle using the Start Ride button.');if(confirm(`Start recording ${bikes[0].name}?`))await window.MotoRide.start(bikes[0].id);}
      else status.textContent='Command unsupported. Use start/pause/resume/stop ride or manual controls.';
    }catch(error){status.textContent=error.message}};
    try{recognition.start();status.textContent='Listening for one ride command…'}catch(error){status.textContent=error.message}
  };
}

export async function speakGuidance(text,{critical=false}={}) {
  if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)return false;
  const {data}=await supabase.auth.getSession(),current=data.session?.user.id;if(!current)return false;
  const {policy='duck'}=await missionStore.get(current,'media-preferences')||{};const {data:latest}=await supabase.auth.getSession();if(latest.session?.user.id!==current||policy==='critical'&&!critical)return false;
  restoreGuidance?.();window.speechSynthesis.cancel();
  const target=audio,volume=target?.volume;let timer;
  const restore=()=>{clearTimeout(timer);if(target&&target===audio&&volume!=null)target.volume=volume;if(restoreGuidance===restore)restoreGuidance=null};restoreGuidance=restore;
  if(target){if(policy==='pause')target.pause();else target.volume=policy==='mute'?0:Math.min(volume,.2);}
  const utterance=new SpeechSynthesisUtterance(text);utterance.onend=restore;utterance.onerror=restore;timer=setTimeout(restore,15000);window.speechSynthesis.speak(utterance);return true;
}
supabase.auth.onAuthStateChange((_event,session)=>{if(owner&&session?.user.id!==owner){release();owner=null}});
