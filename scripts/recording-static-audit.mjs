import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const checks=[];
const add=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});

const index=read('index.html');
const rideCenter=read('src/ride-center.js');
const gps=read('src/gps-shared.js');
const isolation=read('src/recording-isolation.js');
const features=read('src/recorder-features-v42.js');
const roadContext=read('src/recorder-road-context-v45.js');
const phase4=read('src/recorder-phase4-v44.js');
const scrollCss=read('src/recorder-scroll-v43.css');
const pwa=read('src/pwa.js');
const worker=read('public/sw.js');

const order={
  gps:index.indexOf('/src/gps-shared.js?v=6'),
  features:index.indexOf('/src/recorder-features-v42.js?v=1'),
  isolation:index.indexOf('/src/recording-isolation.js?v=1'),
  rideCenter:index.indexOf('/src/ride-center.js?v=23'),
  enhancements:index.indexOf('/src/ride-safe-enhancements.js'),
  dashboard:index.indexOf('/src/ride-dashboard.js')
};
add('GPS broker loads before recording isolation',order.gps>=0&&order.gps<order.isolation,JSON.stringify(order));
add('Recorder feature layer loads before isolation',order.features>order.gps&&order.features<order.isolation,JSON.stringify(order));
add('Recording isolation loads before Ride Center',order.isolation>=0&&order.isolation<order.rideCenter,JSON.stringify(order));
add('Recording isolation loads before enhancements and dashboard',order.isolation<order.enhancements&&order.isolation<order.dashboard,JSON.stringify(order));
add('Road context module is imported by PWA before isolation script executes',pwa.includes("import './recorder-road-context-v45.js?v=1'")&&index.indexOf('/src/pwa.js')<order.isolation);
add('Phase 4 module remains imported by PWA',pwa.includes("import './recorder-phase4-v44.js?v=1'"));

