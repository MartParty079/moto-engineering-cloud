const OVERLAY_SELECTOR = '#rideDashOverlay';

function syncRideButtonState(overlay){
  const control = overlay.querySelector('#dashRideControl');
  const rideButton = overlay.querySelector('#dashRideToggle');
  if(!control || !rideButton) return;
  rideButton.classList.toggle('recording', control.classList.contains('recording'));
  rideButton.classList.toggle('starting', control.classList.contains('starting'));
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

  editButton.title = 'Edit widgets, displays and dashboard style';
  editButton.setAttribute('aria-label', 'Edit dashboard');

  const stateObserver = new MutationObserver(() => syncRideButtonState(overlay));
  stateObserver.observe(rideControl, {attributes:true, attributeFilter:['class']});
  syncRideButtonState(overlay);
}

function scanForRideDash(){
  enhanceRideDash(document.querySelector(OVERLAY_SELECTOR));
}

const observer = new MutationObserver(scanForRideDash);
observer.observe(document.body, {childList:true, subtree:true});
scanForRideDash();
