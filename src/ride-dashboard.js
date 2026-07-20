const $ = q => document.querySelector(q);
const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

const LAYOUT_STORE = 'motoRideDashLayoutV2';
const LEGACY_LAYOUT_STORE = 'motoRideDashLayoutV1';
const STYLE_STORE = 'motoRideDashStyleV1';
const REFRESH_INTERVAL_MS = 80;

const themePresets = {
  classic:{name:'Classic',description:'Warm metal, analog detail and understated contrast.',accent:'#c7a86b',density:'balanced',gauge:'analog',shape:'round',surface:'machined',glow:false,texture:true,labels:true},
  oldfashioned:{name:'Old Fashioned',description:'Cream numerals, aged brass and vintage motorcycle gauges.',accent:'#d6b46f',density:'balanced',gauge:'analog',shape:'round',surface:'soft',glow:false,texture:true,labels:true},
  rustic:{name:'Rustic',description:'Leather, dark timber and weathered trail equipment.',accent:'#c98a4b',density:'balanced',gauge:'analog',shape:'soft',surface:'machined',glow:false,texture:true,labels:true},
  simple:{name:'Simple',description:'Quiet typography, flat panels and only the essentials.',accent:'#f4f4f5',density:'compact',gauge:'digital',shape:'soft',surface:'flat',glow:false,texture:false,labels:true},
  modern:{name:'Modern',description:'Clean graphite surfaces with restrained precision lighting.',accent:'#60a5fa',density:'balanced',gauge:'arc',shape:'soft',surface:'glass',glow:true,texture:false,labels:true},
  metal:{name:'Metal',description:'Brushed alloy, machined edges and industrial instrumentation.',accent:'#b8c2cc',density:'balanced',gauge:'analog',shape:'square',surface:'machined',glow:false,texture:true,labels:true},
  carbon:{name:'Carbon Fiber',description:'Layered carbon weave with sharp performance telemetry.',accent:'#ef4444',density:'compact',gauge:'arc',shape:'square',surface:'machined',glow:true,texture:true,labels:true},
  future:{name:'Future',description:'Cyan HUD lighting, angular panels and active glow.',accent:'#22d3ee',density:'balanced',gauge:'arc',shape:'square',surface:'glass',glow:true,texture:true,labels:true},
  race:{name:'Race',description:'High-contrast red telemetry with compact information density.',accent:'#ef2b2d',density:'compact',gauge:'arc',shape:'square',surface:'machined',glow:true,texture:true,labels:true},
  rally:{name:'Rally',description:'Glove-friendly orange controls and fast off-road readability.',accent:'#f97316',density:'compact',gauge:'digital',shape:'square',surface:'machined',glow:true,texture:true,labels:true},
  adventure:{name:'Adventure',description:'Topo textures, olive panels and amber navigation cues.',accent:'#d6a62b',density:'balanced',gauge:'analog',shape:'soft',surface:'machined',glow:false,texture:true,labels:true},
  stealth:{name:'Stealth',description:'Near-black panels, muted green data and minimal reflections.',accent:'#72a276',density:'compact',gauge:'digital',shape:'square',surface:'flat',glow:false,texture:false,labels:true},
  retro:{name:'Retro Tech',description:'Eighties digital color, segmented numerals and synth-grid detail.',accent:'#ff7a59',density:'balanced',gauge:'digital',shape:'soft',surface:'glass',glow:true,texture:true,labels:true}
};

const defaults = [
  {id:'street',name:'Ride',widgets:[['speed','xl'],['lean','small'],['cornerSpeed','small'],['maxLean','wide'],['road','wide'],['rideTime','small'],['distance','small'],['rides','hero']]},
  {id:'performance',name:'Performance',widgets:[['speed','xl'],['lean','wide'],['cornerSpeed','small'],['maxLean','small'],['maxSpeed','small'],['avgSpeed','small'],['accel','small'],['heading','small'],['rides','wide']]},
  {id:'bike',name:'Bike',widgets:[['bike','wide'],['distance','small'],['rideTime','small'],['range','small'],['gps','small'],['placeholder','wide'],['rides','wide']]}
];

const classicLayout = [
  {id:'classic-tour',name:'Classic Tour',widgets:[['speed','xl'],['lean','small'],['cornerSpeed','small'],['maxLean','wide'],['road','wide'],['distance','small'],['rideTime','small'],['rides','hero']]},
  {id:'classic-bike',name:'Motorcycle',widgets:[['bike','wide'],['speed','wide'],['heading','small'],['altitude','small'],['range','small'],['gps','small'],['rides','wide']]}
];
const raceLayout = [
  {id:'race-live',name:'Race Live',widgets:[['speed','xl'],['lean','wide'],['cornerSpeed','small'],['maxLean','small'],['maxSpeed','small'],['avgSpeed','small'],['accel','small'],['heading','small'],['rides','wide']]},
  {id:'race-review',name:'Session Review',widgets:[['rides','hero'],['maxSpeed','small'],['avgSpeed','small'],['distance','small'],['rideTime','small']]}
];
const trailLayout = [
  {id:'trail-live',name:'Trail Live',widgets:[['speed','wide'],['heading','small'],['altitude','small'],['distance','small'],['gps','small'],['road','wide'],['lean','wide'],['rides','wide']]},
  {id:'trail-bike',name:'Expedition',widgets:[['bike','wide'],['range','small'],['weather','small'],['altitude','small'],['distance','small'],['rides','hero']]}
];
const simpleLayout = [
  {id:'simple-live',name:'Live',widgets:[['speed','xl'],['distance','small'],['rideTime','small'],['heading','small'],['gps','small']]},
  {id:'simple-summary',name:'History',widgets:[['rides','hero'],['maxSpeed','small'],['avgSpeed','small']]}
];

