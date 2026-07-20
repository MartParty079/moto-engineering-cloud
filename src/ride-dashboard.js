const $ = q => document.querySelector(q);
const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

const LAYOUT_STORE = 'motoRideDashLayoutV2';
const LEGACY_LAYOUT_STORE = 'motoRideDashLayoutV1';
const STYLE_STORE = 'motoRideDashStyleV1';

const themePresets = {
  classic: {
    name: 'Classic',
    description: 'Warm metal, analog detail and understated contrast.',
    accent: '#c7a86b',
    density: 'balanced',
    gauge: 'analog'
  },
  future: {
    name: 'Future',
    description: 'Cyan HUD lighting, angular panels and active glow.',
    accent: '#22d3ee',
    density: 'balanced',
    gauge: 'arc'
  },
  race: {
    name: 'Race',
    description: 'High-contrast red telemetry with compact information density.',
    accent: '#ef2b2d',
    density: 'compact',
    gauge: 'arc'
  },
  adventure: {
    name: 'Adventure',
    description: 'Topo textures, olive panels and amber navigation cues.',
    accent: '#d6a62b',
    density: 'balanced',
    gauge: 'analog'
  }
};

const defaults = [
  {id:'street', name:'Ride', widgets:[['speed','xl'],['lean','small'],['cornerSpeed','small'],['maxLean','wide'],['road','wide'],['rideTime','small'],['distance','small'],['rides','hero']]},
  {id:'adventure', name:'Adventure', widgets:[['map','hero'],['speed','wide'],['distance','small'],['altitude','small'],['heading','small'],['gps','small'],['rides','wide']]},
  {id:'performance', name:'Race', widgets:[['speed','xl'],['lean','wide'],['cornerSpeed','small'],['maxLean','small'],['maxSpeed','small'],['avgSpeed','small'],['accel','small'],['heading','small'],['rides','wide']]},
  {id:'navigation', name:'Navigation', widgets:[['map','hero'],['road','wide'],['heading','small'],['limit','small'],['distance','small'],['weather','small'],['rides','wide']]},
  {id:'bike', name:'Bike', widgets:[['bike','wide'],['distance','small'],['rideTime','small'],['range','small'],['gps','small'],['placeholder','wide'],['rides','wide']]}
];

const themeLayouts = {
  classic: [
    {id:'classic-tour', name:'Classic Tour', widgets:[['speed','xl'],['lean','small'],['cornerSpeed','small'],['maxLean','wide'],['road','wide'],['distance','small'],['rideTime','small'],['rides','hero']]},
    {id:'classic-bike', name:'Motorcycle', widgets:[['bike','wide'],['speed','wide'],['heading','small'],['altitude','small'],['range','small'],['gps','small'],['rides','wide']]}
  ],
  future: structuredClone(defaults),
  race: [
    {id:'race-live', name:'Race Live', widgets:[['speed','xl'],['lean','wide'],['cornerSpeed','small'],['maxLean','small'],['maxSpeed','small'],['avgSpeed','small'],['accel','small'],['heading','small'],['rides','wide']]},
    {id:'race-review', name:'Session Review', widgets:[['rides','hero'],['maxSpeed','small'],['avgSpeed','small'],['distance','small'],['rideTime','small']]}
  ],
  adventure: [
    {id:'trail-live', name:'Trail Live', widgets:[['map','hero'],['speed','wide'],['heading','small'],['altitude','small'],['distance','small'],['gps','small'],['road','wide'],['rides','wide']]},
    {id:'trail-bike', name:'Expedition', widgets:[['bike','wide'],['range','small'],['weather','small'],['altitude','small'],['distance','small'],['rides','hero']]}
  ]
};

