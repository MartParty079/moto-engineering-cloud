// Premium map-space and visibility controls for Adventure + Ride Dash.
(() => {
  if (window.__motoPremiumVisibilityInstalled) return;
  window.__motoPremiumVisibilityInstalled = true;

  const MAP_THEME_KEY = 'motoAdventureVisualThemeV1';
  const MAP_DATA_KEY = 'motoAdventureDataCompactV1';
  const DASH_CONTRAST_KEY = 'motoRideHighContrastV1';
  const MAP_THEMES = ['standard','contrast','night'];
  let scanQueued = false;

  const text = element => String(element?.textContent || '').replace(/\s+/g,' ').trim();
  const readMapTheme = () => {
    const saved = localStorage.getItem(MAP_THEME_KEY);
    return MAP_THEMES.includes(saved) ? saved : 'standard';
  };
  const readDashContrast = () => localStorage.getItem(DASH_CONTRAST_KEY) === 'on';

  function toast(message){
    const adventureToast = document.querySelector('#adventureStatus');
    if (adventureToast) {
      adventureToast.textContent = message;
      adventureToast.classList.add('show');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => adventureToast.classList.remove('show'),2200);
      return;
    }
    let element = document.querySelector('#premiumVisibilityToast');
    if (!element) {
      element = document.createElement('div');
      element.id = 'premiumVisibilityToast';
      document.body.appendChild(element);
    }
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('show'),2200);
  }

  function syncMapThemeButtons(overlay){
    const theme = readMapTheme();
    overlay.dataset.mapTheme = theme;
    overlay.querySelectorAll('[data-map-visibility-theme]').forEach(button => {
      const active = button.dataset.mapVisibilityTheme === theme;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    const quick = overlay.querySelector('#advContrastQuick');
    if (quick) {
      quick.classList.toggle('active',theme !== 'standard');
      quick.dataset.theme = theme;
      quick.title = `Map visibility: ${theme === 'contrast' ? 'High Contrast' : theme === 'night' ? 'Night' : 'Standard'}`;
      quick.setAttribute('aria-label',quick.title);
      quick.innerHTML = theme === 'night' ? '◒' : theme === 'contrast' ? '◐' : '◑';
    }
  }

  function setMapTheme(theme,{announce=true}={}){
    const value = MAP_THEMES.includes(theme) ? theme : 'standard';
    localStorage.setItem(MAP_THEME_KEY,value);
    const overlay = document.querySelector('#adventureOverlay');
    if (overlay) syncMapThemeButtons(overlay);
    if (announce) toast(value === 'contrast' ? 'High Contrast map enabled' : value === 'night' ? 'Night map enabled' : 'Standard map enabled');
  }

  function addMapVisibilityControls(overlay){
    const rail = overlay.querySelector('.advSideRail');
    if (rail && !overlay.querySelector('#advContrastQuick')) {
      const button = document.createElement('button');
      button.id = 'advContrastQuick';
      button.type = 'button';
      button.onclick = () => {
        const current = readMapTheme();
        setMapTheme(MAP_THEMES[(MAP_THEMES.indexOf(current) + 1) % MAP_THEMES.length]);
      };
      const fullscreen = overlay.querySelector('#advFull');
      rail.insertBefore(button,fullscreen || null);
    }

    const layerSheet = overlay.querySelector('#advLayersSheet');
    if (layerSheet && !layerSheet.querySelector('.advVisibilityThemes')) {
      const section = document.createElement('section');
      section.className = 'advVisibilityThemes';
      section.innerHTML = `<div><small>VISIBILITY THEME</small><strong>Map contrast</strong></div><div class="advVisibilityThemeGrid"><button type="button" data-map-visibility-theme="standard">STANDARD</button><button type="button" data-map-visibility-theme="contrast">HIGH CONTRAST</button><button type="button" data-map-visibility-theme="night">NIGHT</button></div>`;
      const range = layerSheet.querySelector('.advRangeRow');
      layerSheet.insertBefore(section,range || null);
      section.querySelectorAll('[data-map-visibility-theme]').forEach(button => {
        button.onclick = () => setMapTheme(button.dataset.mapVisibilityTheme);
      });
    }
    syncMapThemeButtons(overlay);
  }

  function compactAdventureChrome(overlay){
    overlay.dataset.mapSpace = 'max';

    const data = overlay.querySelector('#advDataOverlay');
    if (data && !data.dataset.spaceManaged) {
      data.dataset.spaceManaged = '1';
      if (localStorage.getItem(MAP_DATA_KEY) !== 'expanded') data.classList.add('compact');
      const collapse = overlay.querySelector('#advDataCollapse');
      collapse?.addEventListener('click',() => {
        requestAnimationFrame(() => localStorage.setItem(MAP_DATA_KEY,data.classList.contains('compact') ? 'compact' : 'expanded'));
      });
    }

    const topBar = overlay.querySelector('.advTopBar');
    if (topBar) {
      [...topBar.querySelectorAll('button')].forEach(button => {
        if (button.id !== 'closeAdventure' && /RIDE/i.test(text(button))) button.classList.add('advRideReturnCompact');
      });
    }

    const routeCandidates = [...overlay.querySelectorAll('section,article,div')].filter(element => {
      const value = text(element).toUpperCase();
      if (!value.includes('ACTIVE ROUTE') || !element.querySelector('button')) return false;
      return ![...element.children].some(child => text(child).toUpperCase().includes('ACTIVE ROUTE') && child.querySelector?.('button'));
    });
    const routeCard = routeCandidates.sort((a,b) => text(a).length - text(b).length)[0];
    if (routeCard) {
      routeCard.classList.add('advActiveRouteCompact');
      routeCard.classList.toggle('empty',/NO ROUTE SELECTED/i.test(text(routeCard)));
    }
  }

  function enhanceAdventure(overlay){
    if (!overlay?.isConnected) return;
    compactAdventureChrome(overlay);
    addMapVisibilityControls(overlay);
  }

  function applyDashContrast(overlay){
    if (!overlay) return;
    overlay.dataset.highContrast = readDashContrast() ? 'on' : 'off';
  }

  function setDashContrast(enabled,{announce=true}={}){
    localStorage.setItem(DASH_CONTRAST_KEY,enabled ? 'on' : 'off');
    applyDashContrast(document.querySelector('#rideDashOverlay'));
    syncDashThemeCard(document.querySelector('#dashStylePicker'));
    if (announce) toast(enabled ? 'High Contrast Ride theme enabled' : 'High Contrast Ride theme disabled');
  }

  function syncDashThemeCard(picker){
    if (!picker) return;
    const active = readDashContrast();
    const card = picker.querySelector('[data-high-contrast-theme]');
    card?.classList.toggle('active',active);
    card?.setAttribute('aria-pressed',String(active));
  }

  function enhanceStylePicker(picker){
    const grid = picker?.querySelector('.dashThemeGrid');
    if (!grid) return;

    if (!grid.querySelector('[data-high-contrast-theme]')) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'dashThemeCard dashHighContrastTheme';
      card.dataset.highContrastTheme = '1';
      card.style.setProperty('--card-accent','#facc15');
      card.innerHTML = '<i></i><span><strong>High Contrast</strong><small>Maximum sunlight readability with solid black panels, bright white type and yellow controls.</small></span>';
      card.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        setDashContrast(!readDashContrast());
      };
      grid.prepend(card);
    }

    grid.querySelectorAll('.dashThemeCard:not([data-high-contrast-theme])').forEach(card => {
      if (card.dataset.contrastBound) return;
      card.dataset.contrastBound = '1';
      card.addEventListener('click',() => setDashContrast(false,{announce:false}));
    });
    syncDashThemeCard(picker);
  }

  function enhanceRideDash(overlay){
    applyDashContrast(overlay);
    enhanceStylePicker(document.querySelector('#dashStylePicker'));
  }

  function scan(){
    scanQueued = false;
    enhanceAdventure(document.querySelector('#adventureOverlay'));
    enhanceRideDash(document.querySelector('#rideDashOverlay'));
    enhanceStylePicker(document.querySelector('#dashStylePicker'));
  }

  function queueScan(){
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => [...mutation.addedNodes].some(node => node.nodeType === 1 && (node.matches?.('#adventureOverlay,#rideDashOverlay,#dashStylePicker') || node.querySelector?.('#adventureOverlay,#rideDashOverlay,#dashStylePicker'))))) queueScan();
  });
  observer.observe(document.body,{childList:true,subtree:true});

  window.addEventListener('moto-ride-dash-opened',queueScan);
  window.addEventListener('moto-ride-dash-rendered',queueScan);
  window.addEventListener('moto-ride-dash-refreshed',queueScan);
  window.MotoVisibility = {setMapTheme,setDashContrast,getMapTheme:readMapTheme,getDashContrast:readDashContrast};
  queueScan();
})();