const themeLayouts = {
  classic:classicLayout,
  oldfashioned:classicLayout,
  rustic:trailLayout,
  simple:simpleLayout,
  modern:defaults,
  metal:classicLayout,
  carbon:raceLayout,
  future:defaults,
  race:raceLayout,
  rally:trailLayout,
  adventure:trailLayout,
  stealth:simpleLayout,
  retro:defaults
};

const catalog = {
  speed:{label:'Speed',cat:'Ride'},distance:{label:'Distance',cat:'Ride'},rideTime:{label:'Ride Time',cat:'Ride'},avgSpeed:{label:'Average Speed',cat:'Ride'},maxSpeed:{label:'Max Speed',cat:'Ride'},rides:{label:'Ride History',cat:'Ride'},
  road:{label:'Road',cat:'Road'},limit:{label:'Speed Limit',cat:'Road'},heading:{label:'Heading',cat:'GPS'},altitude:{label:'Altitude',cat:'GPS'},gps:{label:'GPS Status',cat:'GPS'},weather:{label:'Weather',cat:'Weather'},
  range:{label:'Fuel Range',cat:'Adventure'},map:{label:'Adventure Map',cat:'Adventure'},lean:{label:'Lean Angle',cat:'Performance'},maxLean:{label:'Maximum Lean',cat:'Performance'},cornerSpeed:{label:'Corner Average',cat:'Performance'},accel:{label:'Acceleration',cat:'Performance'},
  bike:{label:'Motorcycle',cat:'Bike'},placeholder:{label:'Future ESP Gauges',cat:'Bike'}
};

let layout = loadLayout();
let style = loadStyle();
let edit = false;
let rideActionBusy = false;
let refreshTimer = 0;
let refreshFrame = 0;
let lastRefreshAt = 0;
let state = {ride:null,gps:null,road:null,weather:null,lean:null,rides:[]};
let runtime = {maxLeanLeft:0,maxLeanRight:0,cornerSpeedSum:0,cornerSamples:0,lastCornerSample:0,rideWasActive:false};

