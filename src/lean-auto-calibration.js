const $ = selector => document.querySelector(selector);
const angleDiff = (a,b) => !Number.isFinite(a)||!Number.isFinite(b) ? Infinity : Math.abs(((a-b+540)%360)-180);
const median = values => {
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};
const spread = values => {
  const usable=values.filter(Number.isFinite);
  return usable.length?Math.max(...usable)-Math.min(...usable):0;
};
const circularSpread = values => {
  const usable=values.filter(Number.isFinite);
  if(usable.length<2)return 0;
  return Math.max(...usable.map(value=>angleDiff(value,usable[0])));
};

let samples=[];
let lastSample=null;
let accelG=null;
let calibrating=false;
let calibrated=false;
let zeroHandler=null;
let boundButton=null;
let lastScreenAngle=null;
let statusAt=0;

function screenAngle(){
  const raw=Number(window.screen?.orientation?.angle ?? window.orientation ?? 0);
  return ((raw%360)+360)%360;
}
function currentSpeed(){
  const raw=window.MotoGPS?.speed ?? window.__motoLatestGpsFix?.speed;
  const value=raw===null||raw===undefined?null:Number(raw);
  return Number.isFinite(value)?value:null;
}
function currentHeading(){
  const raw=window.MotoGPS?.heading ?? window.__motoLatestGpsFix?.heading;
  const value=raw===null||raw===undefined?null:Number(raw);
  return Number.isFinite(value)?value:null;
}
function setStatus(text,badge='CALIBRATING'){
  const status=$('#safeSensorStatus'),indicator=$('#safeSensorsBadge');
  if(status)status.textContent=text;
  if(indicator)indicator.textContent=badge;
}
function throttledStatus(text){
  if(Date.now()-statusAt<300)return;
  statusAt=Date.now();
  setStatus(text);
}
function startCalibration(reason='Auto calibration started. Hold the motorcycle upright and steady, or ride straight at a steady speed.'){
  samples=[];
  lastSample=null;
  calibrating=true;
  calibrated=false;
  lastScreenAngle=screenAngle();
  setStatus(reason);
}
function stableCandidate(sample){
  const speed=sample.speed;
  const parked=(!Number.isFinite(speed)||speed<3)&&Math.abs(sample.gamma)<=8;
  const moving=Number.isFinite(speed)&&speed>=8&&speed<=100;
  const gravityStable=!Number.isFinite(accelG)||Math.abs(accelG-1)<=0.12;
  if(!parked&&!moving)return false;
  if(!gravityStable)return false;
  if(!lastSample)return true;
  const leanStable=Math.abs(sample.gamma-lastSample.gamma)<=1.2;
  const pitchStable=!Number.isFinite(sample.beta)||!Number.isFinite(lastSample.beta)||Math.abs(sample.beta-lastSample.beta)<=1.8;
  const yawStable=!Number.isFinite(sample.alpha)||!Number.isFinite(lastSample.alpha)||angleDiff(sample.alpha,lastSample.alpha)<=3;
  return leanStable&&pitchStable&&yawStable;
}
function windowStable(rows){
  if(spread(rows.map(row=>row.gamma))>3.5||spread(rows.map(row=>row.beta))>5)return false;
  const moving=rows.some(row=>Number.isFinite(row.speed)&&row.speed>=8);
  if(!moving)return true;
  const headings=rows.map(row=>row.heading).filter(Number.isFinite);
  const alphas=rows.map(row=>row.alpha).filter(Number.isFinite);
  if(headings.length>=2)return circularSpread(headings)<=6;
  if(alphas.length>=2)return circularSpread(alphas)<=6;
  return true;
}
function finishCalibration(){
  if(typeof zeroHandler!=='function')return;
  const baseline=median(samples.map(row=>row.gamma));
  zeroHandler();
  calibrating=false;
  calibrated=true;
  samples=[];
  setStatus(`Lean auto calibrated · ${Number.isFinite(baseline)?baseline.toFixed(1):'0.0'}° sensor offset. Recalibration will restart if phone orientation changes.`,'ACTIVE');
  window.dispatchEvent(new CustomEvent('moto-lean-calibrated',{detail:{automatic:true,screenAngle:screenAngle(),timestamp:Date.now()}}));
}
function onOrientation(event){
  const gamma=typeof event.gamma==='number'?event.gamma:null,beta=typeof event.beta==='number'?event.beta:null,alpha=typeof event.alpha==='number'?event.alpha:null;
  if(!Number.isFinite(gamma))return;
  const angle=screenAngle();
  if(lastScreenAngle!==null&&angle!==lastScreenAngle&&(calibrated||calibrating))startCalibration('Phone orientation changed. Auto recalibrating lean.');
  lastScreenAngle=angle;
  if(!calibrating){
    queueMicrotask(publishCorrectedMotion);
    return;
  }
  const sample={gamma,beta:Number.isFinite(beta)?beta:null,alpha:Number.isFinite(alpha)?alpha:null,speed:currentSpeed(),heading:currentHeading(),at:Date.now()};
  if(!stableCandidate(sample)){
    samples=[];
    throttledStatus('Auto calibration waiting for an upright, steady motorcycle or a straight steady section.');
    lastSample=sample;
    return;
  }
  samples.push(sample);
  samples=samples.filter(row=>sample.at-row.at<=2600);
  const duration=samples.at(-1).at-samples[0].at;
  const progress=Math.min(99,Math.round(Math.min(1,samples.length/24,duration/1800)*100));
  throttledStatus(`Auto calibrating lean… ${progress}%`);
  if(samples.length>=24&&duration>=1800&&windowStable(samples))finishCalibration();
  lastSample=sample;
  queueMicrotask(publishCorrectedMotion);
}
function onMotion(event){
  const acceleration=event.accelerationIncludingGravity||event.acceleration||{};
  if([acceleration.x,acceleration.y,acceleration.z].every(Number.isFinite))accelG=Math.sqrt(acceleration.x**2+acceleration.y**2+acceleration.z**2)/9.80665;
  queueMicrotask(publishCorrectedMotion);
}
function parseMetric(selector){
  const value=parseFloat($(selector)?.textContent||'');
  return Number.isFinite(value)?value:null;
}
function publishCorrectedMotion(){
  const lean=parseMetric('#safeLean'),pitch=parseMetric('#safePitch'),roll=parseMetric('#safeRoll'),accel=parseMetric('#safeAccel');
  if(![lean,pitch,roll,accel].some(Number.isFinite))return;
  window.dispatchEvent(new CustomEvent('moto-motion-update',{detail:{lean:calibrated?lean:null,pitch,roll,accel,calibrated,automaticCalibration:true}}));
}
function bindControls(){
  const button=$('#zeroRideLean');
  if(!button||button===boundButton)return;
  boundButton=button;
  zeroHandler=typeof button.onclick==='function'?button.onclick.bind(button):null;
  button.textContent='RECALIBRATE';
  button.onclick=()=>startCalibration('Manual recalibration started. Hold the motorcycle upright and steady, or ride straight at a steady speed.');
  const enable=$('#enableRideSensors');
  if(enable&&!enable.dataset.autoLeanBound){
    enable.dataset.autoLeanBound='1';
    enable.addEventListener('click',()=>setTimeout(()=>startCalibration(),100));
  }
}
function refresh(){
  bindControls();
  if($('#rideSafeEnhancements')&&!calibrating&&!calibrated&&$('#safeSensorsBadge')?.textContent==='ACTIVE')startCalibration();
  if(!$('#rideSafeEnhancements')){
    boundButton=null;
    zeroHandler=null;
    samples=[];
    lastSample=null;
    calibrating=false;
    calibrated=false;
  }
}

window.addEventListener('deviceorientation',onOrientation,{passive:true});
window.addEventListener('devicemotion',onMotion,{passive:true});
const observer=new MutationObserver(()=>queueMicrotask(refresh));
observer.observe(document.body,{childList:true,subtree:true});
refresh();