const catalog = {
  speed:{label:'Speed',cat:'Ride'},
  distance:{label:'Distance',cat:'Ride'},
  rideTime:{label:'Ride Time',cat:'Ride'},
  avgSpeed:{label:'Average Speed',cat:'Ride'},
  maxSpeed:{label:'Max Speed',cat:'Ride'},
  rides:{label:'Recent Rides',cat:'Ride'},
  road:{label:'Road',cat:'Road'},
  limit:{label:'Speed Limit',cat:'Road'},
  heading:{label:'Heading',cat:'GPS'},
  altitude:{label:'Altitude',cat:'GPS'},
  gps:{label:'GPS Status',cat:'GPS'},
  weather:{label:'Weather',cat:'Weather'},
  range:{label:'Fuel Range',cat:'Adventure'},
  map:{label:'Adventure Map',cat:'Adventure'},
  lean:{label:'Lean Angle',cat:'Performance'},
  maxLean:{label:'Maximum Lean',cat:'Performance'},
  cornerSpeed:{label:'Corner Average',cat:'Performance'},
  accel:{label:'Acceleration',cat:'Performance'},
  bike:{label:'Motorcycle',cat:'Bike'},
  placeholder:{label:'Future ESP Gauges',cat:'Bike'}
};

let layout = loadLayout();
let style = loadStyle();
let edit = false;
let rideActionBusy = false;
let state = {ride:null, gps:null, road:null, weather:null, lean:null, rides:[]};
let runtime = {maxLeanLeft:0, maxLeanRight:0, cornerSpeedSum:0, cornerSamples:0, lastCornerSample:0, rideWasActive:false};

function clone(value){ return structuredClone(value); }

function loadLayout(){
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_STORE));
    if(Array.isArray(saved) && saved.length) return saved;
  } catch {}
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_LAYOUT_STORE));
    if(Array.isArray(legacy) && legacy.length){
      const migrated = clone(legacy);
      if(!migrated.some(page => page.widgets?.some(widget => widget?.[0] === 'rides'))){
        migrated[0]?.widgets?.push(['rides','hero']);
      }
      localStorage.setItem(LAYOUT_STORE, JSON.stringify(migrated));
      return migrated;
    }
  } catch {}
  return clone(defaults);
}

function loadStyle(){
  const base = {theme:'future', accent:themePresets.future.accent, density:'balanced', gauge:'arc', glow:true, texture:true, labels:true};
  try {
    const saved = JSON.parse(localStorage.getItem(STYLE_STORE));
    if(saved && typeof saved === 'object') return {...base, ...saved};
  } catch {}
  return base;
}

function saveLayout(){ localStorage.setItem(LAYOUT_STORE, JSON.stringify(layout)); }
function saveStyle(){ localStorage.setItem(STYLE_STORE, JSON.stringify(style)); }

function nav(){
  const n = $('#nav');
  if(!n || $('#rideDashNav')) return;
  const b = document.createElement('button');
  b.id = 'rideDashNav';
  b.innerHTML = '<span class="navIcon">▦</span><span>Ride Dash</span><em>NEW</em>';
  b.onclick = open;
  const g = [...n.querySelectorAll('.navGroup')].find(x => x.querySelector('.navLabel')?.textContent.trim() === 'Operations');
  (g || n).appendChild(b);
}