function clone(value){
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function loadLayout(){
  try{
    const saved = JSON.parse(localStorage.getItem(LAYOUT_STORE));
    if(Array.isArray(saved) && saved.length) return saved;
  }catch{}
  try{
    const legacy = JSON.parse(localStorage.getItem(LEGACY_LAYOUT_STORE));
    if(Array.isArray(legacy) && legacy.length){
      const migrated = clone(legacy);
      if(!migrated.some(page => page.widgets?.some(widget => widget?.[0] === 'rides'))) migrated[0]?.widgets?.push(['rides','hero']);
      localStorage.setItem(LAYOUT_STORE,JSON.stringify(migrated));
      return migrated;
    }
  }catch{}
  return clone(defaults);
}

function loadStyle(){
  const preset = themePresets.future;
  const base = {theme:'future',accent:preset.accent,density:preset.density,gauge:preset.gauge,shape:preset.shape,surface:preset.surface,glow:preset.glow,texture:preset.texture,labels:preset.labels};
  try{
    const saved = JSON.parse(localStorage.getItem(STYLE_STORE));
    if(saved && typeof saved === 'object') return {...base,...saved};
  }catch{}
  return base;
}

function saveLayout(){ localStorage.setItem(LAYOUT_STORE,JSON.stringify(layout)); }
function saveStyle(){ localStorage.setItem(STYLE_STORE,JSON.stringify(style)); }
function setText(element,value){ if(element && element.textContent !== value) element.textContent = value; }

function nav(){
  const container = $('#nav');
  if(!container) return;

  let button = $('#rideCenterNav') || $('#rideDashNav');
  const duplicate = $('#rideDashNav');
  if(button && duplicate && button !== duplicate) duplicate.remove();

  if(!button){
    button = document.createElement('button');
    const group = [...container.querySelectorAll('.navGroup')].find(item => item.querySelector('.navLabel')?.textContent.trim() === 'Operations');
    (group || container).appendChild(button);
  }

  button.id = 'rideCenterNav';
  button.innerHTML = '<span class="navIcon">◉</span><span>Ride</span>';
  button.onclick = () => {
    container.classList.remove('open');
    document.body.classList.remove('menu-open');
    open();
  };
}

function open(){
  close(false);
  $('#rideCenterOverlay')?.remove();
  state.ride = window.MotoRide?.getState?.() || state.ride;
  state.rides = window.MotoRide?.getRides?.() || state.rides || [];

  const overlay = document.createElement('div');
  overlay.id = 'rideDashOverlay';
  overlay.innerHTML = `<section class="rideDash">
    <header>
      <div class="dashBrand"><small>MOTO MISSION · UNIFIED RIDE SYSTEM</small><h2>Ride</h2></div>
      <div class="dashHeaderActions">
        <button id="dashAdventure" type="button" title="Open Adventure Mode" aria-label="Open Adventure Mode">ADV</button>
        <button id="dashStyle" type="button">STYLE</button>
        <button id="dashEdit" type="button">EDIT</button>
        <button id="dashClose" type="button" aria-label="Close">×</button>
      </div>
    </header>
    <div class="dashRideControl" id="dashRideControl">
      <div class="dashRideIdentity"><span id="dashRideDot"></span><div><small id="dashRideStatus">NOT RECORDING</small><strong id="dashRideBike">Select a motorcycle to begin</strong></div></div>
      <button id="dashRideToggle" type="button">START RIDE</button>
    </div>
    <div class="dashTabs" id="dashTabs"></div>
    <div class="dashPages" id="dashPages"></div>
    <footer><button id="dashPrev" aria-label="Previous display">‹</button><div id="dashDots"></div><button id="dashAddPage">＋ DISPLAY</button><button id="dashNext" aria-label="Next display">›</button></footer>
  </section>`;
  document.body.appendChild(overlay);
  applyStyle();

  $('#dashClose').onclick = () => close(true);
  $('#dashAdventure').onclick = openAdventure;
  $('#dashStyle').onclick = openStylePicker;
  $('#dashEdit').onclick = () => {
    edit = !edit;
    overlay.classList.toggle('editing',edit);
    setText($('#dashEdit'),edit ? 'DONE' : 'EDIT');
    render();
  };
  $('#dashRideToggle').onclick = toggleRide;
  $('#dashAddPage').onclick = addPage;
  $('#dashPrev').onclick = () => scrollPage(-1);
  $('#dashNext').onclick = () => scrollPage(1);
  overlay.addEventListener('click',event => {
    if(event.target.closest('.dashOpenAdventure')) openAdventure();
    if(event.target.closest('.dashOpenRides,[data-open-rides]')) openRideHistory();
  });

  render();
  refresh(true);
  window.dispatchEvent(new CustomEvent('moto-ride-dash-opened',{detail:{overlay}}));
}

function close(restoreTheme = true){
  const overlay = $('#rideDashOverlay');
  if(overlay) window.dispatchEvent(new CustomEvent('moto-ride-dash-closed',{detail:{overlay}}));
  $('#dashRidePicker')?.remove();
  $('#dashStylePicker')?.remove();
  $('#dashPicker')?.remove();
  $('#dashRideHistory')?.remove();
  overlay?.remove();
  edit = false;
  clearTimeout(refreshTimer);
  if(refreshFrame) cancelAnimationFrame(refreshFrame);
  refreshTimer = 0;
  refreshFrame = 0;
  if(restoreTheme) document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#f4512c');
}

function openAdventure(){
  const adventure = $('#adventureNav');
  if(!adventure){ alert('Adventure Mode is still loading. Try again in a moment.'); return; }
  close();
  requestAnimationFrame(() => adventure.click());
}

function render(){
  const pages = $('#dashPages');
  const tabs = $('#dashTabs');
  if(!pages || !tabs) return;

  tabs.innerHTML = layout.map((page,index) => `<button data-page="${index}">${esc(page.name)}</button>`).join('');
  pages.innerHTML = layout.map((page,pageIndex) => `<section class="dashPage" data-page="${pageIndex}">
    <div class="dashPageHead"><div><small>${esc(themePresets[style.theme]?.name || 'Custom')} DISPLAY</small><h3>${esc(page.name)}</h3></div>${edit ? `<div><button data-rename="${pageIndex}">RENAME</button><button data-add="${pageIndex}">＋ WIDGET</button>${layout.length > 1 ? `<button data-delete-page="${pageIndex}">DELETE</button>` : ''}</div>` : ''}</div>
    <div class="dashGrid">${(page.widgets || []).map((item,widgetIndex) => widget(item,pageIndex,widgetIndex)).join('')}</div>
  </section>`).join('');

  tabs.querySelectorAll('[data-page]').forEach(button => button.onclick = () => pages.children[+button.dataset.page]?.scrollIntoView({behavior:'smooth',inline:'start'}));
  pages.querySelectorAll('[data-add]').forEach(button => button.onclick = () => picker(+button.dataset.add));
  pages.querySelectorAll('[data-rename]').forEach(button => button.onclick = () => rename(+button.dataset.rename));
  pages.querySelectorAll('[data-delete-page]').forEach(button => button.onclick = () => deletePage(+button.dataset.deletePage));
  pages.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => removeWidget(+button.dataset.p,+button.dataset.w));
  pages.querySelectorAll('[data-size]').forEach(button => button.onclick = () => resizeWidget(+button.dataset.p,+button.dataset.w));
  pages.querySelectorAll('[data-left]').forEach(button => button.onclick = () => moveWidget(+button.dataset.p,+button.dataset.w,-1));
  pages.querySelectorAll('[data-right]').forEach(button => button.onclick = () => moveWidget(+button.dataset.p,+button.dataset.w,1));

  refresh(true);
  dots();
  window.dispatchEvent(new CustomEvent('moto-ride-dash-rendered',{detail:{overlay:$('#rideDashOverlay'),pages,tabs}}));
}

