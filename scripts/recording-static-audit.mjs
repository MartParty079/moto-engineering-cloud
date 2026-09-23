import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const checks=[];
const add=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});

const gps=read('src/gps-shared.js');
const recorder=read('src/ride-recorder.js');
const runtime=read('src/ride-runtime.js');
const journal=read('src/ride-journal.js');
const callback=recorder.slice(recorder.indexOf('  capture()'),recorder.indexOf('  async stop()'));
add('Live GPS callback uses the durable journal without Supabase',callback.includes('this.journal.append')&&!/supabase\s*\./.test(callback));
add('Live GPS callback contains no global event dispatch',!/dispatchEvent\s*\(/.test(callback));
add('Live GPS samples are rate limited',runtime.includes('timestamp - lastSampleAt < 1000'));
add('Runtime excludes recording sessions from network synchronization',runtime.includes("ride.status === 'recording'")&&runtime.includes('continue;'));
add('Journal commits samples and summaries atomically',journal.includes("durability: 'strict'")&&journal.includes("db.transaction(['rides', 'samples', 'reviewSamples']"));
add('GPS broker multiplexes virtual subscribers',/const subscribers\s*=\s*new Map/.test(gps)&&/nativeWatch\(fanOutPosition/.test(gps));
add('GPS broker overrides clearWatch as well as watchPosition',/Object\.defineProperty\(geo,'watchPosition'/.test(gps)&&/Object\.defineProperty\(geo,'clearWatch'/.test(gps));
add('GPS broker suspends non-recorder subscribers',/subscriber\.recordingOwner/.test(gps)&&/suspendedCallbacks/.test(gps));

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
