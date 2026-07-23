const RIDE_DASH_SELECTOR = '#rideDashOverlay';
const RIDE_OS_PAGE_SELECTOR = '[data-fixed-ride-os-page="true"]';
const RIDE_OS_TAB_SELECTOR = '[data-fixed-ride-os-tab="true"]';
const PLACEHOLDER_SELECTOR = '[data-ride-os-placeholder="true"]';
const PLACEHOLDER_TAB_SELECTOR = '[data-ride-os-placeholder-tab="true"]';
const RETRY_DELAYS = [0, 80, 180, 400, 800, 1400, 2200, 3400, 5000];

let lastRideActive = false;
let mountTimer = 0;
let mountAttempt = 0;
let mountOverlay = null;
let mountSelect = false;
let mountRequested = false;

function currentPageIndex(pages) {
  return Math.max(0, Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth)));
}

function rideIsActive(overlay) {
  const control = overlay?.querySelector('#dashRideControl');
  const state = window.MotoRide?.getState?.() || {};
  return Boolean(
    control?.classList.contains('recording') ||
    control?.classList.contains('starting') ||
    state.active ||
    state.starting
  );
}

function rideOsPageMarkup() {
  return `<div class="rideV3DedicatedShell">
    <div class="rideV3DedicatedHost" data-ride-os-host></div>
    <div class="rideV3DedicatedStatus" data-ride-os-status>
      <span class="rideV3DedicatedDot" aria-hidden="true"></span>
      <div><small data-ride-os-status-label>SYSTEM READY</small><strong data-ride-os-status-bike>Select a motorcycle to begin</strong></div>
    </div>
  </div>`;
}

function ensurePlaceholderStyles() {
  if (document.querySelector('style[data-ride-os-mount-styles]')) return;
  const style = document.createElement('style');
  style.dataset.rideOsMountStyles = '1';
  style.textContent = `
    #rideDashOverlay .rideV3MountPlaceholder{box-sizing:border-box;flex:0 0 100%;width:100%;min-width:100%;padding:14px;scroll-snap-align:start}
    #rideDashOverlay .rideV3MountPlaceholder>div{display:flex;align-items:center;gap:15px;min-height:190px;padding:22px;border:1px solid rgba(255,155,61,.25);border-radius:22px;background:linear-gradient(135deg,rgba(255,155,61,.09),rgba(7,12,23,.9));box-shadow:inset 0 1px rgba(255,255,255,.05)}
    #rideDashOverlay .rideV3MountSpinner{display:block;flex:0 0 auto;width:34px;height:34px;border:3px solid rgba(255,255,255,.09);border-top-color:var(--v3-accent,#ff9b3d);border-radius:50%;animation:rideV3MountSpin .9s linear infinite}
    #rideDashOverlay .rideV3MountPlaceholder small{display:block;color:var(--v3-accent,#ff9b3d);font:900 9px/1 system-ui;letter-spacing:.16em}
    #rideDashOverlay .rideV3MountPlaceholder strong{display:block;margin-top:8px;color:#fff;font:900 23px/1 system-ui}
    #rideDashOverlay .rideV3MountPlaceholder p{margin:8px 0 0;color:#91a2b9;font:650 12px/1.45 system-ui}
    @keyframes rideV3MountSpin{to{transform:rotate(360deg)}}
    @media(max-width:720px){#rideDashOverlay .rideV3MountPlaceholder{padding:8px 2px}#rideDashOverlay .rideV3MountPlaceholder>div{min-height:170px;padding:18px;border-radius:18px}}
  `;
  document.head.appendChild(style);
}

function selectElementPage(overlay, page, tab, behavior = 'auto') {
  const pages = overlay?.querySelector('#dashPages');
  const tabs = overlay?.querySelector('#dashTabs');
  if (!pages || !page) return false;
  const left = page.offsetLeft;
  if (Math.abs(pages.scrollLeft - left) > 2) {
    try { pages.scrollTo({ left, top: 0, behavior }); }
    catch { pages.scrollLeft = left; }
  }
  page.scrollTop = 0;
  [...(tabs?.children || [])].forEach(item => item.classList.toggle('active', item === tab));
  return true;
}