function widget(item,pageIndex,widgetIndex){
  const [type,size = 'small'] = item;
  const info = catalog[type] || {label:type};
  return `<article class="dashWidget size-${size} widget-${esc(type)}" data-widget="${esc(type)}">
    <small class="dashWidgetLabel">${esc(info.label)}</small>
    <div class="dashValue" data-value="${esc(type)}">--</div>
    ${edit ? `<div class="widgetEdit"><button data-left data-p="${pageIndex}" data-w="${widgetIndex}">←</button><button data-size data-p="${pageIndex}" data-w="${widgetIndex}">SIZE</button><button data-right data-p="${pageIndex}" data-w="${widgetIndex}">→</button><button data-remove data-p="${pageIndex}" data-w="${widgetIndex}">×</button></div>` : ''}
  </article>`;
}

function picker(pageIndex){
  $('#dashPicker')?.remove();
  const modal = document.createElement('div');
  modal.id = 'dashPicker';
  modal.className = 'dashPicker';
  const groups = {};
  Object.entries(catalog).forEach(([key,value]) => (groups[value.cat] ??= []).push([key,value]));
  modal.innerHTML = `<section><header><div><small>WIDGET LIBRARY</small><h3>Add to ${esc(layout[pageIndex].name)}</h3></div><button>×</button></header>${Object.entries(groups).map(([group,items]) => `<h4>${esc(group)}</h4><div>${items.map(([key,value]) => `<button data-type="${key}">${esc(value.label)}</button>`).join('')}</div>`).join('')}</section>`;
  ($('#rideDashOverlay') || document.body).appendChild(modal);
  modal.querySelector('header button').onclick = () => modal.remove();
  modal.querySelectorAll('[data-type]').forEach(button => button.onclick = () => {
    const type = button.dataset.type;
    layout[pageIndex].widgets.push([type,type === 'map' || type === 'rides' ? 'hero' : 'small']);
    saveLayout();
    modal.remove();
    render();
  });
}

function openStylePicker(){
  $('#dashStylePicker')?.remove();
  const modal = document.createElement('div');
  modal.id = 'dashStylePicker';
  modal.className = 'dashStylePicker';
  modal.innerHTML = `<section>
    <header><div><small>RIDE CONFIGURATOR</small><h3>Style & displays</h3></div><button id="dashStyleClose">×</button></header>
    <h4>THEMES</h4>
    <div class="dashThemeGrid">${Object.entries(themePresets).map(([id,preset]) => `<button class="dashThemeCard ${style.theme === id ? 'active' : ''}" data-theme="${id}" style="--card-accent:${preset.accent}"><i></i><span><strong>${esc(preset.name)}</strong><small>${esc(preset.description)}</small></span></button>`).join('')}</div>
    <div class="dashStyleSection"><div><h4>ACCENT COLOR</h4><small>Override any theme with a custom highlight.</small></div><div class="dashColorRow"><input id="dashAccentColor" type="color" value="${esc(style.accent)}" aria-label="Accent color">${['#22d3ee','#ef2b2d','#d6a62b','#f97316','#8b5cf6','#22c55e','#f4f4f5'].map(color => `<button class="dashSwatch" data-color="${color}" style="--swatch:${color}" aria-label="${color}"></button>`).join('')}</div></div>
    <h4>DISPLAY DENSITY</h4>
    <div class="dashSegmented" data-setting="density"><button data-value="compact">COMPACT</button><button data-value="balanced">BALANCED</button><button data-value="immersive">IMMERSIVE</button></div>
    <h4>PRIMARY GAUGE</h4>
    <div class="dashSegmented" data-setting="gauge"><button data-value="digital">DIGITAL</button><button data-value="arc">HUD ARC</button><button data-value="analog">ANALOG</button></div>
    <h4>PANEL SURFACE</h4>
    <div class="dashSegmented" data-setting="surface"><button data-value="flat">FLAT</button><button data-value="glass">GLASS</button><button data-value="machined">MACHINED</button></div>
    <h4>CORNER SHAPE</h4>
    <div class="dashSegmented" data-setting="shape"><button data-value="square">SQUARE</button><button data-value="soft">SOFT</button><button data-value="round">ROUND</button></div>
    <div class="dashToggleGrid">
      <label><span><strong>Active glow</strong><small>Edge lighting and live-state pulse.</small></span><input type="checkbox" data-toggle="glow" ${style.glow ? 'checked' : ''}></label>
      <label><span><strong>Surface texture</strong><small>Carbon, topo, leather or brushed-metal detail.</small></span><input type="checkbox" data-toggle="texture" ${style.texture ? 'checked' : ''}></label>
      <label><span><strong>Widget labels</strong><small>Show metric names above each value.</small></span><input type="checkbox" data-toggle="labels" ${style.labels ? 'checked' : ''}></label>
    </div>
    <div class="dashStyleActions"><button id="dashApplyPreset">APPLY ${esc(themePresets[style.theme]?.name || 'THEME')} DISPLAY</button><button id="dashResetStyle">RESET</button></div>
  </section>`;
  ($('#rideDashOverlay') || document.body).appendChild(modal);

  const syncControls = () => {
    modal.querySelectorAll('[data-setting]').forEach(group => group.querySelectorAll('[data-value]').forEach(button => button.classList.toggle('active',style[group.dataset.setting] === button.dataset.value)));
    modal.querySelectorAll('.dashThemeCard').forEach(button => button.classList.toggle('active',style.theme === button.dataset.theme));
    const apply = modal.querySelector('#dashApplyPreset');
    if(apply) apply.textContent = `APPLY ${String(themePresets[style.theme]?.name || 'THEME').toUpperCase()} DISPLAY`;
  };

  modal.querySelector('#dashStyleClose').onclick = () => modal.remove();
  modal.querySelectorAll('[data-theme]').forEach(button => button.onclick = () => {
    const preset = themePresets[button.dataset.theme];
    if(!preset) return;
    style = {...style,theme:button.dataset.theme,accent:preset.accent,density:preset.density,gauge:preset.gauge,shape:preset.shape,surface:preset.surface,glow:preset.glow,texture:preset.texture,labels:preset.labels};
    modal.querySelector('#dashAccentColor').value = style.accent;
    modal.querySelectorAll('[data-toggle]').forEach(input => { input.checked = Boolean(style[input.dataset.toggle]); });
    saveStyle();
    applyStyle();
    syncControls();
  });
  modal.querySelector('#dashAccentColor').oninput = event => { style.accent = event.target.value; saveStyle(); applyStyle(); };
  modal.querySelectorAll('[data-color]').forEach(button => button.onclick = () => {
    style.accent = button.dataset.color;
    modal.querySelector('#dashAccentColor').value = style.accent;
    saveStyle();
    applyStyle();
  });
  modal.querySelectorAll('[data-setting] [data-value]').forEach(button => button.onclick = () => {
    style[button.closest('[data-setting]').dataset.setting] = button.dataset.value;
    saveStyle();
    applyStyle();
    syncControls();
  });
  modal.querySelectorAll('[data-toggle]').forEach(input => input.onchange = () => { style[input.dataset.toggle] = input.checked; saveStyle(); applyStyle(); });
  modal.querySelector('#dashApplyPreset').onclick = () => {
    if(!confirm(`Replace the current displays with the ${themePresets[style.theme]?.name || 'selected'} preset?`)) return;
    layout = clone(themeLayouts[style.theme] || defaults);
    saveLayout();
    render();
    modal.remove();
  };
  modal.querySelector('#dashResetStyle').onclick = () => {
    const preset = themePresets.future;
    style = {theme:'future',accent:preset.accent,density:preset.density,gauge:preset.gauge,shape:preset.shape,surface:preset.surface,glow:preset.glow,texture:preset.texture,labels:preset.labels};
    saveStyle();
    applyStyle();
    modal.remove();
  };
  syncControls();
}

