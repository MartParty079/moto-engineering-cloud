const DASH_SELECTOR = '#rideDashOverlay';
const MAP_PAGE_SELECTOR = '[data-fixed-adventure-page="true"]';
const ORIENTATION_STORE = 'motoAdventureOrientationV1';

let activeOverlay = null;
let activePage = null;
let map = null;
let mapContainer = null;
let rider = null;
let trackLine = null;
let trackPoints = [];
let layers = {};
let activeLayer = 'street';
let follow = true;
let lastFix = null;
let leafletPromise = null;
let scrollTimer = 0;
let mapStarting = false;

function isFiniteNumber(value){
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function headingText(degrees){
  if(!isFiniteNumber(degrees)) return '--';
  const value = ((Number(degrees) % 360) + 360) % 360;
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(value / 45) % 8];
}

function ensureLeaflet(){
  if(window.L) return Promise.resolve(window.L);
  if(leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve,reject) => {
    let stylesheet = document.querySelector('link[data-leaflet]');
    if(!stylesheet){
      stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      stylesheet.dataset.leaflet = '1';
      document.head.appendChild(stylesheet);
    }

    const existing = document.querySelector('script[data-leaflet]');
    if(existing){
      if(window.L){ resolve(window.L); return; }
      existing.addEventListener('load',() => resolve(window.L),{once:true});
      existing.addEventListener('error',reject,{once:true});
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.dataset.leaflet = '1';
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function clearMapInstance({clearTrack = false} = {}){
  try{ map?.remove(); }catch{}
  map = null;
  mapContainer = null;
  rider = null;
  trackLine = null;
  layers = {};
  activeLayer = 'street';
  follow = true;
  mapStarting = false;
  if(clearTrack) trackPoints = [];
}

function destroyEmbeddedMap(){
  clearTimeout(scrollTimer);
  clearMapInstance({clearTrack:true});
  activeOverlay = null;
  activePage = null;
}

function mapPageMarkup(){
  return `<div class="dashPageHead"><div><small>ADVENTURE DISPLAY</small><h3>ADV Map</h3></div></div>
    <div class="dashAdventureLiveLayout">
      <section class="dashAdventureLiveMapShell" aria-label="Live Adventure Map">
        <div class="dashAdventureMapStatus"><span id="dashMapGpsDot"></span><div><small>LIVE POSITION</small><strong id="dashMapGpsText">SWIPE HERE TO LOAD MAP</strong></div></div>
        <div class="dashAdventureMapControls">
          <button id="dashMapCenter" type="button" aria-label="Center map">CENTER</button>
          <button id="dashMapLayer" type="button" aria-label="Change map layer">STREET</button>
          <button id="dashMapOrientation" type="button" aria-label="Change map orientation">N UP</button>
        </div>
        <div id="dashAdventureLiveMap" class="dashAdventureLiveMap"><div class="dashMapLoadPrompt"><strong>LIVE MAP READY</strong><span>Map tiles load only when this page is opened.</span></div></div>
      </section>
      <div class="dashAdventureMapTelemetry">
        <article><small>HEADING</small><strong id="dashMapHeading">--°</strong><span id="dashMapCardinal">--</span></article>
        <article><small>ALTITUDE</small><strong id="dashMapAltitude">--</strong><span>FT</span></article>
        <article><small>GPS</small><strong id="dashMapAccuracy">--</strong><span>ACCURACY</span></article>
        <article><small>DISTANCE</small><strong id="dashMapDistance">0.00</strong><span>MI</span></article>
      </div>
    </div>`;
}

function currentPageIndex(pages){
  return Math.round(pages.scrollLeft / Math.max(1,pages.clientWidth));
}

function syncNavigation(overlay,page){
  const pages = overlay.querySelector('#dashPages');
  const tabs = overlay.querySelector('#dashTabs');
  const dots = overlay.querySelector('#dashDots');
  if(!pages || !tabs) return;

  const pageList = [...pages.children];
  const tabList = [...tabs.children];
  pageList.forEach((item,index) => { item.dataset.page = String(index); });
  tabList.forEach((tab,index) => {
    tab.dataset.page = String(index);
    tab.onclick = () => {
      pageList[index]?.scrollIntoView({behavior:'smooth',inline:'start'});
      if(pageList[index] === page) void initializeEmbeddedMap(overlay,page);
    };
  });

  if(dots){
    const active = currentPageIndex(pages);
    dots.innerHTML = pageList.map((_,index) => `<i class="${index === active ? 'active' : ''}"></i>`).join('');
  }

  if(!pages.dataset.liveMapScrollBound){
    pages.dataset.liveMapScrollBound = '1';
    pages.addEventListener('scroll',() => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if(!pages.isConnected) return;
        const list = [...pages.children];
        const index = currentPageIndex(pages);
        [...tabs.children].forEach((tab,tabIndex) => tab.classList.toggle('active',tabIndex === index));
        [...(dots?.children || [])].forEach((dot,dotIndex) => dot.classList.toggle('active',dotIndex === index));
        if(list[index]?.matches(MAP_PAGE_SELECTOR)) void initializeEmbeddedMap(overlay,list[index]);
      },100);
    },{passive:true});
  }
}

