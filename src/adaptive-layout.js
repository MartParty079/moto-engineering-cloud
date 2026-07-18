const root=document.documentElement;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;

function updateViewport(){
  const viewport=window.visualViewport;
  const width=Math.max(320,Math.round(viewport?.width||window.innerWidth));
  const height=Math.max(320,Math.round(viewport?.height||window.innerHeight));
  const compact=width<=780;
  const base=standalone()?470:440;
  const scale=compact?Math.min(1,Math.max(.82,width/base)):1;

  root.style.setProperty('--app-vw',`${width}px`);
  root.style.setProperty('--app-vh',`${height}px`);
  root.style.setProperty('--app-scale',scale.toFixed(3));
  root.classList.toggle('is-standalone',standalone());
  root.classList.toggle('is-compact-viewport',compact);
  root.classList.toggle('is-short-viewport',height<700);
}

let frame=0;
function scheduleUpdate(){
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(updateViewport);
}

updateViewport();
window.addEventListener('resize',scheduleUpdate,{passive:true});
window.addEventListener('orientationchange',scheduleUpdate,{passive:true});
window.addEventListener('pageshow',scheduleUpdate,{passive:true});
window.visualViewport?.addEventListener('resize',scheduleUpdate,{passive:true});
window.visualViewport?.addEventListener('scroll',scheduleUpdate,{passive:true});
matchMedia('(display-mode: standalone)').addEventListener?.('change',scheduleUpdate);
