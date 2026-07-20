const DASH_SELECTOR = '#rideDashOverlay';
const MAP_PAGE_SELECTOR = '[data-fixed-adventure-page="true"]';
const MAP_TAB_SELECTOR = '[data-fixed-adventure-tab="true"]';

function isLiveRide(overlay){
  return overlay?.dataset.rideActive === 'true';
}

function openFullAdventure(overlay){
  const adventure = document.querySelector('#adventureNav');
  if(!adventure){
    alert('Adventure Mode is still loading. Try again in a moment.');
    return;
  }
  overlay.querySelector('#dashClose')?.click();
  requestAnimationFrame(() => adventure.click());
}

function mapPreviewMarkup(){
  return `<button type="button" class="dashMapPreview dashOpenAdventure">
    <span class="dashTopo"></span>
    <svg viewBox="0 0 320 130" preserveAspectRatio="none" aria-hidden="true">
      <path class="route-shadow" d="M8,111 C45,93 49,51 92,62 S140,119 174,76 S232,18 312,34"/>
      <path class="route-line" d="M8,111 C45,93 49,51 92,62 S140,119 174,76 S232,18 312,34"/>
    </svg>
    <span class="dashMapPin"></span>
    <strong>OPEN LIVE ADVENTURE MAP</strong>
    <small>3D terrain · heading lock · route tools</small>
  </button>`;
}

function findMapPage(overlay){
  const pages = overlay.querySelector('#dashPages');
  if(!pages) return null;
  return pages.querySelector(MAP_PAGE_SELECTOR)
    || [...pages.children].find(page => page.querySelector('[data-widget="map"]'))
    || null;
}

function reindexDisplays(overlay){
  const pages = overlay.querySelector('#dashPages');
  const tabs = overlay.querySelector('#dashTabs');
  if(!pages || !tabs) return;

  const pageList = [...pages.children];
  const tabList = [...tabs.children];

  pageList.forEach((page,index) => { page.dataset.page = String(index); });
  tabList.forEach((tab,index) => {
    tab.dataset.page = String(index);
    tab.onclick = () => pageList[index]?.scrollIntoView({behavior:'smooth',inline:'start'});
  });
}

function ensureAdventureDisplay(overlay){
  const pages = overlay.querySelector('#dashPages');
  const tabs = overlay.querySelector('#dashTabs');
  if(!pages || !tabs) return null;

  let page = findMapPage(overlay);
  if(page){
    reindexDisplays(overlay);
    return page;
  }

  page = document.createElement('section');
  page.className = 'dashPage dashInjectedAdventurePage';
  page.dataset.fixedAdventurePage = 'true';
  page.innerHTML = `<div class="dashPageHead">
      <div><small>ADVENTURE DISPLAY</small><h3>ADV Map</h3></div>
    </div>
    <div class="dashGrid dashAdventureMapGrid">
      <article class="dashWidget size-hero widget-map dashAdventureMapHero" data-widget="map">
        <small class="dashWidgetLabel">Adventure Map</small>
        <div class="dashValue" data-value="map">${mapPreviewMarkup()}</div>
      </article>
      <article class="dashWidget size-small widget-heading" data-widget="heading">
        <small class="dashWidgetLabel">Heading</small>
        <div class="dashValue" data-value="heading">--°</div>
      </article>
      <article class="dashWidget size-small widget-altitude" data-widget="altitude">
        <small class="dashWidgetLabel">Altitude</small>
        <div class="dashValue" data-value="altitude">--</div>
      </article>
      <article class="dashWidget size-small widget-gps" data-widget="gps">
        <small class="dashWidgetLabel">GPS Status</small>
        <div class="dashValue" data-value="gps">WAITING</div>
      </article>
      <article class="dashWidget size-small widget-distance" data-widget="distance">
        <small class="dashWidgetLabel">Distance</small>
        <div class="dashValue" data-value="distance">0.00 <span>mi</span></div>
      </article>
    </div>`;

  const insertAt = Math.min(2,pages.children.length);
  pages.insertBefore(page,pages.children[insertAt] || null);

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.dataset.fixedAdventureTab = 'true';
  tab.textContent = 'ADV MAP';
  tabs.insertBefore(tab,tabs.children[insertAt] || null);

  page.querySelector('.dashOpenAdventure').onclick = () => openFullAdventure(overlay);
  reindexDisplays(overlay);
  return page;
}

function scrollToAdventureDisplay(overlay){
  const page = ensureAdventureDisplay(overlay);
  page?.scrollIntoView({behavior:'smooth',inline:'start'});
}

function enhanceMapNavigation(overlay){
  if(!overlay || overlay.dataset.mapPageV1 === 'ready') return;
  if(overlay.dataset.headerControlsV2 !== 'ready') return;

  const mapButton = overlay.querySelector('#dashAdventure');
  if(!mapButton) return;

  overlay.dataset.mapPageV1 = 'ready';
  const previousAdventureHandler = mapButton.onclick;

  mapButton.onclick = event => {
    if(isLiveRide(overlay)){
      event?.preventDefault?.();
      scrollToAdventureDisplay(overlay);
      return;
    }
    return previousAdventureHandler?.call(mapButton,event);
  };

  mapButton.title = 'Open the Adventure Map display';
  mapButton.setAttribute('aria-label','Open Adventure Map display');
  ensureAdventureDisplay(overlay);
}

function scan(){
  const overlay = document.querySelector(DASH_SELECTOR);
  if(!overlay) return;
  enhanceMapNavigation(overlay);
  if(overlay.dataset.mapPageV1 === 'ready') ensureAdventureDisplay(overlay);
}

const observer = new MutationObserver(scan);
observer.observe(document.body,{childList:true,subtree:true});
scan();
