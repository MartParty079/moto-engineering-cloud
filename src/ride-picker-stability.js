const PICKER_SELECTOR = '#dashRidePicker';

let activeOperation = 0;
let startBusy = false;
let phaseTimers = [];

function clearPhaseTimers(){
  phaseTimers.forEach(clearTimeout);
  phaseTimers = [];
}

function overlay(){
  return document.querySelector('#rideDashOverlay');
}

function setPickerOpen(open){
  const dash = overlay();
  dash?.classList.toggle('ride-picker-open',open);
  document.body.classList.toggle('ride-picker-open',open);
}

function preparePicker(picker){
  if(!picker || picker.dataset.stabilityReady === '1') return;
  picker.dataset.stabilityReady = '1';
  picker.setAttribute('role','dialog');
  picker.setAttribute('aria-modal','true');
  picker.setAttribute('aria-label','Select a motorcycle to start the ride');
  setPickerOpen(true);
}

function closePicker(picker){
  if(startBusy) return;
  clearPhaseTimers();
  picker?.remove();
  setPickerOpen(false);
}

function phase(picker,message,detail){
  const title = picker?.querySelector('[data-start-title]');
  const copy = picker?.querySelector('[data-start-detail]');
  if(title) title.textContent = message;
  if(copy && detail) copy.textContent = detail;
}

function progressMarkup(name){
  return `<section class="dashRideStartProgress" aria-live="polite">
    <header>
      <div><small>START RIDE</small><h3>Preparing ${escapeHtml(name)}</h3></div>
      <button type="button" class="dashRideStartLocked" aria-label="Ride startup in progress" disabled>×</button>
    </header>
    <div class="dashRideStartHero">
      <span class="dashRideStartSpinner" aria-hidden="true"></span>
      <div><strong data-start-title>Connecting ride logger…</strong><p data-start-detail>Creating the ride session. The dashboard will open automatically.</p></div>
    </div>
    <div class="dashRideStartSteps" aria-hidden="true">
      <span class="active">SESSION</span><i></i><span>GPS</span><i></i><span>DASH</span>
    </div>
  </section>`;
}

function errorMarkup(name,message,bikeId){
  return `<section class="dashRideStartProgress dashRideStartError" role="alert">
    <header><div><small>RIDE START INTERRUPTED</small><h3>${escapeHtml(name)}</h3></div><button type="button" data-picker-close aria-label="Close">×</button></header>
    <div class="dashRideStartHero">
      <span class="dashRideStartErrorIcon" aria-hidden="true">!</span>
      <div><strong>Ride did not start</strong><p>${escapeHtml(message || 'The logger did not respond. No ride is currently recording.')}</p></div>
    </div>
    <div class="dashRideStartActions"><button type="button" data-picker-close>CLOSE</button><button type="button" data-bike-id="${escapeHtml(bikeId)}" data-bike-name="${escapeHtml(name)}" class="primary">TRY AGAIN</button></div>
  </section>`;
}

function escapeHtml(value=''){
  return String(value ?? '').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
}

function completePicker(picker){
  if(!picker?.isConnected) return;
  phase(picker,'Ride ready','GPS will lock as signal becomes available.');
  picker.classList.add('ride-start-success');
  const steps = picker.querySelectorAll('.dashRideStartSteps span');
  steps.forEach(step => step.classList.add('active'));
  setTimeout(()=>{
    picker.remove();
    setPickerOpen(false);
  },260);
}

async function beginRide(picker,button){
  if(startBusy || !picker?.isConnected) return;
  const controller = window.MotoRide;
  const bikeId = button.dataset.bikeId;
  const name = button.dataset.bikeName || button.querySelector('strong')?.textContent?.trim() || 'Motorcycle';

  if(!controller?.start){
    picker.querySelector('section').outerHTML = errorMarkup(name,'Ride services are still loading. Try again in a moment.',bikeId);
    return;
  }

  startBusy = true;
  const operation = ++activeOperation;
  clearPhaseTimers();
  picker.classList.add('ride-starting');
  picker.innerHTML = progressMarkup(name);
  navigator.vibrate?.(12);

  phaseTimers.push(setTimeout(()=>phase(picker,'Securing ride session…','Saving the ride start and preparing GPS tracking.'),2800));
  phaseTimers.push(setTimeout(()=>phase(picker,'Still connecting…','A slow connection can take several seconds. The app remains responsive.'),8000));

  try{
    await controller.start(bikeId);
    if(operation !== activeOperation) return;
    const state = controller.getState?.() || {};
    if(!state.active) throw new Error(state.gpsError || 'The ride logger returned without an active session.');
    completePicker(picker);
  }catch(error){
    if(operation !== activeOperation) return;
    console.error('Motorcycle selection start failed',error);
    picker.classList.remove('ride-starting');
    picker.innerHTML = errorMarkup(name,error?.message || String(error),bikeId);
  }finally{
    if(operation === activeOperation){
      clearPhaseTimers();
      startBusy = false;
    }
  }
}

// Capture clicks before the legacy picker handler so only one ride-start request can run.
document.addEventListener('click',event=>{
  const picker = event.target.closest?.(PICKER_SELECTOR);
  if(!picker) return;

  const close = event.target.closest('[data-picker-close],#dashRidePickerClose');
  if(close){
    event.preventDefault();
    event.stopImmediatePropagation();
    closePicker(picker);
    return;
  }

  const bike = event.target.closest('[data-bike-id]');
  if(!bike) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void beginRide(picker,bike);
},true);

window.addEventListener('moto-ride-state',event=>{
  const picker = document.querySelector(PICKER_SELECTOR);
  if(picker && event.detail?.active) completePicker(picker);
});

window.addEventListener('moto-ride-dash-closed',()=>{
  activeOperation += 1;
  startBusy = false;
  clearPhaseTimers();
  setPickerOpen(false);
});

const observer = new MutationObserver(mutations=>{
  let pickerFound = false;
  for(const mutation of mutations){
    for(const node of mutation.addedNodes){
      if(node.nodeType !== 1) continue;
      const picker = node.matches?.(PICKER_SELECTOR) ? node : node.querySelector?.(PICKER_SELECTOR);
      if(picker){ preparePicker(picker); pickerFound = true; }
    }
  }
  if(!pickerFound && !document.querySelector(PICKER_SELECTOR)) setPickerOpen(false);
});
observer.observe(document.body,{childList:true,subtree:true});
preparePicker(document.querySelector(PICKER_SELECTOR));