function ensureMountPlaceholder(overlay) {
  if (!overlay?.isConnected || overlay.querySelector(RIDE_OS_PAGE_SELECTOR)) return null;
  const pages = overlay.querySelector('#dashPages');
  const tabs = overlay.querySelector('#dashTabs');
  if (!pages || !tabs) return null;
  ensurePlaceholderStyles();

  let page = pages.querySelector(PLACEHOLDER_SELECTOR);
  if (!page) {
    page = document.createElement('section');
    page.className = 'dashPage rideV3MountPlaceholder';
    page.dataset.rideOsPlaceholder = 'true';
    page.setAttribute('aria-label', 'Preparing Ride Dash');
    page.innerHTML = '<div><span class="rideV3MountSpinner" aria-hidden="true"></span><div><small>MOTO MISSION RIDE OS</small><strong>Preparing cockpit…</strong><p>Loading the selected ride mode and live controls.</p></div></div>';
    pages.insertBefore(page, pages.firstElementChild);
  } else if (page !== pages.firstElementChild) {
    pages.insertBefore(page, pages.firstElementChild);
  }

  let tab = tabs.querySelector(PLACEHOLDER_TAB_SELECTOR);
  if (!tab) {
    tab = document.createElement('button');
    tab.type = 'button';
    tab.dataset.rideOsPlaceholderTab = 'true';
    tab.textContent = 'RIDE DASH';
    tabs.insertBefore(tab, tabs.firstElementChild);
  } else if (tab !== tabs.firstElementChild) {
    tabs.insertBefore(tab, tabs.firstElementChild);
  }

  requestAnimationFrame(() => {
    if (page.isConnected) selectElementPage(overlay, page, tab, 'auto');
  });
  return page;
}

function clearMountPlaceholder(overlay) {
  overlay?.querySelector(PLACEHOLDER_SELECTOR)?.remove();
  overlay?.querySelector(PLACEHOLDER_TAB_SELECTOR)?.remove();
}

function requestRideOsMountOnce(overlay) {
  if (mountRequested || !overlay?.isConnected) return;
  if (overlay.querySelector('.rideV3ModeRibbon') && overlay.querySelector('#rideV3Hero')) return;
  const api = window.MotoRideOS3;
  if (!api?.setMode) return;
  mountRequested = true;
  const selected = api.getMode?.() || localStorage.getItem('motoRideExperienceModeV2') || 'road';
  try { api.setMode(selected); }
  catch (error) { console.warn('Ride OS mount request failed', error); }
}

function syncRideStatus(overlay) {
  if (!overlay?.isConnected) return;
  const source = overlay.querySelector('#dashRideControl');
  const target = overlay.querySelector('[data-ride-os-status]');
  if (!source || !target) return;
  const sourceStatus = overlay.querySelector('#dashRideStatus');
  const sourceBike = overlay.querySelector('#dashRideBike');
  const sourceDot = overlay.querySelector('#dashRideDot');
  const targetStatus = target.querySelector('[data-ride-os-status-label]');
  const targetBike = target.querySelector('[data-ride-os-status-bike]');
  const targetDot = target.querySelector('.rideV3DedicatedDot');
  if (targetStatus && sourceStatus && targetStatus.textContent !== sourceStatus.textContent) targetStatus.textContent = sourceStatus.textContent;
  if (targetBike && sourceBike && targetBike.textContent !== sourceBike.textContent) targetBike.textContent = sourceBike.textContent;
  target.classList.toggle('recording', source.classList.contains('recording'));
  target.classList.toggle('starting', source.classList.contains('starting'));
  targetDot?.classList.toggle('live', Boolean(sourceDot?.classList.contains('live')));
}