const onPositionStart=rideCenter.indexOf('function onPosition');
const uploadStart=rideCenter.indexOf('async function uploadBufferedSamples');
const onPosition=rideCenter.slice(onPositionStart,uploadStart);
add('Live GPS callback contains no Supabase call',onPositionStart>=0&&!/supabase\s*\./.test(onPosition));
add('Live GPS callback contains no global event dispatch',!/dispatchEvent\s*\(/.test(onPosition));
add('Live GPS samples are rate limited',/SAMPLE_INTERVAL_MS\s*=\s*1000/.test(rideCenter)&&/timestamp\s*-\s*lastSampleAt\s*<\s*SAMPLE_INTERVAL_MS/.test(onPosition));
add('Sample upload happens after recording callback',uploadStart>onPositionStart&&/uploadBufferedSamples\(buffered\)/.test(rideCenter));

add('GPS broker multiplexes virtual subscribers',/const subscribers\s*=\s*new Map/.test(gps)&&/nativeWatch\(fanOutPosition/.test(gps));
add('GPS broker overrides clearWatch as well as watchPosition',/Object\.defineProperty\(geo,'watchPosition'/.test(gps)&&/Object\.defineProperty\(geo,'clearWatch'/.test(gps));
add('GPS broker suspends non-recorder subscribers',/subscriber\.recordingOwner/.test(gps)&&/suspendedCallbacks/.test(gps));

add('Isolation consumes active ride state',/moto-ride-state/.test(isolation)&&/stopImmediatePropagation/.test(isolation));
add('Isolation consumes GPS event fan-out',/moto-gps-fix/.test(isolation)&&/event\.stopImmediatePropagation\(\)/.test(isolation));
add('Isolation blocks weather, tools, motion, and position events',/moto-motion-update.*moto-tools-update.*moto-weather-update.*moto-position/s.test(isolation));
add('Isolation exposes health diagnostics',/maxEventLoopLagMs/.test(isolation)&&/maxDomNodes/.test(isolation)&&/actionTests/.test(isolation));

add('Feature monitor exposes bounded performance metrics',/recMonFps/.test(features)&&/recMonLag/.test(features)&&/recMonGps/.test(features)&&/recMonDom/.test(features));
add('Phase 2 features include route weather and speed history',/recRoute/.test(features)&&/recWeather/.test(features)&&/recSpeedLine/.test(features));
add('Phase 3 metrics are GPS-derived',/acceleration/.test(features)&&/braking/.test(features)&&/cornerSpeed/.test(features)&&/turnRate/.test(features));
add('Weather requests are rate limited and timed out',/600000/.test(features)&&/AbortController/.test(features)&&/5000/.test(features));
add('Feature layer does not access Supabase',!/supabase\s*\./.test(features));

add('Road context lookup is bounded',/MIN_LOOKUP_MS\s*=\s*15_000/.test(roadContext)&&/TIMED_REFRESH_MS\s*=\s*180_000/.test(roadContext)&&/MOVE_REFRESH_MI\s*=\s*0\.08/.test(roadContext));
add('Road lookup has timeout and one-request guard',/state\.busy/.test(roadContext)&&/AbortController/.test(roadContext)&&/6500/.test(roadContext));
add('Road context caches speed limits for offline use',/CACHE_KEY/.test(roadContext)&&/FRESH_MS/.test(roadContext)&&/STALE_MS/.test(roadContext)&&/limit_mph/.test(roadContext));
add('Road context exposes road name speed limit and overspeed UI',/recRoadName/.test(roadContext)&&/recRoadLimitValue/.test(roadContext)&&/MPH OVER/.test(roadContext));
add('Road context performs no database writes',!/\.from\([^)]*\)\.(insert|update|upsert|delete)/.test(roadContext));
add('Phase 4 remains deferred until ride stop',/processAfterRide/.test(phase4)&&/No Phase 4 service writes to the network during a ride/.test(phase4));

add('Recorder is a dedicated vertical touch scroll container',/height:100dvh/.test(scrollCss)&&/overflow-y:scroll/.test(scrollCss)&&/touch-action:pan-y/.test(scrollCss)&&/-webkit-overflow-scrolling:touch/.test(scrollCss));
add('Fixed action dock does not swallow swipe gestures',/\.recActions\{pointer-events:none/.test(scrollCss)&&/\.recActions button\{pointer-events:auto/.test(scrollCss));
add('Recorder reserves space below feature cards',/padding-bottom:calc\(122px/.test(scrollCss));

add('Legacy iPhone safe-mode loader is retired',!pwa.includes('iphone-recording-safe-mode'));
add('PWA build is v45',pwa.includes('recorder-road-context-v45')&&pwa.includes('/sw.js?v=45'));
add('Service worker cache is v45',worker.includes("const VERSION='v45'"));
add('Service worker precaches road context Phase 4 scroll and feature layers',worker.includes('/src/recorder-road-context-v45.js?v=1')&&worker.includes('/src/recorder-phase4-v44.js?v=1')&&worker.includes('/src/recorder-scroll-v43.css')&&worker.includes('/src/recorder-features-v42.js?v=1'));

const sourceFiles=[];
for(const name of fs.readdirSync(path.join(root,'src'))){if(name.endsWith('.js'))sourceFiles.push(name)}
let intervalCount=0,observerCount=0,watchCount=0;
for(const name of sourceFiles){const text=read(`src/${name}`);intervalCount+=(text.match(/setInterval\s*\(/g)||[]).length;observerCount+=(text.match(/new\s+MutationObserver\s*\(/g)||[]).length;watchCount+=(text.match(/\.watchPosition\s*\(/g)||[]).length}

const report={generatedAt:new Date().toISOString(),checks,inventory:{sourceFiles:sourceFiles.length,setIntervalCalls:intervalCount,mutationObservers:observerCount,watchPositionCallSites:watchCount}};
fs.writeFileSync('recording-static-audit.json',JSON.stringify(report,null,2));
fs.writeFileSync('recording-static-audit.md',`# Recording static audit\n\nGenerated: ${report.generatedAt}\n\n| Result | Check | Detail |\n|---|---|---|\n${checks.map(item=>`| ${item.pass?'PASS':'FAIL'} | ${item.name} | ${String(item.detail||'').replaceAll('|','\\|')} |`).join('\n')}\n\n## Source inventory\n\n- JavaScript source files: ${sourceFiles.length}\n- setInterval call sites: ${intervalCount}\n- MutationObserver call sites: ${observerCount}\n- watchPosition call sites: ${watchCount}\n`);
const failed=checks.filter(item=>!item.pass);
for(const item of checks)console.log(`${item.pass?'PASS':'FAIL'} ${item.name}${item.detail?` — ${item.detail}`:''}`);
if(failed.length){console.error(`\n${failed.length} recording audit check(s) failed.`);process.exit(1)}
console.log(`\n${checks.length} recording audit checks passed.`);