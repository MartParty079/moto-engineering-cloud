// Ride and Adventure layout cleanup.
// Repairs the style-selector labels that were being overwritten by telemetry refreshes,
// and converts the Adventure chrome into a compact, expandable control system.
(() => {
  if (window.__motoRideLayoutCleanupInstalled) return;
  window.__motoRideLayoutCleanupInstalled = true;

  const STYLE_LABELS = {
    density:{compact:'COMPACT',balanced:'BALANCED',immersive:'IMMERSIVE'},
    gauge:{digital:'DIGITAL',arc:'HUD ARC',analog:'ANALOG'},
    surface:{flat:'FLAT',glass:'GLASS',machined:'MACHINED'},
    shape:{square:'SQUARE',soft:'SOFT',round:'ROUND'}
  };
  const MAP_DATA_KEY = 'motoAdventureDataCompactV1';

  let queued = false;

  function normalized(element){
    return String(element?.textContent || '').replace(/\s+/g,' ').trim();
  }

  function restoreStyleLabels(root = document){
    root.querySelectorAll?.('.dashSegmented[data-setting]').forEach(group => {
      const labels = STYLE_LABELS[group.dataset.setting];
      if (!labels) return;
      group.querySelectorAll('button[data-value]').forEach(button => {
        const label = labels[button.dataset.value];
        if (!label) return;
        if (button.textContent !== label) button.textContent = label;
        button.setAttribute('aria-label',label);
      });
    });
  }

  function findRouteCard(overlay){
    const labels = [...overlay.querySelectorAll('small')].filter(element => normalized(element).toUpperCase() === 'ACTIVE ROUTE');
    for (const label of labels) {
      let candidate = label.parentElement;
      for (let depth = 0; candidate && depth < 6; depth += 1, candidate = candidate.parentElement) {
        if (candidate.id === 'advRouteMini' || candidate.classList.contains('adventureShell')) break;
        if (candidate.querySelector('button') && /ACTIVE ROUTE/i.test(normalized(candidate))) return candidate;
      }
    }
    return null;
  }

  function routeName(card){
    const preferred = [...card.querySelectorAll('strong,b,h3,h4')]
      .map(normalized)
      .find(value => value && !/^(ACTIVE ROUTE|ROUTES)$/i.test(value));
    if (preferred) return preferred;
    return normalized(card)
      .replace(/ACTIVE ROUTE/ig,'')
      .replace(/ROUTES/ig,'')
      .trim() || 'No route selected';
  }

  function ensureRouteMini(overlay){
    const shell = overlay.querySelector('.adventureShell');
    const source = findRouteCard(overlay);
    if (!shell || !source) return;

    source.classList.add('advOriginalRouteHidden');
    source.dataset.routeCompactSource = '1';
    const name = routeName(source);
    const empty = /NO (ACTIVE )?ROUTE|NO ROUTE SELECTED|CHOOSE ROUTE/i.test(name);

    let mini = overlay.querySelector('#advRouteMini');
    if (!mini) {
      mini = document.createElement('button');
      mini.id = 'advRouteMini';
      mini.type = 'button';
      mini.onclick = () => {
        const currentSource = overlay.querySelector('[data-route-compact-source="1"]');
        currentSource?.querySelector('button')?.click();
      };
      shell.appendChild(mini);
    }

    mini.classList.toggle('empty',empty);
    mini.innerHTML = empty
      ? '<span>ROUTES</span>'
      : `<small>ACTIVE ROUTE</small><strong>${String(name).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]))}</strong><span>›</span>`;
    mini.setAttribute('aria-label',empty ? 'Choose a route' : `Active route ${name}. Open route controls.`);
  }

  function ensureToolToggle(overlay){
    const rail = overlay.querySelector('.advSideRail');
    if (!rail) return;
    let toggle = rail.querySelector('#advToolsToggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'advToolsToggle';
      toggle.type = 'button';
      toggle.textContent = '•••';
      toggle.setAttribute('aria-label','Show more map controls');
      toggle.onclick = () => {
        const expanded = overlay.classList.toggle('advToolsOpen');
        toggle.classList.toggle('active',expanded);
        toggle.setAttribute('aria-expanded',String(expanded));
        toggle.setAttribute('aria-label',expanded ? 'Hide extra map controls' : 'Show more map controls');
      };
      rail.appendChild(toggle);
    }
  }

  function compactReturnButton(overlay){
    const topBar = overlay.querySelector('.advTopBar');
    if (!topBar) return;
    const button = [...topBar.querySelectorAll('button')]
      .find(item => item.id !== 'closeAdventure' && /RIDE/i.test(normalized(item)));
    if (!button) return;
    button.classList.add('advRideReturnCompact');
    button.textContent = '←';
    button.title = 'Return to Ride';
    button.setAttribute('aria-label','Return to Ride');
  }

  function compactAdventure(overlay){
    if (!overlay?.isConnected) return;
    overlay.dataset.mapLayout = 'ultra';
    const data = overlay.querySelector('#advDataOverlay');
    if (data && !data.dataset.ultraLayoutManaged) {
      data.dataset.ultraLayoutManaged = '1';
      if (localStorage.getItem(MAP_DATA_KEY) !== 'expanded') data.classList.add('compact');
    }
    compactReturnButton(overlay);
    ensureToolToggle(overlay);
    ensureRouteMini(overlay);
  }

  function scan(){
    queued = false;
    restoreStyleLabels(document);
    compactAdventure(document.querySelector('#adventureOverlay'));
  }

  function queueScan(){
    if (queued) return;
    queued = true;
    requestAnimationFrame(scan);
  }

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => [...mutation.addedNodes].some(node => node.nodeType === 1 && (
      node.matches?.('#adventureOverlay,#dashStylePicker,.dashSegmented') ||
      node.querySelector?.('#adventureOverlay,#dashStylePicker,.dashSegmented')
    )))) queueScan();
  });
  observer.observe(document.body,{childList:true,subtree:true});

  window.addEventListener('moto-ride-dash-opened',queueScan);
  window.addEventListener('moto-ride-dash-rendered',queueScan);
  window.addEventListener('moto-ride-dash-refreshed',queueScan);
  window.addEventListener('moto-route-update',queueScan);

  window.MotoLayoutCleanup = {refresh:queueScan};
  queueScan();
})();