function ensureAdventureDisplay(overlay){
  if(!overlay?.isConnected) return null;
  const pages = overlay.querySelector('#dashPages');
  const tabs = overlay.querySelector('#dashTabs');
  if(!pages || !tabs) return null;

  let page = pages.querySelector(MAP_PAGE_SELECTOR);
  if(!page){
    page = document.createElement('section');
    page.className = 'dashPage dashInjectedAdventurePage';
    page.dataset.fixedAdventurePage = 'true';
    page.innerHTML = mapPageMarkup();
    const insertAt = Math.min(2,pages.children.length);
    pages.insertBefore(page,pages.children[insertAt] || null);

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.dataset.fixedAdventureTab = 'true';
    tab.textContent = 'ADV MAP';
    tabs.insertBefore(tab,tabs.children[insertAt] || null);
  }

  if(mapContainer && !page.contains(mapContainer)) clearMapInstance();
  activeOverlay = overlay;
  activePage = page;
  overlay.dataset.mapPageV1 = 'ready';
  overlay.dataset.mapPageV2 = 'ready';
  bindMapControls(overlay,page);
  syncNavigation(overlay,page);
  updateTelemetry(overlay,lastFix);
  return page;
}

function switchLayer(){
  if(!map) return;
  const order = ['street','terrain','satellite'];
  activeLayer = order[(order.indexOf(activeLayer) + 1) % order.length];
  Object.values(layers).forEach(layer => { if(map.hasLayer(layer)) map.removeLayer(layer); });
  layers[activeLayer]?.addTo(map);
  const button = activeOverlay?.querySelector('#dashMapLayer');
  if(button) button.textContent = activeLayer.toUpperCase();
}

function orientationIsHeadingUp(){
  return localStorage.getItem(ORIENTATION_STORE) === 'heading';
}

function toggleOrientation(){
  localStorage.setItem(ORIENTATION_STORE,orientationIsHeadingUp() ? 'north' : 'heading');
  syncOrientationButton();
  applyMapRotation();
}

function syncOrientationButton(){
  const button = activeOverlay?.querySelector('#dashMapOrientation');
  if(!button) return;
  button.textContent = orientationIsHeadingUp() ? 'HDG UP' : 'N UP';
  button.classList.toggle('active',orientationIsHeadingUp());
}

