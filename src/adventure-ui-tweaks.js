const $=q=>document.querySelector(q);
let hiddenRole=[];

function hideRoleBadge(){
  hiddenRole=[];
  document.querySelectorAll('body *').forEach(el=>{
    if(el.closest('#adventureOverlay')) return;
    const text=(el.textContent||'').trim();
    if(!/^Administrator(?:\s|$)/i.test(text)) return;
    const r=el.getBoundingClientRect();
    const style=getComputedStyle(el);
    if((style.position==='fixed'||style.position==='absolute')&&r.width>100&&r.height<120){
      hiddenRole.push([el,el.style.display]);
      el.style.display='none';
    }
  });
}
function restoreRoleBadge(){hiddenRole.forEach(([el,d])=>{if(el?.isConnected)el.style.display=d});hiddenRole=[]}

function polishAdventure(){
  const overlay=$('#adventureOverlay');
  if(!overlay)return false;
  hideRoleBadge();
  const limitLabel=overlay.querySelector('[data-metric="limit"] small');
  if(limitLabel)limitLabel.textContent='SPEED LIMIT';
  const dataSheet=$('#advDataSheet');
  if(dataSheet&&!dataSheet.dataset.polished){
    dataSheet.dataset.polished='1';
    const choices=dataSheet.querySelector('.advMetricChoices');
    if(choices){
      choices.insertAdjacentHTML('beforebegin','<div class="advDataIntro"><small>MAP OVERLAY</small><strong>Choose what stays visible while riding</strong><p>Keep only the information you need for a clear map view.</p></div>');
      choices.querySelectorAll('label').forEach(label=>{
        const input=label.querySelector('input');
        const text=label.textContent.trim();
        label.innerHTML=`<span><strong>${text}</strong><small>${text==='Speed'?'Live GPS speed':text==='Speed limit'?'Posted road limit':text==='Road'?'Current mapped road':text==='Heading'?'Course direction':text==='Altitude'?'GPS elevation':'Current GPS precision'}</small></span>`;
        label.prepend(input);
      });
    }
    const toggle=$('#advOverlayToggle');
    if(toggle){toggle.textContent='HIDE DATA OVERLAY';toggle.classList.add('advOverlayVisibility')}
  }
  return true;
}

const observer=new MutationObserver(()=>{
  if($('#adventureOverlay')) polishAdventure();
  else restoreRoleBadge();
});
observer.observe(document.body,{childList:true,subtree:true});
setInterval(()=>{if($('#adventureOverlay'))polishAdventure()},1000);