function selectRideOsPage(overlay, behavior = 'auto') {
  if (!overlay?.isConnected) return false;
  const page = overlay.querySelector(`#dashPages ${RIDE_OS_PAGE_SELECTOR}`);
  const tab = overlay.querySelector(`#dashTabs ${RIDE_OS_TAB_SELECTOR}`);
  if (!selectElementPage(overlay, page, tab, behavior)) return false;
  overlay.dataset.rideOsPageVisible = 'true';
  return true;
}

function syncRideNavigation(overlay) {
  const pages = overlay.querySelector('#dashPages');
  const tabs = overlay.querySelector('#dashTabs');
  const dots = overlay.querySelector('#dashDots');
  if (!pages || !tabs) return;
  const pageList = [...pages.children];
  const tabList = [...tabs.children];

  pageList.forEach((item, index) => { item.dataset.page = String(index); });
  tabList.forEach((tab, index) => {
    tab.dataset.page = String(index);
    tab.onclick = () => {
      if (tab.matches(RIDE_OS_TAB_SELECTOR)) selectRideOsPage(overlay, 'smooth');
      else pageList[index]?.scrollIntoView({ behavior: 'smooth', inline: 'start' });
    };
  });

  if (dots) {
    const active = Math.min(pageList.length - 1, currentPageIndex(pages));
    dots.innerHTML = pageList.map((_, index) => `<i class="${index === active ? 'active' : ''}"></i>`).join('');
    tabList.forEach((tab, index) => tab.classList.toggle('active', index === active));
  }
}

function ensureRideOsPage(overlay = document.querySelector(RIDE_DASH_SELECTOR), options = {}) {
  if (!overlay?.isConnected) return null;
  const pages = overlay.querySelector('#dashPages');
  const tabs = overlay.querySelector('#dashTabs');
  const ribbon = overlay.querySelector('.rideV3ModeRibbon');
  const hero = overlay.querySelector('#rideV3Hero');

  if (!pages || !tabs || !ribbon || !hero) {
    ensureMountPlaceholder(overlay);
    return null;
  }

  clearMountPlaceholder(overlay);
  let page = pages.querySelector(RIDE_OS_PAGE_SELECTOR);
  if (!page) {
    page = document.createElement('section');
    page.className = 'dashPage rideV3DedicatedPage';
    page.dataset.fixedRideOsPage = 'true';
    page.setAttribute('aria-label', 'Ride Dash');
    page.innerHTML = rideOsPageMarkup();
    pages.insertBefore(page, pages.firstElementChild);
  } else if (page !== pages.firstElementChild) {
    pages.insertBefore(page, pages.firstElementChild);
  }

  let tab = tabs.querySelector(RIDE_OS_TAB_SELECTOR);
  if (!tab) {
    tab = document.createElement('button');
    tab.type = 'button';
    tab.dataset.fixedRideOsTab = 'true';
    tab.textContent = 'RIDE DASH';
    tabs.insertBefore(tab, tabs.firstElementChild);
  } else if (tab !== tabs.firstElementChild) {
    tabs.insertBefore(tab, tabs.firstElementChild);
  }

  const host = page.querySelector('[data-ride-os-host]');
  if (host) {
    if (ribbon.parentElement !== host) host.appendChild(ribbon);
    if (hero.parentElement !== host) host.appendChild(hero);
  }

  overlay.dataset.rideOsDedicatedPage = 'ready';
  overlay.dataset.rideOsMount = 'ready';
  syncRideNavigation(overlay);
  syncRideStatus(overlay);

  if (options.select || rideIsActive(overlay) || overlay.dataset.rideOsPageVisible === 'true') {
    requestAnimationFrame(() => selectRideOsPage(overlay, 'auto'));
  }
  return page;
}

function cancelMountSequence() {
  clearTimeout(mountTimer);
  mountTimer = 0;
  mountAttempt = 0;
  mountOverlay = null;
  mountSelect = false;
  mountRequested = false;
}

