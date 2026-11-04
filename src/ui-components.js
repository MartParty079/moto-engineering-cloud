import './ui-components.css';

export const escapeUI = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
export const sheetStates = ['hidden','minimized','half','expanded','fullscreen'];
const sheets = new Set();

export function setSheetState(sheet, state) {
  if (!sheetStates.includes(state)) throw new Error('Invalid panel state.');
  if (['half','expanded','fullscreen'].includes(state)) {
    for (const other of sheets) if (other !== sheet && other.dataset.sheetGroup === sheet.dataset.sheetGroup && !other.hidden) setSheetState(other,'minimized');
  }
  sheet.dataset.panelState = state;
  sheet.hidden = state === 'hidden';
  sheet.setAttribute('aria-hidden',String(sheet.hidden));
  const handle = sheet.querySelector('[data-panel-handle]');
  handle?.setAttribute('aria-expanded',String(!['hidden','minimized'].includes(state)));
  sheet.dispatchEvent(new CustomEvent('mm-panel-change',{bubbles:true,detail:{state,key:sheet.dataset.panelKey}}));
}

export function mountSheet(sheet,{key,group='workspace',initial='minimized',dismissible=true}={}) {
  if (sheet.dataset.panelReady) return sheet;
  sheet.dataset.panelReady = 'true';sheet.dataset.panelKey = key || sheet.id;sheet.dataset.sheetGroup = group;
  sheet.classList.add('mmSheet');sheets.add(sheet);
  const header=document.createElement('header');header.className='mmSheetHeader';
  header.innerHTML=`<button type="button" data-panel-handle aria-label="Expand or minimize ${escapeUI(sheet.getAttribute('aria-label') || 'panel')}"><i aria-hidden="true"></i><span>${escapeUI(sheet.getAttribute('aria-label') || 'Details')}</span></button><button type="button" data-panel-expand aria-label="Expand panel to fullscreen">⛶</button>${dismissible?'<button type="button" data-panel-close aria-label="Dismiss panel">×</button>':''}`;
  const content=document.createElement('div');content.className='mmSheetContent';
  content.append(...sheet.childNodes);sheet.append(header,content);
  const handle=header.querySelector('[data-panel-handle]');
  const step=delta=>{const index=Math.max(1,sheetStates.indexOf(sheet.dataset.panelState));setSheetState(sheet,sheetStates[Math.max(1,Math.min(4,index+delta))]);};
  handle.onclick=()=>setSheetState(sheet,sheet.dataset.panelState==='minimized'?'half':'minimized');
  handle.onkeydown=event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();step(event.key==='ArrowUp'?1:-1);}if(event.key==='Escape')setSheetState(sheet,'minimized');};
  header.querySelector('[data-panel-expand]').onclick=()=>setSheetState(sheet,sheet.dataset.panelState==='fullscreen'?'half':'fullscreen');
  header.querySelector('[data-panel-close]')?.addEventListener('click',()=>setSheetState(sheet,'hidden'));
  let start;
  handle.addEventListener('pointerdown',event=>{start={x:event.clientX,y:event.clientY};handle.setPointerCapture(event.pointerId);});
  handle.addEventListener('pointerup',event=>{if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(Math.abs(dy)>35&&Math.abs(dy)>Math.abs(dx)){step(dy<0?1:-1);const cancel=click=>{click.preventDefault();click.stopImmediatePropagation();};handle.addEventListener('click',cancel,{capture:true,once:true});setTimeout(()=>handle.removeEventListener('click',cancel,true),0);}});
  handle.addEventListener('pointercancel',()=>{start=null;});
  setSheetState(sheet,initial);return sheet;
}

export function mountSegments(host,items,onChange,initial=items[0][0]) {
  host.classList.add('mmSegments');host.setAttribute('role','tablist');
  host.innerHTML=items.map(([id,label])=>`<button type="button" role="tab" data-mode="${escapeUI(id)}" aria-selected="${id===initial}" tabindex="${id===initial?0:-1}">${escapeUI(label)}</button>`).join('');
  const choose=id=>{host.querySelectorAll('[data-mode]').forEach(button=>{const on=button.dataset.mode===id;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;});onChange(id);};
  host.onclick=event=>{const button=event.target.closest('[data-mode]');if(button)choose(button.dataset.mode);};
  host.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...host.querySelectorAll('button')],i=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();choose(buttons[next].dataset.mode);};
  host.choose=choose;return host;
}

export function metricCard(label,value='—',unit='',detail='') {
  return `<article class="mmMetricCard"><small>${escapeUI(label)}</small><strong>${escapeUI(value)}<span>${escapeUI(unit)}</span></strong>${detail?`<p>${escapeUI(detail)}</p>`:''}</article>`;
}
export function statusChip(label,available=false){return `<span class="mmStatusChip ${available?'available':''}">${escapeUI(label)}</span>`;}
window.addEventListener('moto-workspaces-reset',()=>{sheets.clear();});