function bindMapControls(overlay,page){
  const centerButton = page.querySelector('#dashMapCenter');
  const layerButton = page.querySelector('#dashMapLayer');
  const orientationButton = page.querySelector('#dashMapOrientation');
  if(centerButton && !centerButton.dataset.bound){
    centerButton.dataset.bound = '1';
    centerButton.onclick = () => {
      follow = true;
      if(lastFix && map) map.setView([lastFix.latitude,lastFix.longitude],Math.max(map.getZoom(),15),{animate:false});
      else void initializeEmbeddedMap(overlay,page);
    };
  }
  if(layerButton && !layerButton.dataset.bound){
    layerButton.dataset.bound = '1';
    layerButton.onclick = () => map ? switchLayer() : void initializeEmbeddedMap(overlay,page);
  }
  if(orientationButton && !orientationButton.dataset.bound){
    orientationButton.dataset.bound = '1';
    orientationButton.onclick = toggleOrientation;
  }
  syncOrientationButton();
}

async function initializeEmbeddedMap(overlay,page){
  const container = page?.querySelector('#dashAdventureLiveMap');
  if(!container || !overlay?.isConnected) return;
  if(map && mapContainer === container){
    requestAnimationFrame(() => map?.invalidateSize(false));
    return;
  }
  if(map && mapContainer !== container) clearMapInstance();
  if(mapStarting) return;

  mapStarting = true;
  activeOverlay = overlay;
  activePage = page;
  mapContainer = container;
  const status = page.querySelector('#dashMapGpsText');
  if(status) status.textContent = 'LOADING MAP…';

  try{
    await ensureLeaflet();
    if(!overlay.isConnected || !container.isConnected || !window.L) return;
    container.innerHTML = '';
    map = window.L.map(container,{zoomControl:false,attributionControl:false,preferCanvas:true,inertia:true,fadeAnimation:false,zoomAnimation:false}).setView([31,-99],6);
    layers.street = window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:20,subdomains:'abcd',updateWhenIdle:true,keepBuffer:2});
    layers.terrain = window.L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,updateWhenIdle:true,keepBuffer:2});
    layers.satellite = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,updateWhenIdle:true,keepBuffer:2});
    layers.street.addTo(map);
    trackLine = window.L.polyline(trackPoints,{color:getComputedStyle(overlay).getPropertyValue('--dash-accent').trim() || '#ef2b2d',weight:5,opacity:.9,lineJoin:'round'}).addTo(map);
    map.on('dragstart zoomstart',() => { follow = false; });
    if(lastFix) useFix(lastFix);
    requestAnimationFrame(() => { map?.invalidateSize(true); applyMapRotation(); });
  }catch(error){
    clearMapInstance();
    if(status) status.textContent = 'MAP UNAVAILABLE';
    if(container.isConnected) container.innerHTML = '<div class="dashMapLoadPrompt"><strong>MAP UNAVAILABLE</strong><span>GPS recording continues normally. Check the connection and reopen this page.</span></div>';
    console.error('Ride Dash live map failed to initialize',error);
  }finally{
    mapStarting = false;
    updateTelemetry(overlay,lastFix);
  }
}

function shouldAppendTrackPoint(fix){
  const previous = trackPoints.at(-1);
  if(!previous) return true;
  return Math.abs(previous[0] - fix.latitude) + Math.abs(previous[1] - fix.longitude) > 0.00004;
}

function applyMapRotation(){
  if(!mapContainer) return;
  const pane = mapContainer.querySelector('.leaflet-map-pane');
  if(!pane) return;
  const rotation = orientationIsHeadingUp() && isFiniteNumber(lastFix?.heading) ? -Number(lastFix.heading) : 0;
  pane.style.transformOrigin = '50% 50%';
  pane.style.rotate = `${rotation}deg`;
}

