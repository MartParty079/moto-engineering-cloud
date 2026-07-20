const OVERLAY_SELECTOR = '#rideDashOverlay';

function rideIsActive(control){
  return Boolean(control?.classList.contains('recording'));
}

function syncRideDashState(overlay){
  const control = overlay.querySelector('#dashRideControl');
  const rideButton = overlay.querySelector('#dashRideToggle');
  const adventureButton = overlay.querySelector('#dashAdventure');
  const editButton = overlay.querySelector('#dashEdit');
  if(!control || !rideButton || !adventureButton || !editButton) return;

  const active = rideIsActive(control);
  const editing = overlay.classList.contains('editing');

  overlay.dataset.rideActive = active ? 'true' : 'false';
  rideButton.classList.toggle('recording', active);
  rideButton.classList.toggle('starting', control.classList.contains('starting'));

  if(!editing) editButton.textContent = active ? 'SET' : 'EDIT';
  adventureButton.textContent = active ? 'MAP' : 'ADV';
  adventureButton.title = active ? 'Open map and Adventure Mode' : 'Open Adventure Mode';

  if(!active) overlay.querySelector('#dashRideQuickSettings')?.remove();
}

function openRideQuickSettings(overlay, controls){
  overlay.querySelector('#dashRideQuickSettings')?.remove();

  const modal = document.createElement('div');
  modal.id = 'dashRideQuickSettings';
  modal.className = 'dashRideQuickSettings';
  modal.innerHTML = `<section role="dialog" aria-modal="true" aria-label="Ride settings">
    <header>
      <div><small>LIVE RIDE</small><h3>Settings</h3></div>
      <button id="dashRideSettingsClose" type="button" aria-label="Close settings">×</button>
    </header>
    <div class="dashRideSettingsGrid">
      <button id="dashRideSettingsStyle" type="button"><span>STYLE</span><small>Vibe, color and gauges</small></button>
      <button id="dashRideSettingsLayout" type="button"><span>LAYOUT</span><small>Widgets and displays</small></button>
      <button id="dashRideSettingsStop" class="danger" type="button"><span>STOP & SAVE</span><small>Finish the current ride</small></button>
    </div>
  </section>`;

  overlay.appendChild(modal);

  const close = () => modal.remove();
  modal.addEventListener('click', event => { if(event.target === modal) close(); });
  modal.querySelector('#dashRideSettingsClose').onclick = close;
  modal.querySelector('#dashRideSettingsStyle').onclick = () => {
    close();
    controls.styleButton.click();
  };
  modal.querySelector('#dashRideSettingsLayout').onclick = () => {
    close();
    controls.originalEditHandler?.call(controls.editButton);
    requestAnimationFrame(() => syncRideDashState(overlay));
  };
  modal.querySelector('#dashRideSettingsStop').onclick = () => {
    close();
    controls.rideButton.click();
  };
}

function enhanceRideDash(overlay){
  if(!overlay || overlay.dataset.headerControlsV2 === 'ready') return;

  const headerActions = overlay.querySelector('.dashHeaderActions');
  const rideButton = overlay.querySelector('#dashRideToggle');
  const adventureButton = overlay.querySelector('#dashAdventure');
  const styleButton = overlay.querySelector('#dashStyle');
  const editButton = overlay.querySelector('#dashEdit');
  const footer = overlay.querySelector('.rideDash>footer');
  const addDisplayButton = overlay.querySelector('#dashAddPage');
  const rideControl = overlay.querySelector('#dashRideControl');

  if(!headerActions || !rideButton || !footer || !styleButton || !editButton || !rideControl) return;

  overlay.dataset.headerControlsV2 = 'ready';

  rideButton.classList.add('dashHeaderRideToggle');
  rideButton.title = 'Start or stop the current ride';
  rideButton.setAttribute('aria-label', 'Start or stop ride');
  headerActions.insertBefore(rideButton, adventureButton || headerActions.firstChild);

  styleButton.classList.add('dashEditStyleButton');
  styleButton.textContent = 'STYLE';
  styleButton.title = 'Change dashboard vibe, color and display settings';
  styleButton.setAttribute('aria-label', 'Edit dashboard style');
  footer.insertBefore(styleButton, addDisplayButton || footer.lastElementChild);

  const originalEditHandler = editButton.onclick;
  editButton.onclick = event => {
    const active = rideIsActive(rideControl);
    const editing = overlay.classList.contains('editing');

    if(active && !editing){
      openRideQuickSettings(overlay, {rideButton, styleButton, editButton, originalEditHandler});
      return;
    }

    const result = originalEditHandler?.call(editButton, event);
    requestAnimationFrame(() => syncRideDashState(overlay));
    return result;
  };
  editButton.title = 'Dashboard settings';
  editButton.setAttribute('aria-label', 'Dashboard settings');

  const stateObserver = new MutationObserver(() => syncRideDashState(overlay));
  stateObserver.observe(rideControl, {attributes:true, attributeFilter:['class']});
  stateObserver.observe(overlay, {attributes:true, attributeFilter:['class']});
  syncRideDashState(overlay);
}

function scanForRideDash(){
  enhanceRideDash(document.querySelector(OVERLAY_SELECTOR));
}

const observer = new MutationObserver(scanForRideDash);
observer.observe(document.body, {childList:true, subtree:true});
scanForRideDash();