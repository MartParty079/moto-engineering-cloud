import {supabase} from './supabase.js';
import {MissionStore} from './mission-store.js';
export const missionStore=new MissionStore(supabase.supabaseUrl||location.origin);
export const preferenceDefaults={automaticUpload:true,unmeteredOnly:false,detailRides:10,toleranceMph:3,theme:'night',contrast:false,maneuverVoice:false,weatherAlerts:true};
export async function riderPreferences(owner) {return {...preferenceDefaults,theme:deviceTheme(),...await missionStore.get(owner,'preferences')};}
export async function mountMissionPreferences(host) {
  const {data,error}=await supabase.auth.getSession(),owner=data.session?.user.id;
  if(error||!owner){host.textContent='Sign in to manage local preferences.';return;}
  const prefs=await riderPreferences(owner);if(!host.isConnected)return;
  host.innerHTML=`<article class="card"><h3>Make it yours</h3><p>Appearance, guidance, and ride storage for this account on this device.</p><form><label><input name="automaticUpload" type="checkbox" ${prefs.automaticUpload?'checked':''}/> Automatically upload stopped rides</label><label><input name="unmeteredOnly" type="checkbox" ${prefs.unmeteredOnly?'checked':''}/> Delay automatic uploads on detected metered/save-data networks</label><p>If this browser cannot identify the network type, the restrictive setting delays automatic uploads. Explicit Retry upload remains available.</p><div class="missionFormGrid"><label>Local reviewed rides with full detail<input name="detailRides" type="number" min="1" max="100" value="${prefs.detailRides}" required/></label><label>Speeding analysis tolerance (mph)<input name="toleranceMph" type="number" min="0" max="30" value="${prefs.toleranceMph}" required/></label><label>Theme<select name="theme"><option value="night" ${prefs.theme==='night'?'selected':''}>Dark</option><option value="day" ${prefs.theme==='day'?'selected':''}>Light</option></select></label></div><label><input name="contrast" type="checkbox" ${prefs.contrast?'checked':''}/> High contrast</label><label><input name="maneuverVoice" type="checkbox" ${prefs.maneuverVoice?'checked':''}/> Maneuver voice enabled by default</label><label><input name="weatherAlerts" type="checkbox" ${prefs.weatherAlerts?'checked':''}/> Show route weather risk notices</label><p>Local detail retention applies to downloaded Review caches after backup confirmation; server records are retained. Cloud sync currently supports ride recording only. Route originals, offline networks, weather and preferences stay on this device.</p><button type="submit" class="primary">Save preferences</button><p role="status"></p></form></article>`;
  const form=host.querySelector('form'),status=form.querySelector('[role="status"]');
  form.onsubmit=async event=>{
    event.preventDefault();try{
      const {data:current,error}=await supabase.auth.getSession();if(error||current.session?.user.id!==owner||!host.isConnected)return;
      if(window.MotoRide?.getState?.().active)throw new Error('Stop recording before changing storage or display preferences.');
      const values=new FormData(form),detailRides=Number(values.get('detailRides')),toleranceMph=Number(values.get('toleranceMph'));
      if(!Number.isInteger(detailRides)||detailRides<1||detailRides>100||!Number.isFinite(toleranceMph)||toleranceMph<0||toleranceMph>30)throw new Error('Enter valid retention and tolerance values.');
      const next={automaticUpload:values.get('automaticUpload')==='on',unmeteredOnly:values.get('unmeteredOnly')==='on',detailRides,toleranceMph,theme:values.get('theme')==='day'?'day':'night',contrast:values.get('contrast')==='on',maneuverVoice:values.get('maneuverVoice')==='on',weatherAlerts:values.get('weatherAlerts')==='on'};
      await missionStore.put(owner,'preferences',next);applyAppearance(next);status.textContent='Preferences saved on this device.';
      window.dispatchEvent(new CustomEvent('moto-preferences-update',{detail:{owner,preferences:next}}));
    }catch(error){status.textContent=error.message}
  };
}
const APPEARANCE_KEY='moto-appearance-v1';
function deviceTheme(){try{const saved=localStorage.getItem(APPEARANCE_KEY);if(['day','night'].includes(saved))return saved}catch{/* Appearance still works without storage. */}return matchMedia('(prefers-color-scheme: light)').matches?'day':'night';}
function applyAppearance(prefs){
  const day=prefs.theme==='day';
  document.body.classList.toggle('mission-day',day);document.body.classList.toggle('mission-high-contrast',Boolean(prefs.contrast));
  document.documentElement.dataset.theme=day?'light':'dark';document.documentElement.style.colorScheme=day?'light':'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',day?'#f5f5f7':'#101113');
  try{localStorage.setItem(APPEARANCE_KEY,day?'day':'night')}catch{/* Device preference is optional. */}
  refreshThemeControls();
}
export function refreshThemeControls(){
  const day=document.body.classList.contains('mission-day');
  const select=document.querySelector('#missionDataPreferences [name=theme]');if(select)select.value=day?'day':'night';
  document.querySelectorAll('[data-theme-toggle]').forEach(button=>{button.setAttribute('aria-label',`Switch to ${day?'dark':'light'} mode`);button.setAttribute('title',`Switch to ${day?'dark':'light'} mode`);button.setAttribute('aria-pressed',String(day));button.innerHTML=day?'◐':'☼';});
}
export async function toggleAppearance(){
  const nextTheme=document.body.classList.contains('mission-day')?'night':'day';
  const {data,error}=await supabase.auth.getSession(),owner=data.session?.user.id;
  if(error)throw error;
  let prefs={...preferenceDefaults,theme:nextTheme};
  if(owner){
    const {data:latest,error:latestError}=await supabase.auth.getSession();if(latestError||latest.session?.user.id!==owner)throw new Error('Account changed. Try again.');
    prefs=await missionStore.update(owner,'preferences',old=>({...preferenceDefaults,...old,theme:nextTheme}));
    const {data:current}=await supabase.auth.getSession();if(current.session?.user.id!==owner)return;
  }
  applyAppearance(prefs);
}
applyAppearance({...preferenceDefaults,theme:deviceTheme()});
supabase.auth.onAuthStateChange((_event,session)=>setTimeout(async()=>{try{
  const owner=session?.user.id,stored=owner?await missionStore.get(owner,'preferences'):null;
  const prefs={...preferenceDefaults,...stored,theme:stored?.theme||deviceTheme()};
  const {data}=await supabase.auth.getSession();if(data.session?.user.id===owner)applyAppearance(prefs);
}catch{/* Storage failure leaves the current readable theme. */}},0));