function useFix(detail){
  if(!isFiniteNumber(detail?.latitude) || !isFiniteNumber(detail?.longitude)) return;
  lastFix = {
    latitude:Number(detail.latitude),longitude:Number(detail.longitude),
    heading:isFiniteNumber(detail.heading) ? Number(detail.heading) : null,
    altitude:isFiniteNumber(detail.altitude) ? Number(detail.altitude) : null,
    accuracy:isFiniteNumber(detail.accuracy) ? Number(detail.accuracy) : null,
    speed:isFiniteNumber(detail.speed) ? Number(detail.speed) : null
  };

  if(map && window.L){
    const latLng = [lastFix.latitude,lastFix.longitude];
    if(!rider){
      rider = window.L.marker(latLng,{icon:window.L.divIcon({className:'dashLiveRider',html:'<span>▲</span>',iconSize:[40,40],iconAnchor:[20,20]})}).addTo(map);
    }else rider.setLatLng(latLng);
    const arrow = rider.getElement()?.querySelector('span');
    if(arrow) arrow.style.transform = `rotate(${lastFix.heading ?? 0}deg)`;
    if(shouldAppendTrackPoint(lastFix)){
      trackPoints.push(latLng);
      if(trackPoints.length > 600) trackPoints.splice(0,trackPoints.length - 600);
      trackLine?.setLatLngs(trackPoints);
    }
    if(follow){
      const zoom = map.getZoom() < 14 ? 16 : map.getZoom();
      map.setView(latLng,zoom,{animate:false,noMoveStart:true});
    }
    applyMapRotation();
  }
  updateTelemetry(activeOverlay,lastFix);
}

function updateTelemetry(overlay,fix){
  if(!overlay?.isConnected) return;
  const ride = window.MotoRide?.getState?.() || {};
  const heading = fix?.heading;
  const altitudeFeet = isFiniteNumber(fix?.altitude) ? Number(fix.altitude) * 3.28084 : null;
  const accuracyFeet = isFiniteNumber(fix?.accuracy) ? Number(fix.accuracy) * 3.28084 : null;
  const setText = (selector,value) => {
    const element = overlay.querySelector(selector);
    if(element && element.textContent !== value) element.textContent = value;
  };
  setText('#dashMapHeading',isFiniteNumber(heading) ? `${Math.round(Number(heading))}°` : '--°');
  setText('#dashMapCardinal',headingText(heading));
  setText('#dashMapAltitude',isFiniteNumber(altitudeFeet) ? String(Math.round(altitudeFeet)) : '--');
  setText('#dashMapAccuracy',isFiniteNumber(accuracyFeet) ? `±${Math.round(accuracyFeet)} FT` : '--');
  setText('#dashMapDistance',Number(ride.distanceMiles || 0).toFixed(2));
  setText('#dashMapGpsText',mapStarting ? 'LOADING MAP…' : fix ? `LOCKED · ${isFiniteNumber(accuracyFeet) ? `±${Math.round(accuracyFeet)} FT` : 'GPS'}` : map ? 'WAITING FOR GPS' : 'SWIPE HERE TO LOAD MAP');
  overlay.querySelector('#dashMapGpsDot')?.classList.toggle('locked',Boolean(fix));
}

function onDashRender(event){
  const overlay = event.detail?.overlay || document.querySelector(DASH_SELECTOR);
  if(!overlay) return;
  if(activeOverlay && activeOverlay !== overlay) destroyEmbeddedMap();
  ensureAdventureDisplay(overlay);
}

window.addEventListener('moto-ride-dash-rendered',onDashRender);
window.addEventListener('moto-ride-dash-opened',onDashRender);
window.addEventListener('moto-ride-dash-refreshed',event => updateTelemetry(event.detail?.overlay || activeOverlay,lastFix));
window.addEventListener('moto-ride-dash-page',event => {
  const page = event.detail?.page;
  if(page?.matches?.(MAP_PAGE_SELECTOR)) void initializeEmbeddedMap(event.detail?.overlay || activeOverlay,page);
});
window.addEventListener('moto-ride-dash-closed',destroyEmbeddedMap);
window.addEventListener('moto-gps-fix',event => useFix(event.detail));
window.addEventListener('moto-ride-state',() => updateTelemetry(activeOverlay,lastFix));