function hexToRgb(hex){
  const clean = String(hex || '').replace('#','');
  const value = clean.length === 3 ? clean.split('').map(character => character + character).join('') : clean;
  if(!/^[0-9a-f]{6}$/i.test(value)) return '34, 211, 238';
  return `${parseInt(value.slice(0,2),16)}, ${parseInt(value.slice(2,4),16)}, ${parseInt(value.slice(4,6),16)}`;
}

function applyStyle(){
  const overlay = $('#rideDashOverlay');
  if(!overlay) return;
  const preset = themePresets[style.theme] || themePresets.future;
  if(!themePresets[style.theme]) style.theme = 'future';
  overlay.dataset.theme = style.theme;
  overlay.dataset.density = ['compact','balanced','immersive'].includes(style.density) ? style.density : preset.density;
  overlay.dataset.gauge = ['digital','arc','analog'].includes(style.gauge) ? style.gauge : preset.gauge;
  overlay.dataset.shape = ['square','soft','round'].includes(style.shape) ? style.shape : preset.shape;
  overlay.dataset.surface = ['flat','glass','machined'].includes(style.surface) ? style.surface : preset.surface;
  overlay.dataset.glow = style.glow ? 'on' : 'off';
  overlay.dataset.texture = style.texture ? 'on' : 'off';
  overlay.dataset.labels = style.labels ? 'on' : 'off';
  overlay.style.setProperty('--dash-accent',style.accent || preset.accent);
  overlay.style.setProperty('--dash-accent-rgb',hexToRgb(style.accent || preset.accent));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',style.accent || preset.accent);
}

function showRidePicker(){
  if(rideActionBusy) return;
  const controller = window.MotoRide;
  if(!controller){ alert('Ride logger is still loading. Try again in a moment.'); return; }
  const bikes = controller.getBikes?.() || [];
  $('#dashRidePicker')?.remove();
  const modal = document.createElement('div');
  modal.id = 'dashRidePicker';
  modal.className = 'dashRidePicker';
  modal.innerHTML = `<section><header><div><small>START RIDE</small><h3>Select motorcycle</h3></div><button id="dashRidePickerClose" type="button">×</button></header><div class="dashBikeGrid">${bikes.map(bike => `<button type="button" data-bike-id="${esc(bike.id)}"><span><strong>${esc(bike.name)}</strong><small>${Math.round(Number(bike.odometer || 0))} mi</small></span><b>START</b></button>`).join('') || '<p>No motorcycles found. Add one in Garage first.</p>'}</div></section>`;
  ($('#rideDashOverlay') || document.body).appendChild(modal);
  modal.querySelector('#dashRidePickerClose').onclick = () => modal.remove();
  modal.querySelectorAll('[data-bike-id]').forEach(button => button.onclick = () => startRide(button.dataset.bikeId,modal));
}

async function startRide(bikeId,modal){
  if(rideActionBusy) return;
  rideActionBusy = true;
  modal?.querySelectorAll('button').forEach(button => button.disabled = true);
  state.ride = {...(state.ride || {}),starting:true};
  refresh(true);
  try{
    resetRuntime();
    await window.MotoRide.start(bikeId);
    modal?.remove();
  }catch(error){
    alert(error?.message || String(error));
  }finally{
    rideActionBusy = false;
    state.ride = window.MotoRide?.getState?.() || state.ride;
    refresh(true);
  }
}