function open(){
  close();
  state.ride = window.MotoRide?.getState?.() || state.ride;
  state.rides = window.MotoRide?.getRides?.() || state.rides || [];
  const o = document.createElement('div');
  o.id = 'rideDashOverlay';
  o.innerHTML = `<section class="rideDash">
    <header>
      <div class="dashBrand"><small>MOTO MISSION · RIDE SYSTEM</small><h2>Ride Dash</h2></div>
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
  document.body.appendChild(o);
  applyStyle();
  $('#dashClose').onclick = close;
  $('#dashAdventure').onclick = openAdventure;
  $('#dashStyle').onclick = openStylePicker;
  $('#dashEdit').onclick = () => {
    edit = !edit;
    o.classList.toggle('editing', edit);
    $('#dashEdit').textContent = edit ? 'DONE' : 'EDIT';
    render();
  };
  $('#dashRideToggle').onclick = toggleRide;
  $('#dashAddPage').onclick = addPage;
  $('#dashPrev').onclick = () => scrollPage(-1);
  $('#dashNext').onclick = () => scrollPage(1);
  render();
  refresh();
}

function close(){
  $('#dashRidePicker')?.remove();
  $('#dashStylePicker')?.remove();
  $('#dashPicker')?.remove();
  $('#rideDashOverlay')?.remove();
}

function openAdventure(){
  const adventure = $('#adventureNav');
  if(!adventure){ alert('Adventure Mode is still loading. Try again in a moment.'); return; }
  close();
  requestAnimationFrame(() => adventure.click());
}

function openRideCenter(){
  close();
  window.MotoRide?.open?.();
}

function render(){
  const pages = $('#dashPages');
  const tabs = $('#dashTabs');
  if(!pages || !tabs) return;
  tabs.innerHTML = layout.map((p,i) => `<button data-page="${i}">${esc(p.name)}</button>`).join('');
  pages.innerHTML = layout.map((p,pi) => `<section class="dashPage" data-page="${pi}">
    <div class="dashPageHead"><div><small>${esc(themePresets[style.theme]?.name || 'Custom')} DISPLAY</small><h3>${esc(p.name)}</h3></div>${edit ? `<div><button data-rename="${pi}">RENAME</button><button data-add="${pi}">＋ WIDGET</button>${layout.length > 1 ? `<button data-delete-page="${pi}">DELETE</button>` : ''}</div>` : ''}</div>
    <div class="dashGrid">${(p.widgets || []).map((w,wi) => widget(w,pi,wi)).join('')}</div>
  </section>`).join('');

  tabs.querySelectorAll('[data-page]').forEach(b => b.onclick = () => pages.children[+b.dataset.page].scrollIntoView({behavior:'smooth',inline:'start'}));
  pages.querySelectorAll('[data-add]').forEach(b => b.onclick = () => picker(+b.dataset.add));
  pages.querySelectorAll('[data-rename]').forEach(b => b.onclick = () => rename(+b.dataset.rename));
  pages.querySelectorAll('[data-delete-page]').forEach(b => b.onclick = () => deletePage(+b.dataset.deletePage));
  pages.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => removeWidget(+b.dataset.p,+b.dataset.w));
  pages.querySelectorAll('[data-size]').forEach(b => b.onclick = () => resizeWidget(+b.dataset.p,+b.dataset.w));
  pages.querySelectorAll('[data-left]').forEach(b => b.onclick = () => moveWidget(+b.dataset.p,+b.dataset.w,-1));
  pages.querySelectorAll('[data-right]').forEach(b => b.onclick = () => moveWidget(+b.dataset.p,+b.dataset.w,1));
  refresh();
  dots();
}

function widget(w, pi, wi){
  const [type,size='small'] = w;
  const c = catalog[type] || {label:type};
  return `<article class="dashWidget size-${size} widget-${esc(type)}" data-widget="${esc(type)}">
    <small class="dashWidgetLabel">${esc(c.label)}</small>
    <div class="dashValue" data-value="${esc(type)}">--</div>
    ${edit ? `<div class="widgetEdit"><button data-left data-p="${pi}" data-w="${wi}">←</button><button data-size data-p="${pi}" data-w="${wi}">SIZE</button><button data-right data-p="${pi}" data-w="${wi}">→</button><button data-remove data-p="${pi}" data-w="${wi}">×</button></div>` : ''}
  </article>`;
}

function picker(pi){
  $('#dashPicker')?.remove();
  const m = document.createElement('div');
  m.id = 'dashPicker';
  m.className = 'dashPicker';
  const groups = {};
  Object.entries(catalog).forEach(([k,v]) => (groups[v.cat] ??= []).push([k,v]));
  m.innerHTML = `<section><header><div><small>WIDGET LIBRARY</small><h3>Add to ${esc(layout[pi].name)}</h3></div><button>×</button></header>${Object.entries(groups).map(([g,items]) => `<h4>${esc(g)}</h4><div>${items.map(([k,v]) => `<button data-type="${k}">${esc(v.label)}</button>`).join('')}</div>`).join('')}</section>`;
  document.body.appendChild(m);
  m.querySelector('header button').onclick = () => m.remove();
  m.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
    const type = b.dataset.type;
    layout[pi].widgets.push([type, type === 'map' || type === 'rides' ? 'hero' : 'small']);
    saveLayout();
    m.remove();
    render();
  });
}

function openStylePicker(){
  $('#dashStylePicker')?.remove();
  const m = document.createElement('div');
  m.id = 'dashStylePicker';
  m.className = 'dashStylePicker';
  m.innerHTML = `<section>
    <header><div><small>RIDE DASH CONFIGURATOR</small><h3>Style & display</h3></div><button id="dashStyleClose">×</button></header>
    <h4>VIBE</h4>
    <div class="dashThemeGrid">${Object.entries(themePresets).map(([id,t]) => `<button class="dashThemeCard ${style.theme === id ? 'active' : ''}" data-theme="${id}"><i></i><span><strong>${esc(t.name)}</strong><small>${esc(t.description)}</small></span></button>`).join('')}</div>
    <div class="dashStyleSection"><div><h4>ACCENT COLOR</h4><small>Override the selected vibe with your own highlight color.</small></div><div class="dashColorRow"><input id="dashAccentColor" type="color" value="${esc(style.accent)}" aria-label="Accent color"><button class="dashSwatch" data-color="#22d3ee" style="--swatch:#22d3ee" aria-label="Cyan"></button><button class="dashSwatch" data-color="#ef2b2d" style="--swatch:#ef2b2d" aria-label="Red"></button><button class="dashSwatch" data-color="#d6a62b" style="--swatch:#d6a62b" aria-label="Amber"></button><button class="dashSwatch" data-color="#8b5cf6" style="--swatch:#8b5cf6" aria-label="Violet"></button><button class="dashSwatch" data-color="#22c55e" style="--swatch:#22c55e" aria-label="Green"></button></div></div>
    <h4>DISPLAY DENSITY</h4>
    <div class="dashSegmented" data-setting="density"><button data-value="compact">COMPACT</button><button data-value="balanced">BALANCED</button><button data-value="immersive">IMMERSIVE</button></div>
    <h4>PRIMARY GAUGE</h4>
    <div class="dashSegmented" data-setting="gauge"><button data-value="digital">DIGITAL</button><button data-value="arc">HUD ARC</button><button data-value="analog">ANALOG</button></div>
    <div class="dashToggleGrid">
      <label><span><strong>Active glow</strong><small>Neon edge lighting and live-state pulse.</small></span><input type="checkbox" data-toggle="glow" ${style.glow ? 'checked' : ''}></label>
      <label><span><strong>Surface texture</strong><small>Carbon, topo or brushed-metal theme detail.</small></span><input type="checkbox" data-toggle="texture" ${style.texture ? 'checked' : ''}></label>
      <label><span><strong>Widget labels</strong><small>Keep metric titles visible above each value.</small></span><input type="checkbox" data-toggle="labels" ${style.labels ? 'checked' : ''}></label>
    </div>
    <div class="dashStyleActions"><button id="dashApplyPreset">APPLY ${esc(themePresets[style.theme]?.name || 'THEME')} DISPLAY</button><button id="dashResetStyle">RESET STYLE</button></div>
  </section>`;
  document.body.appendChild(m);

  const syncControls = () => {
    m.querySelectorAll('[data-setting]').forEach(group => group.querySelectorAll('[data-value]').forEach(btn => btn.classList.toggle('active', style[group.dataset.setting] === btn.dataset.value)));
    m.querySelectorAll('.dashThemeCard').forEach(btn => btn.classList.toggle('active', style.theme === btn.dataset.theme));
    const apply = $('#dashApplyPreset');
    if(apply) apply.textContent = `APPLY ${String(themePresets[style.theme]?.name || 'THEME').toUpperCase()} DISPLAY`;
  };

  $('#dashStyleClose').onclick = () => m.remove();
  m.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
    const preset = themePresets[b.dataset.theme];
    if(!preset) return;
    style = {...style, theme:b.dataset.theme, accent:preset.accent, density:preset.density, gauge:preset.gauge};
    $('#dashAccentColor').value = style.accent;
    saveStyle();
    applyStyle();
    syncControls();
  });
  $('#dashAccentColor').oninput = e => {
    style.accent = e.target.value;
    saveStyle();
    applyStyle();
  };
  m.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
    style.accent = b.dataset.color;
    $('#dashAccentColor').value = style.accent;
    saveStyle();
    applyStyle();
  });
  m.querySelectorAll('[data-setting] [data-value]').forEach(b => b.onclick = () => {
    style[b.closest('[data-setting]').dataset.setting] = b.dataset.value;
    saveStyle();
    applyStyle();
    syncControls();
  });
  m.querySelectorAll('[data-toggle]').forEach(input => input.onchange = () => {
    style[input.dataset.toggle] = input.checked;
    saveStyle();
    applyStyle();
  });
  $('#dashApplyPreset').onclick = () => {
    if(!confirm(`Replace your current Ride Dash displays with the ${themePresets[style.theme]?.name || 'selected'} preset?`)) return;
    layout = clone(themeLayouts[style.theme] || defaults);
    saveLayout();
    render();
    m.remove();
  };
  $('#dashResetStyle').onclick = () => {
    const preset = themePresets.future;
    style = {theme:'future', accent:preset.accent, density:preset.density, gauge:preset.gauge, glow:true, texture:true, labels:true};
    saveStyle();
    applyStyle();
    m.remove();
  };
  syncControls();
}

function hexToRgb(hex){
  const clean = String(hex || '').replace('#','');
  const value = clean.length === 3 ? clean.split('').map(x => x + x).join('') : clean;
  if(!/^[0-9a-f]{6}$/i.test(value)) return '34, 211, 238';
  return `${parseInt(value.slice(0,2),16)}, ${parseInt(value.slice(2,4),16)}, ${parseInt(value.slice(4,6),16)}`;
}

function applyStyle(){
  const overlay = $('#rideDashOverlay');
  if(!overlay) return;
  overlay.dataset.theme = themePresets[style.theme] ? style.theme : 'future';
  overlay.dataset.density = ['compact','balanced','immersive'].includes(style.density) ? style.density : 'balanced';
  overlay.dataset.gauge = ['digital','arc','analog'].includes(style.gauge) ? style.gauge : 'arc';
  overlay.dataset.glow = style.glow ? 'on' : 'off';
  overlay.dataset.texture = style.texture ? 'on' : 'off';
  overlay.dataset.labels = style.labels ? 'on' : 'off';
  overlay.style.setProperty('--dash-accent', style.accent || themePresets.future.accent);
  overlay.style.setProperty('--dash-accent-rgb', hexToRgb(style.accent));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', style.accent || '#050914');
}

function showRidePicker(){
  if(rideActionBusy) return;
  const controller = window.MotoRide;
  if(!controller){ alert('Ride logger is still loading. Try again in a moment.'); return; }
  const bikes = controller.getBikes?.() || [];
  $('#dashRidePicker')?.remove();
  const m = document.createElement('div');
  m.id = 'dashRidePicker';
  m.className = 'dashRidePicker';
  m.innerHTML = `<section><header><div><small>START RIDE</small><h3>Select motorcycle</h3></div><button id="dashRidePickerClose" type="button">×</button></header><div class="dashBikeGrid">${bikes.map(b => `<button type="button" data-bike-id="${esc(b.id)}"><span><strong>${esc(b.name)}</strong><small>${Math.round(Number(b.odometer || 0))} mi</small></span><b>START</b></button>`).join('') || '<p>No motorcycles found. Add one in Garage first.</p>'}</div></section>`;
  document.body.appendChild(m);
  $('#dashRidePickerClose').onclick = () => m.remove();
  m.querySelectorAll('[data-bike-id]').forEach(b => b.onclick = () => startRide(b.dataset.bikeId,m));
}

async function startRide(bikeId, modal){
  if(rideActionBusy) return;
  rideActionBusy = true;
  modal?.querySelectorAll('button').forEach(b => b.disabled = true);
  state.ride = {...(state.ride || {}), starting:true};
  refresh();
  try {
    resetRuntime();
    await window.MotoRide.start(bikeId);
    modal?.remove();
  } catch(error) {
    alert(error?.message || String(error));
  } finally {
    rideActionBusy = false;
    state.ride = window.MotoRide?.getState?.() || state.ride;
    refresh();
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
  refresh();
  try {
    await controller.stop();
  } catch(error) {
    alert(error?.message || String(error));
  } finally {
    rideActionBusy = false;
    state.ride = controller.getState?.() || state.ride;
    state.rides = controller.getRides?.() || state.rides;
    refresh();
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
  control.classList.toggle('recording', active);
  control.classList.toggle('starting', starting || rideActionBusy);
  dot.classList.toggle('live', active);
  status.textContent = active ? 'RECORDING' : starting ? 'STARTING LOGGER' : 'SYSTEM READY';
  bike.textContent = active ? (ride.bikeName || 'Motorcycle') : (starting ? 'Preparing GPS and ride storage…' : 'Select a motorcycle to begin');
  toggle.disabled = starting || rideActionBusy;
  toggle.textContent = active ? (rideActionBusy ? 'SAVING…' : 'STOP & SAVE') : (starting || rideActionBusy ? 'STARTING…' : 'START RIDE');
  if(active && !runtime.rideWasActive) resetRuntime();
  runtime.rideWasActive = active;
}

function resetRuntime(){
  runtime = {maxLeanLeft:0, maxLeanRight:0, cornerSpeedSum:0, cornerSamples:0, lastCornerSample:0, rideWasActive:Boolean(state.ride?.active)};
}

function rename(i){
  const n = prompt('Display name', layout[i].name);
  if(n?.trim()){
    layout[i].name = n.trim().slice(0,24);
    saveLayout();
    render();
  }
}

function addPage(){
  layout.push({id:`custom-${Date.now()}`, name:`Custom ${layout.length + 1}`, widgets:[['speed','wide'],['distance','small'],['heading','small'],['rides','wide']]});
  saveLayout();
  render();
  setTimeout(() => $('#dashPages')?.lastElementChild?.scrollIntoView({behavior:'smooth',inline:'start'}), 50);
}

function deletePage(i){
  if(confirm(`Delete ${layout[i].name}?`)){
    layout.splice(i,1);
    saveLayout();
    render();
  }
}

function removeWidget(p,w){ layout[p].widgets.splice(w,1); saveLayout(); render(); }
function moveWidget(p,w,d){ const a = layout[p].widgets, j = w + d; if(j < 0 || j >= a.length) return; [a[w],a[j]] = [a[j],a[w]]; saveLayout(); render(); }
function resizeWidget(p,w){ const sizes = ['small','wide','xl','hero'], x = layout[p].widgets[w]; x[1] = sizes[(sizes.indexOf(x[1]) + 1) % sizes.length]; saveLayout(); render(); }
function scrollPage(d){ const p = $('#dashPages'); p?.scrollBy({left:d * p.clientWidth,behavior:'smooth'}); }

function dots(){
  const p = $('#dashPages');
  const d = $('#dashDots');
  if(!p || !d) return;
  d.innerHTML = layout.map((_,i) => `<i class="${i === 0 ? 'active' : ''}"></i>`).join('');
  const activate = i => {
    [...d.children].forEach((x,j) => x.classList.toggle('active', i === j));
    [...($('#dashTabs')?.children || [])].forEach((x,j) => x.classList.toggle('active', i === j));
  };
  activate(0);
  p.onscroll = () => activate(Math.round(p.scrollLeft / Math.max(1,p.clientWidth)));
}

function fmtDuration(seconds){
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

function fmtRideDate(value){
  if(!value) return 'Saved ride';
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return 'Saved ride';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `Today · ${d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : d.toLocaleDateString([], {month:'short',day:'numeric',year:d.getFullYear() === today.getFullYear() ? undefined : 'numeric'});
}

function rideCards(){
  const rides = state.rides || [];
  if(!rides.length) return `<div class="dashRideEmpty"><strong>No completed rides yet</strong><span>Finish a ride and it will appear here automatically.</span><button class="dashOpenRides">OPEN RIDE CENTER</button></div>`;
  return `<div class="dashRideStrip">${rides.slice(0,8).map((ride,i) => `<button class="dashRideCard ${i === 0 ? 'latest' : ''}" data-open-rides><span class="dashRouteTrace" aria-hidden="true"><svg viewBox="0 0 120 34"><path d="M4 ${24-(i%3)*4} C 20 ${5+(i%4)*3}, 36 ${31-(i%2)*7}, 54 ${13+(i%3)*4} S 87 ${5+(i%2)*9}, 116 ${18-(i%3)*3}"/></svg></span><strong>${esc(ride.bikeName || 'Motorcycle')}</strong><small>${esc(fmtRideDate(ride.startedAt))}</small><span class="dashRideStats"><b>${Number(ride.distanceMiles || 0).toFixed(1)} mi</b><b>${fmtDuration(ride.durationSeconds)}</b></span></button>`).join('')}</div><button class="dashOpenRides dashViewAll">ALL RIDES <span>›</span></button>`;
}

function value(type){
  const r = state.ride || {};
  const g = state.gps || {};
  const road = state.road || {};
  const w = state.weather || {};
  const speed = Math.max(0, Number(r.speedMph ?? g.speed ?? 0) || 0);
  const lean = Number(state.lean?.lean || 0);
  switch(type){
    case 'speed': {
      const pct = Math.min(100, speed / 160 * 100);
      return `<div class="dashSpeedGauge" style="--speed-pct:${pct}%"><div class="dashGaugeTicks"></div><div class="dashSpeedNumber">${Math.round(speed)}</div><span>MPH</span><i>0</i><i>160</i></div>`;
    }
    case 'distance': return `${Number(r.distanceMiles ?? 0).toFixed(2)} <span>mi</span>`;
    case 'rideTime': return r.elapsedText || '00:00:00';
    case 'avgSpeed': return `${Math.round(r.averageSpeedMph ?? 0)} <span>mph</span>`;
    case 'maxSpeed': return `${Math.round(r.maxSpeedMph ?? 0)} <span>mph</span>`;
    case 'road': return `<strong class="dashRoadName">${esc(road.road || 'Scanning road data')}</strong><span class="dashRoadSub">${Number.isFinite(road.limit_mph) ? `${road.limit_mph} mph zone` : 'Live road context'}</span>`;
    case 'limit': return Number.isFinite(road.limit_mph) ? `${road.limit_mph} <span>mph</span>` : '--';
    case 'heading': return Number.isFinite(r.heading ?? g.heading) ? `${Math.round(r.heading ?? g.heading)}° <span>${headingText(r.heading ?? g.heading)}</span>` : '--°';
    case 'altitude': return Number.isFinite(r.altitudeFt) ? `${Math.round(r.altitudeFt)} <span>ft</span>` : Number.isFinite(g.altitude) ? `${Math.round(g.altitude * 3.28084)} <span>ft</span>` : '--';
    case 'gps': return r.gpsLocked ? `LOCKED <span>${Number.isFinite(r.accuracyFt) ? `±${Math.round(r.accuracyFt)} ft` : ''}</span>` : Number.isFinite(g.latitude) ? `LOCKED <span>±${Math.round((g.accuracy || 0) * 3.28084)} ft</span>` : 'WAITING';
    case 'weather': return `${w.temperature ?? w.temp ?? '--'}° <span>${w.rainChance ?? w.rain ?? '--'}% rain</span>`;
    case 'range': return `${localStorage.getItem('motoEstimatedRange') || '--'} <span>mi</span>`;
    case 'lean': {
      const direction = lean < -0.5 ? 'LEFT' : lean > 0.5 ? 'RIGHT' : 'CENTER';
      const pct = Math.min(100, Math.abs(lean) / 50 * 100);
      return `<div class="dashLeanGauge" style="--lean-pct:${pct}%;--lean-side:${lean < 0 ? -1 : 1}"><div><strong>${Math.round(Math.abs(lean))}°</strong><span>${direction}</span></div></div>`;
    }
    case 'maxLean': return `<div class="dashDualMetric"><span><small>LEFT</small><strong>${Math.round(runtime.maxLeanLeft)}°</strong></span><i></i><span><small>RIGHT</small><strong>${Math.round(runtime.maxLeanRight)}°</strong></span></div>`;
    case 'cornerSpeed': return `${runtime.cornerSamples ? Math.round(runtime.cornerSpeedSum / runtime.cornerSamples) : 0} <span>mph</span>`;
    case 'accel': return `${Number(state.lean?.accel || 0).toFixed(2)} <span>g</span>`;
    case 'bike': return `<strong class="dashBikeName">${esc(r.bikeName || 'Select a motorcycle')}</strong><span class="dashBikeStatus">${r.active ? 'ACTIVE RIDE' : 'READY'}</span>`;
    case 'map': return `<button class="dashMapPreview dashOpenAdventure"><span class="dashTopo"></span><svg viewBox="0 0 320 130" preserveAspectRatio="none" aria-hidden="true"><path class="route-shadow" d="M8,111 C45,93 49,51 92,62 S140,119 174,76 S232,18 312,34"/><path class="route-line" d="M8,111 C45,93 49,51 92,62 S140,119 174,76 S232,18 312,34"/></svg><span class="dashMapPin"></span><strong>OPEN LIVE ADVENTURE MAP</strong><small>3D terrain · heading lock · route tools</small></button>`;
    case 'rides': return rideCards();
    case 'placeholder': return '<span>RPM · TEMP · VOLTAGE<br>Ready for ESP integration</span>';
    default: return '--';
  }
}

function headingText(degrees){
  if(!Number.isFinite(Number(degrees))) return '';
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round((((Number(degrees) % 360) + 360) % 360) / 45) % 8];
}

