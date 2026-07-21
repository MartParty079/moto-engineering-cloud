const $=q=>document.querySelector(q);
let lastHeading=null;
let queued=false;

function headingEnabled(){
  return $('[data-orientation="heading"]')?.checked===true||localStorage.getItem('motoAdventureOrientationV1')==='heading'
}

function overscanScale(width,height,degrees){
  if(!width||!height||!Number.isFinite(degrees))return 1;
  const angle=Math.abs(degrees%180)*Math.PI/180;
  const c=Math.abs(Math.cos(angle));
  const s=Math.abs(Math.sin(angle));
  return Math.max(c+(height/width)*s,c+(width/height)*s,1)+0.025
}

function applyHeadingCoverage(){
  queued=false;
  const map=$('#adventureMap');
  const pane=map?.querySelector('.leaflet-map-pane');
  if(!map||!pane)return;
  const active=headingEnabled()&&Number.isFinite(lastHeading);
  const rect=map.getBoundingClientRect();
  const scale=active?overscanScale(rect.width,rect.height,lastHeading):1;
  pane.style.transformOrigin='50% 50%';
  pane.style.scale=String(scale);
  pane.style.willChange=active?'transform, rotate, scale':'';
  map.style.overflow='hidden'
}

function queueCoverage(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>requestAnimationFrame(applyHeadingCoverage))
}

window.addEventListener('moto-gps-fix',event=>{
  const heading=Number(event.detail?.heading);
  if(Number.isFinite(heading))lastHeading=heading;
  queueCoverage()
});

document.addEventListener('click',event=>{
  if(event.target.closest('[data-orientation],#advFull'))queueCoverage()
},true);

window.addEventListener('resize',queueCoverage);
window.addEventListener('orientationchange',()=>setTimeout(queueCoverage,120));
window.visualViewport?.addEventListener('resize',queueCoverage);

const observer=new MutationObserver(mutations=>{
  if(mutations.some(m=>[...m.addedNodes].some(node=>node.nodeType===1&&(node.id==='adventureOverlay'||node.querySelector?.('#adventureMap')))))queueCoverage()
});
observer.observe(document.body,{childList:true,subtree:true});
queueCoverage();