async function toggleRide(){
  if(rideActionBusy) return;
  const controller = window.MotoRide;
  if(!controller){ alert('Ride logger is still loading. Try again in a moment.'); return; }
  const ride = controller.getState?.() || state.ride || {};
  if(!ride.active){ showRidePicker(); return; }
  if(!confirm('Stop and save this ride?')) return;
  rideActionBusy = true;
  refresh(true);
  try{
    await controller.stop();
  }catch(error){
    alert(error?.message || String(error));
  }finally{
    rideActionBusy = false;
    state.ride = controller.getState?.() || state.ride;
    state.rides = controller.getRides?.() || state.rides;
    refresh(true);
  }
}

function renderRideControl(){
  const ride = state.ride || window.MotoRide?.getState?.() || {};
  const control = $('#dashRideControl');
  const status = $('#dashRideStatus');
  const bike = $('#dashRideBike');
  const toggle = $('#dashRideToggle');
  const dot = $('#dashRideDot');
  if(!control || !status || !bike || !toggle || !dot) return;

  const active = Boolean(ride.active);
  const starting = Boolean(ride.starting);
  control.classList.toggle('recording',active);
  control.classList.toggle('starting',starting || rideActionBusy);
  dot.classList.toggle('live',active);
  setText(status,active ? 'RECORDING' : starting ? 'STARTING LOGGER' : ride.gpsError ? 'GPS NEEDS ATTENTION' : 'SYSTEM READY');
  setText(bike,active ? (ride.bikeName || 'Motorcycle') : starting ? 'Preparing GPS and ride storage…' : ride.gpsError || 'Select a motorcycle to begin');
  toggle.disabled = starting || rideActionBusy;
  setText(toggle,active ? (rideActionBusy ? 'SAVING…' : 'STOP & SAVE') : (starting || rideActionBusy ? 'STARTING…' : 'START RIDE'));
  if(active && !runtime.rideWasActive) resetRuntime();
  runtime.rideWasActive = active;
}

function resetRuntime(){
  runtime = {maxLeanLeft:0,maxLeanRight:0,cornerSpeedSum:0,cornerSamples:0,lastCornerSample:0,rideWasActive:Boolean(state.ride?.active)};
}

function openRideHistory(){
  $('#dashRideHistory')?.remove();
  const rides = state.rides || window.MotoRide?.getRides?.() || [];
  const modal = document.createElement('div');
  modal.id = 'dashRideHistory';
  modal.className = 'dashRideHistory';
  modal.innerHTML = `<section><header><div><small>UNIFIED RIDE SYSTEM</small><h3>Ride history</h3></div><button id="dashHistoryClose">×</button></header><div class="dashHistoryList">${rides.length ? rides.map(ride => `<article><div><strong>${esc(ride.bikeName || 'Motorcycle')}</strong><small>${esc(fmtRideDate(ride.startedAt))}</small></div><div class="dashHistoryMetrics"><span><small>DISTANCE</small><b>${Number(ride.distanceMiles || 0).toFixed(1)} mi</b></span><span><small>TIME</small><b>${fmtDuration(ride.durationSeconds)}</b></span><span><small>MAX</small><b>${Math.round(Number(ride.maxSpeedMph || 0))} mph</b></span><span><small>AVG</small><b>${Math.round(Number(ride.averageSpeedMph || 0))} mph</b></span></div></article>`).join('') : '<div class="dashRideEmpty"><strong>No completed rides yet</strong><span>Complete a ride and it will appear here.</span></div>'}</div><button id="dashOpenRideLog" class="dashHistoryLog">OPEN FULL RIDE LOG</button></section>`;
  ($('#rideDashOverlay') || document.body).appendChild(modal);
  modal.onclick = event => { if(event.target === modal) modal.remove(); };
  modal.querySelector('#dashHistoryClose').onclick = () => modal.remove();
  modal.querySelector('#dashOpenRideLog').onclick = () => {
    modal.remove();
    close();
    requestAnimationFrame(() => document.querySelector('[data-v="rides"]')?.click());
  };
}

function rename(index){
  const name = prompt('Display name',layout[index].name);
  if(name?.trim()){
    layout[index].name = name.trim().slice(0,24);
    saveLayout();
    render();
  }
}

function addPage(){
  layout.push({id:`custom-${Date.now()}`,name:`Custom ${layout.length + 1}`,widgets:[['speed','wide'],['distance','small'],['heading','small'],['rides','wide']]});
  saveLayout();
  render();
  setTimeout(() => $('#dashPages')?.lastElementChild?.scrollIntoView({behavior:'smooth',inline:'start'}),50);
}

function deletePage(index){
  if(confirm(`Delete ${layout[index].name}?`)){
    layout.splice(index,1);
    saveLayout();
    render();
  }
}

function removeWidget(page,widgetIndex){ layout[page].widgets.splice(widgetIndex,1); saveLayout(); render(); }
function moveWidget(page,widgetIndex,direction){ const widgets = layout[page].widgets; const next = widgetIndex + direction; if(next < 0 || next >= widgets.length) return; [widgets[widgetIndex],widgets[next]] = [widgets[next],widgets[widgetIndex]]; saveLayout(); render(); }
function resizeWidget(page,widgetIndex){ const sizes = ['small','wide','xl','hero']; const item = layout[page].widgets[widgetIndex]; item[1] = sizes[(sizes.indexOf(item[1]) + 1) % sizes.length]; saveLayout(); render(); }
function scrollPage(direction){ const pages = $('#dashPages'); pages?.scrollBy({left:direction * pages.clientWidth,behavior:'smooth'}); }

