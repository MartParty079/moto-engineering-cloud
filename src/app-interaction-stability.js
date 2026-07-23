const INTERACTIVE_SELECTOR='button,a[href],[role="button"],summary,label[for],label:has(input[type="file"])';
const FAST_TAP_WINDOW_MS=360;
const PRESS_FEEDBACK_MS=170;
const MOVE_CANCEL_PX=13;
const pendingRoots=new Set();
const pointerState=new Map();
const lastTrustedActivation=new WeakMap();
let scanFrame=0;
let observer=null;

const isElement=value=>value?.nodeType===1;
const visible=element=>Boolean(element?.isConnected&&!element.hidden&&element.getAttribute('aria-hidden')!=='true'&&getComputedStyle(element).display!=='none'&&getComputedStyle(element).visibility!=='hidden');
const normalizedText=element=>(element?.textContent||'').replace(/\s+/g,' ').trim();
const actionableFrom=target=>isElement(target)?target.closest(INTERACTIVE_SELECTOR):null;
const isNativeInteractive=element=>element?.matches?.('button,a[href],summary,input,select,textarea');

function idLabel(id=''){
  return id
    .replace(/([a-z0-9])([A-Z])/g,'$1 $2')
    .replace(/[-_]+/g,' ')
    .replace(/\b(btn|button|control|action|nav)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function inferredLabel(element){
  const explicit=element.getAttribute('aria-label')||element.getAttribute('title')||element.dataset.label||element.dataset.actionLabel;
  if(explicit?.trim())return explicit.trim();
  const text=normalizedText(element);
  if(text&&text.length>1&&!/^[×✕✖+＋−–—⋮⋯☰↻⌕<>‹›←→]+$/.test(text))return text;
  const glyph={
    '×':'Close','✕':'Close','✖':'Close','☰':'Open navigation','↻':'Refresh','⌕':'Search',
    '+':'Add','＋':'Add','−':'Remove','←':'Previous','→':'Next','‹':'Previous','›':'Next','⋮':'More options','⋯':'More options'
  }[text];
  if(glyph)return glyph;
  return idLabel(element.id)||idLabel(element.dataset.go)||idLabel(element.dataset.v)||idLabel(element.dataset.action)||'';
}

function isObviousNonSubmit(button){
  if(!button.closest('form'))return true;
  if(button.matches('[data-close],[data-cancel],[data-dismiss],[data-delete],[data-del],[data-remove],[data-edit],[data-tab],[data-page],[data-go],[data-v],[data-toggle],[data-open],[data-back],[data-left],[data-right]'))return true;
  const key=`${button.id} ${button.className} ${button.getAttribute('aria-label')||''}`.toLowerCase();
  return /close|cancel|dismiss|delete|remove|edit|toggle|preview|back|next|previous|tab|picker/.test(key);
}

function normalizeButton(button){
  if(button.tagName==='BUTTON'&&!button.hasAttribute('type')&&isObviousNonSubmit(button))button.type='button';
  if(button.matches('button,[role="button"]')){
    const label=inferredLabel(button);
    if(label&&!button.getAttribute('aria-label')&&(!normalizedText(button)||normalizedText(button).length<=1||button.querySelector('svg')))button.setAttribute('aria-label',label);
  }
  if(button.matches('[role="button"]')&&!isNativeInteractive(button)&&!button.hasAttribute('tabindex'))button.tabIndex=0;
  if(button.disabled||button.getAttribute('aria-disabled')==='true')button.classList.remove('ui-press-active');
}

function repairNestedInteractive(root){
  root.querySelectorAll?.('button button,button a[href],a[href] button,[role="button"] button').forEach(inner=>{
    const outer=inner.parentElement?.closest('button,a[href],[role="button"]');
    if(!outer||outer===inner)return;
    inner.dataset.uiNestedInteractive='true';
    inner.tabIndex=-1;
    inner.setAttribute('aria-hidden','true');
  });
}

function repairDuplicateIds(root=document){
  const grouped=new Map();
  root.querySelectorAll?.('[id]').forEach(element=>{
    if(!grouped.has(element.id))grouped.set(element.id,[]);
    grouped.get(element.id).push(element);
  });
  for(const [id,elements] of grouped){
    if(elements.length<2)continue;
    const keeper=elements.find(visible)||elements[0];
    elements.forEach(element=>{
      if(element===keeper)return;
      const exactDuplicate=element.parentElement===keeper.parentElement&&element.tagName===keeper.tagName&&normalizedText(element)===normalizedText(keeper);
      if(exactDuplicate&&element.matches('button,[role="button"],a[href]'))element.remove();
      else element.dataset.uiDuplicateId=id;
    });
  }
}

function syncCurrentNavigation(){
  document.querySelectorAll('#nav [data-v],.motoBottomNav [data-go]').forEach(button=>{
    const active=button.classList.contains('active');
    if(active)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  document.querySelector('.menuButton')?.setAttribute('aria-expanded',String(Boolean(document.querySelector('#nav')?.classList.contains('open'))));
}

function syncDialogs(){
  const dialogs=[...document.querySelectorAll('.modal:not(.hidden),[role="dialog"],[id$="Modal"],[id$="Picker"],[id$="Sheet"]')].filter(visible);
  document.body.classList.toggle('has-ui-dialog',dialogs.length>0);
  dialogs.forEach(dialog=>{
    if(!dialog.hasAttribute('role'))dialog.setAttribute('role','dialog');
    if(!dialog.hasAttribute('aria-modal'))dialog.setAttribute('aria-modal','true');
  });
}

function scan(root=document){
  if(!root?.querySelectorAll)return;
  if(root.matches?.(INTERACTIVE_SELECTOR))normalizeButton(root);
  root.querySelectorAll(INTERACTIVE_SELECTOR).forEach(normalizeButton);
  repairNestedInteractive(root);
  if(root===document||root===document.body||root.id==='app')repairDuplicateIds(document);
  syncCurrentNavigation();
  syncDialogs();
}

function scheduleScan(root=document){
  if(root)pendingRoots.add(root);
  if(scanFrame)return;
  scanFrame=requestAnimationFrame(()=>{
    scanFrame=0;
    const roots=[...pendingRoots];
    pendingRoots.clear();
    if(roots.length>16)scan(document);
    else roots.forEach(item=>scan(item));
  });
}

function clearPressState(element){
  element?.classList.remove('ui-press-active');
  element?.removeAttribute('data-ui-pressed');
}

function pressFeedback(element){
  if(!element||element.matches('input,select,textarea'))return;
  element.classList.add('ui-press-active');
  element.dataset.uiPressed='true';
  clearTimeout(element.__motoPressTimer);
  element.__motoPressTimer=setTimeout(()=>clearPressState(element),PRESS_FEEDBACK_MS);
}

function repeatAllowed(element){
  return Boolean(element.closest('[data-ui-repeat],.leaflet-control-zoom,.leaflet-control,[data-map-control]')||element.matches('input,select,textarea,summary'));
}

function closeNavigationForRoute(element){
  const route=element.closest('[data-v],[data-go]');
  if(!route)return;
  const go=route.dataset.go;
  if(go==='menu')return;
  const nav=document.querySelector('#nav');
  nav?.classList.remove('open');
  document.body.classList.remove('menu-open');
  document.querySelector('.menuButton')?.setAttribute('aria-expanded','false');
  document.querySelector('#searchResults')?.classList.add('hidden');
}

function onPointerDown(event){
  const action=actionableFrom(event.target);
  if(!action||event.button>0)return;
  pointerState.set(event.pointerId,{action,x:event.clientX,y:event.clientY,moved:false});
  pressFeedback(action);
}

function onPointerMove(event){
  const state=pointerState.get(event.pointerId);
  if(!state)return;
  if(Math.hypot(event.clientX-state.x,event.clientY-state.y)>MOVE_CANCEL_PX){
    state.moved=true;
    clearPressState(state.action);
  }
}

function onPointerEnd(event){
  const state=pointerState.get(event.pointerId);
  if(!state)return;
  if(event.type==='pointercancel')clearPressState(state.action);
  setTimeout(()=>pointerState.delete(event.pointerId),0);
}

function onTrustedClick(event){
  if(!event.isTrusted)return;
  const action=actionableFrom(event.target);
  if(!action)return;

  if(action.matches(':disabled')||action.getAttribute('aria-disabled')==='true'){
    event.preventDefault();
    event.stopImmediatePropagation();
    clearPressState(action);
    return;
  }

  const pointer=[...pointerState.values()].find(value=>value.action===action);
  if(pointer?.moved){
    event.preventDefault();
    event.stopImmediatePropagation();
    clearPressState(action);
    return;
  }

  const now=performance.now();
  const previous=lastTrustedActivation.get(action)||0;
  if(!repeatAllowed(action)&&now-previous<FAST_TAP_WINDOW_MS){
    event.preventDefault();
    event.stopImmediatePropagation();
    clearPressState(action);
    return;
  }
  lastTrustedActivation.set(action,now);

  const activeRoute=action.closest('#nav [data-v].active');
  if(activeRoute){
    closeNavigationForRoute(action);
    event.preventDefault();
    event.stopImmediatePropagation();
    clearPressState(action);
    return;
  }

  closeNavigationForRoute(action);
  pressFeedback(action);
  requestAnimationFrame(syncCurrentNavigation);
}

function onKeyboard(event){
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
    const search=document.querySelector('#globalSearch');
    if(search){event.preventDefault();search.focus();search.select?.();}
    return;
  }

  if(event.key==='Escape'){
    const search=document.querySelector('#searchResults');
    if(search&&!search.classList.contains('hidden')){search.classList.add('hidden');return;}
    const nav=document.querySelector('#nav.open');
    if(nav){nav.classList.remove('open');document.querySelector('.menuButton')?.setAttribute('aria-expanded','false');return;}
    const dialogs=[...document.querySelectorAll('[aria-modal="true"]')].filter(visible);
    const top=dialogs.at(-1);
    const close=top?.querySelector('[data-close],[data-dismiss],[aria-label*="close" i],button[id*="close" i],.close');
    close?.click();
    return;
  }

  if((event.key==='Enter'||event.key===' ')&&event.target?.matches?.('[role="button"]')&&!isNativeInteractive(event.target)){
    event.preventDefault();
    event.target.click();
  }
}

function cleanupTransientState(){
  document.querySelectorAll('.ui-press-active,[data-ui-pressed]').forEach(clearPressState);
  pointerState.clear();
  syncDialogs();
}

function runtimeAudit(){
  const interactives=[...document.querySelectorAll(INTERACTIVE_SELECTOR)];
  const unnamed=interactives.filter(element=>!inferredLabel(element));
  const duplicateIds=[...document.querySelectorAll('[data-ui-duplicate-id]')].map(element=>element.id);
  const nested=[...document.querySelectorAll('[data-ui-nested-interactive]')];
  const smallTargets=interactives.filter(element=>{
    if(!visible(element)||element.closest('#rideDashOverlay[data-ride-active="true"],.leaflet-control'))return false;
    const rect=element.getBoundingClientRect();
    return rect.width>0&&rect.height>0&&(rect.width<32||rect.height<32);
  });
  return {
    interactiveCount:interactives.length,
    unnamedCount:unnamed.length,
    duplicateIdCount:new Set(duplicateIds).size,
    nestedInteractiveCount:nested.length,
    smallTargetCount:smallTargets.length,
    unnamed,duplicateIds:[...new Set(duplicateIds)],nested,smallTargets
  };
}

function install(){
  scan(document);
  document.addEventListener('pointerdown',onPointerDown,{capture:true,passive:true});
  document.addEventListener('pointermove',onPointerMove,{capture:true,passive:true});
  document.addEventListener('pointerup',onPointerEnd,{capture:true,passive:true});
  document.addEventListener('pointercancel',onPointerEnd,{capture:true,passive:true});
  document.addEventListener('click',onTrustedClick,true);
  document.addEventListener('keydown',onKeyboard,true);

  observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      mutation.addedNodes.forEach(node=>{if(isElement(node))scheduleScan(node)});
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});

  ['moto-page-ready','moto-ride-dash-opened','moto-ride-dash-rendered','moto-route-update','moto-permissions-change'].forEach(name=>window.addEventListener(name,event=>scheduleScan(event.detail?.overlay||document)));
  window.addEventListener('pageshow',()=>{cleanupTransientState();scheduleScan(document)});
  window.addEventListener('pagehide',cleanupTransientState);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cleanupTransientState()});

  window.MotoUIAudit={run:runtimeAudit,rescan:()=>scan(document),cleanup:cleanupTransientState};
  window.dispatchEvent(new CustomEvent('moto-ui-stability-ready'));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