function refresh(){
  renderRideControl();
  document.querySelectorAll('#rideDashOverlay [data-value]').forEach(x => x.innerHTML = value(x.dataset.value));
  document.querySelectorAll('.dashOpenAdventure').forEach(b => b.onclick = openAdventure);
  document.querySelectorAll('.dashOpenRides,[data-open-rides]').forEach(b => b.onclick = openRideCenter);
}

window.addEventListener('moto-ride-state', e => {
  state.ride = e.detail;
  refresh();
});
window.addEventListener('moto-rides-update', e => {
  state.rides = Array.isArray(e.detail) ? e.detail : [];
  refresh();
});
window.addEventListener('moto-gps-fix', e => { state.gps = e.detail; refresh(); });
window.addEventListener('moto-road-update', e => { state.road = e.detail; refresh(); });
window.addEventListener('moto-weather-update', e => { state.weather = e.detail; refresh(); });
window.addEventListener('moto-motion-update', e => {
  state.lean = e.detail;
  const lean = Number(e.detail?.lean || 0);
  if(lean < 0) runtime.maxLeanLeft = Math.max(runtime.maxLeanLeft, Math.abs(lean));
  if(lean > 0) runtime.maxLeanRight = Math.max(runtime.maxLeanRight, Math.abs(lean));
  const now = Date.now();
  const speed = Number(state.ride?.speedMph ?? state.gps?.speed ?? 0);
  if(Math.abs(lean) >= 7 && speed > 1 && now - runtime.lastCornerSample > 500){
    runtime.cornerSpeedSum += speed;
    runtime.cornerSamples += 1;
    runtime.lastCornerSample = now;
  }
  refresh();
});

const observer = new MutationObserver(nav);
observer.observe(document.querySelector('#app') || document.body, {childList:true,subtree:false});
nav();