function dots(){
  const pages = $('#dashPages');
  const dotsContainer = $('#dashDots');
  if(!pages || !dotsContainer) return;
  dotsContainer.innerHTML = [...pages.children].map((_,index) => `<i class="${index === 0 ? 'active' : ''}"></i>`).join('');
  let activeIndex = -1;
  const activate = index => {
    if(index === activeIndex) return;
    activeIndex = index;
    [...dotsContainer.children].forEach((dot,dotIndex) => dot.classList.toggle('active',index === dotIndex));
    [...($('#dashTabs')?.children || [])].forEach((tab,tabIndex) => tab.classList.toggle('active',index === tabIndex));
    window.dispatchEvent(new CustomEvent('moto-ride-dash-page',{detail:{index,page:pages.children[index],overlay:$('#rideDashOverlay')}}));
  };
  activate(0);
  pages.onscroll = () => activate(Math.round(pages.scrollLeft / Math.max(1,pages.clientWidth)));
}

function fmtDuration(seconds){
  const total = Math.max(0,Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${String(remaining).padStart(2,'0')}` : `${minutes}:${String(remaining).padStart(2,'0')}`;
}

function fmtRideDate(value){
  if(!value) return 'Saved ride';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return 'Saved ride';
  const today = new Date();
  return date.toDateString() === today.toDateString() ? `Today · ${date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : date.toLocaleDateString([], {month:'short',day:'numeric',year:date.getFullYear() === today.getFullYear() ? undefined : 'numeric'});
}

function rideCards(){
  const rides = state.rides || [];
  if(!rides.length) return `<div class="dashRideEmpty"><strong>No completed rides yet</strong><span>Finish a ride and it will appear here automatically.</span><button class="dashOpenRides">OPEN RIDE HISTORY</button></div>`;
  return `<div class="dashRideStrip">${rides.slice(0,8).map((ride,index) => `<button class="dashRideCard ${index === 0 ? 'latest' : ''}" data-open-rides><span class="dashRouteTrace" aria-hidden="true"><svg viewBox="0 0 120 34"><path d="M4 ${24-(index%3)*4} C 20 ${5+(index%4)*3}, 36 ${31-(index%2)*7}, 54 ${13+(index%3)*4} S 87 ${5+(index%2)*9}, 116 ${18-(index%3)*3}"/></svg></span><strong>${esc(ride.bikeName || 'Motorcycle')}</strong><small>${esc(fmtRideDate(ride.startedAt))}</small><span class="dashRideStats"><b>${Number(ride.distanceMiles || 0).toFixed(1)} mi</b><b>${fmtDuration(ride.durationSeconds)}</b></span></button>`).join('')}</div><button class="dashOpenRides dashViewAll">ALL RIDES <span>›</span></button>`;
}

function value(type){
  const ride = state.ride || {};
  const gps = state.gps || {};
  const road = state.road || {};
  const weather = state.weather || {};
  const speed = Math.max(0,Number(ride.speedMph ?? gps.speed ?? 0) || 0);
  const lean = Number(state.lean?.lean || 0);

  switch(type){
    case 'speed':{
      const percent = Math.min(100,speed / 160 * 100);
      return `<div class="dashSpeedGauge" style="--speed-pct:${percent}%;--speed-sweep:${percent * .75}%"><div class="dashGaugeTicks"></div><div class="dashSpeedNumber">${Math.round(speed)}</div><span>MPH</span><i>0</i><i>160</i></div>`;
    }
    case 'distance':return `${Number(ride.distanceMiles ?? 0).toFixed(2)} <span>mi</span>`;
    case 'rideTime':return ride.elapsedText || '00:00:00';
    case 'avgSpeed':return `${Math.round(ride.averageSpeedMph ?? 0)} <span>mph</span>`;
    case 'maxSpeed':return `${Math.round(ride.maxSpeedMph ?? 0)} <span>mph</span>`;
    case 'road':return `<strong class="dashRoadName">${esc(road.road || 'Scanning road data')}</strong><span class="dashRoadSub">${Number.isFinite(road.limit_mph) ? `${road.limit_mph} mph zone` : 'Live road context'}</span>`;
    case 'limit':return Number.isFinite(road.limit_mph) ? `${road.limit_mph} <span>mph</span>` : '--';
    case 'heading':return Number.isFinite(ride.heading ?? gps.heading) ? `${Math.round(ride.heading ?? gps.heading)}° <span>${headingText(ride.heading ?? gps.heading)}</span>` : '--°';
    case 'altitude':return Number.isFinite(ride.altitudeFt) ? `${Math.round(ride.altitudeFt)} <span>ft</span>` : Number.isFinite(gps.altitude) ? `${Math.round(gps.altitude * 3.28084)} <span>ft</span>` : '--';
    case 'gps':return ride.gpsLocked ? `LOCKED <span>${Number.isFinite(ride.accuracyFt) ? `±${Math.round(ride.accuracyFt)} ft` : ''}</span>` : Number.isFinite(gps.latitude) ? `LOCKED <span>±${Math.round((gps.accuracy || 0) * 3.28084)} ft</span>` : 'WAITING';
    case 'weather':return `${weather.temperature ?? weather.temp ?? '--'}° <span>${weather.rainChance ?? weather.rain ?? '--'}% rain</span>`;
    case 'range':return `${localStorage.getItem('motoEstimatedRange') || '--'} <span>mi</span>`;
    case 'lean':{
      const direction = lean < -0.5 ? 'LEFT' : lean > 0.5 ? 'RIGHT' : 'CENTER';
      const percent = Math.min(100,Math.abs(lean) / 50 * 100);
      const side = lean < 0 ? -1 : 1;
      return `<div class="dashLeanGauge" style="--lean-pct:${percent}%;--lean-offset:${side * percent * .36}%;--lean-angle:${side * percent * .32}deg"><div><strong>${Math.round(Math.abs(lean))}°</strong><span>${direction}</span></div></div>`;
    }
    case 'maxLean':return `<div class="dashDualMetric"><span><small>LEFT</small><strong>${Math.round(runtime.maxLeanLeft)}°</strong></span><i></i><span><small>RIGHT</small><strong>${Math.round(runtime.maxLeanRight)}°</strong></span></div>`;
    case 'cornerSpeed':return `${runtime.cornerSamples ? Math.round(runtime.cornerSpeedSum / runtime.cornerSamples) : 0} <span>mph</span>`;
    case 'accel':return `${Number(state.lean?.accel || 0).toFixed(2)} <span>g</span>`;
    case 'bike':return `<strong class="dashBikeName">${esc(ride.bikeName || 'Select a motorcycle')}</strong><span class="dashBikeStatus">${ride.active ? 'ACTIVE RIDE' : 'READY'}</span>`;
    case 'map':return `<button class="dashMapPreview dashOpenAdventure"><span class="dashTopo"></span><svg viewBox="0 0 320 130" preserveAspectRatio="none" aria-hidden="true"><path class="route-shadow" d="M8,111 C45,93 49,51 92,62 S140,119 174,76 S232,18 312,34"/><path class="route-line" d="M8,111 C45,93 49,51 92,62 S140,119 174,76 S232,18 312,34"/></svg><span class="dashMapPin"></span><strong>OPEN FULL ADVENTURE MODE</strong><small>Terrain · heading lock · route tools</small></button>`;
    case 'rides':return rideCards();
    case 'placeholder':return '<span>RPM · TEMP · VOLTAGE<br>Ready for ESP integration</span>';
    default:return '--';
  }
}

function headingText(degrees){
  if(!Number.isFinite(Number(degrees))) return '';
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round((((Number(degrees) % 360) + 360) % 360) / 45) % 8];
}

function refresh(immediate = false){
  if(!$('#rideDashOverlay')) return;
  if(!immediate){ scheduleRefresh(); return; }
  renderRideControl();
  document.querySelectorAll('#rideDashOverlay [data-value]').forEach(element => {
    const next = value(element.dataset.value);
    if(element.dataset.renderedValue !== next){
      element.innerHTML = next;
      element.dataset.renderedValue = next;
    }
  });
  lastRefreshAt = performance.now();
  window.dispatchEvent(new CustomEvent('moto-ride-dash-refreshed',{detail:{overlay:$('#rideDashOverlay')}}));
}

function scheduleRefresh(force = false){
  if(!$('#rideDashOverlay') || refreshTimer || refreshFrame) return;
  const wait = force ? 0 : Math.max(0,REFRESH_INTERVAL_MS - (performance.now() - lastRefreshAt));
  refreshTimer = window.setTimeout(() => {
    refreshTimer = 0;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refresh(true);
    });
  },wait);
}