function runMountAttempt() {
  mountTimer = 0;
  const overlay = mountOverlay?.isConnected ? mountOverlay : document.querySelector(RIDE_DASH_SELECTOR);
  if (!overlay?.isConnected) {
    cancelMountSequence();
    return;
  }
  mountOverlay = overlay;

  if (ensureRideOsPage(overlay, { select: mountSelect })) {
    cancelMountSequence();
    return;
  }

  if (mountAttempt >= 2) requestRideOsMountOnce(overlay);
  mountAttempt += 1;

  if (mountAttempt >= RETRY_DELAYS.length) {
    overlay.dataset.rideOsMount = 'degraded';
    const title = overlay.querySelector(`${PLACEHOLDER_SELECTOR} strong`);
    const copy = overlay.querySelector(`${PLACEHOLDER_SELECTOR} p`);
    if (title) title.textContent = 'Cockpit unavailable';
    if (copy) copy.textContent = 'Close and reopen Ride. The rest of the app remains available.';
    cancelMountSequence();
    return;
  }

  mountTimer = setTimeout(runMountAttempt, RETRY_DELAYS[mountAttempt]);
}

function scheduleRideOsPage(overlay, options = {}) {
  const target = overlay?.isConnected ? overlay : document.querySelector(RIDE_DASH_SELECTOR);
  if (!target?.isConnected) return;

  if (mountOverlay && target !== mountOverlay) cancelMountSequence();
  mountOverlay = target;
  mountSelect = mountSelect || Boolean(options.select);

  if (ensureRideOsPage(target, { select: mountSelect })) {
    cancelMountSequence();
    return;
  }
  if (mountTimer) return;

  mountAttempt = 0;
  mountRequested = false;
  mountTimer = setTimeout(runMountAttempt, RETRY_DELAYS[0]);
}

window.addEventListener('moto-ride-dash-rendered', event => {
  scheduleRideOsPage(event.detail?.overlay, { select: rideIsActive(event.detail?.overlay) });
});
window.addEventListener('moto-ride-dash-opened', event => {
  scheduleRideOsPage(event.detail?.overlay, { select: true });
});
window.addEventListener('moto-ride-dash-refreshed', event => {
  const overlay = event.detail?.overlay || document.querySelector(RIDE_DASH_SELECTOR);
  syncRideStatus(overlay);
  const active = rideIsActive(overlay);
  if (active && !lastRideActive) selectRideOsPage(overlay, 'auto');
  lastRideActive = active;
});
window.addEventListener('moto-ride-start-progress', event => {
  if (['permissions', 'starting', 'ready'].includes(event.detail?.phase)) {
    scheduleRideOsPage(document.querySelector(RIDE_DASH_SELECTOR), { select: true });
  }
});
window.addEventListener('moto-ride-state', event => {
  const active = Boolean(event.detail?.active || event.detail?.starting);
  const overlay = document.querySelector(RIDE_DASH_SELECTOR);
  syncRideStatus(overlay);
  if (active && !lastRideActive) scheduleRideOsPage(overlay, { select: true });
  lastRideActive = active;
});
window.addEventListener('moto-ride-v3-mode', () => {
  scheduleRideOsPage(document.querySelector(RIDE_DASH_SELECTOR), { select: true });
});
window.addEventListener('moto-ride-dash-closed', event => {
  if (event.detail?.overlay) {
    delete event.detail.overlay.dataset.rideOsDedicatedPage;
    delete event.detail.overlay.dataset.rideOsPageVisible;
    delete event.detail.overlay.dataset.rideOsMount;
  }
  cancelMountSequence();
  lastRideActive = false;
});

new MutationObserver(mutations => {
  const added = mutations.some(mutation => [...mutation.addedNodes].some(node =>
    node.nodeType === 1 && (node.matches?.(RIDE_DASH_SELECTOR) || node.querySelector?.(RIDE_DASH_SELECTOR))
  ));
  if (added) scheduleRideOsPage(null, { select: true });
}).observe(document.body, { childList: true, subtree: false });

window.addEventListener('pageshow', () => scheduleRideOsPage(null, { select: true }));
scheduleRideOsPage(null, { select: true });