window.addEventListener('moto-ride-state',event => { state.ride = event.detail; scheduleRefresh(); });
window.addEventListener('moto-rides-update',event => { state.rides = Array.isArray(event.detail) ? event.detail : []; scheduleRefresh(); });
window.addEventListener('moto-gps-fix',event => { state.gps = event.detail; scheduleRefresh(); });
window.addEventListener('moto-road-update',event => { state.road = event.detail; scheduleRefresh(); });
window.addEventListener('moto-weather-update',event => { state.weather = event.detail; scheduleRefresh(); });
window.addEventListener('moto-motion-update',event => {
  state.lean = event.detail;
  const lean = Number(event.detail?.lean || 0);
  if(lean < 0) runtime.maxLeanLeft = Math.max(runtime.maxLeanLeft,Math.abs(lean));
  if(lean > 0) runtime.maxLeanRight = Math.max(runtime.maxLeanRight,Math.abs(lean));
  const now = Date.now();
  const speed = Number(state.ride?.speedMph ?? state.gps?.speed ?? 0);
  if(Math.abs(lean) >= 7 && speed > 1 && now - runtime.lastCornerSample > 500){
    runtime.cornerSpeedSum += speed;
    runtime.cornerSamples += 1;
    runtime.lastCornerSample = now;
  }
  scheduleRefresh();
});
window.addEventListener('moto-ride-open-request',open);

window.MotoRideDash = {open,close,openHistory:openRideHistory,refresh:() => scheduleRefresh(true),getThemes:() => clone(themePresets)};

const observer = new MutationObserver(nav);
observer.observe(document.querySelector('#app') || document.body,{childList:true,subtree:false});
nav();