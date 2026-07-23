import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root=process.cwd();
const ignored=new Set(['node_modules','dist','.git']);
const sourceFiles=[];

async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(ignored.has(entry.name))continue;
    const path=join(dir,entry.name);
    if(entry.isDirectory())await walk(path);
    else if(['.js','.mjs','.html'].includes(extname(entry.name).toLowerCase()))sourceFiles.push(path);
  }
}

await walk(root);

const rows=[];
let combined='';
for(const path of sourceFiles){
  const name=relative(root,path);
  const text=await readFile(path,'utf8');
  combined+=`\n/* ${name} */\n${text}`;
  rows.push({name,text});
}

const warnings=[];
const failures=[];
const buttonIds=new Map();
const routeValues=new Set();
let buttonCount=0;
let inlineClickCount=0;
let missingTypeCount=0;
let documentClickCount=0;
let aggressiveObserverCount=0;

for(const {name,text} of rows){
  const buttons=[...text.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  buttonCount+=buttons.length;
  for(const match of buttons){
    const attrs=match[1]||'';
    const body=(match[2]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    const id=attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
    if(id){
      if(!buttonIds.has(id))buttonIds.set(id,[]);
      buttonIds.get(id).push(name);
    }
    if(!/\btype=["'](?:button|submit|reset)["']/i.test(attrs))missingTypeCount+=1;
    if(!body&&!/\b(?:aria-label|title)=["'][^"']+["']/i.test(attrs))warnings.push(`${name}: icon/empty button needs an accessible label${id?` (#${id})`:''}`);
  }

  inlineClickCount+=(text.match(/\bonclick\s*=/gi)||[]).length;
  documentClickCount+=(text.match(/document\.addEventListener\(\s*["']click["']/g)||[]).length;
  aggressiveObserverCount+=(text.match(/MutationObserver[\s\S]{0,500}observe\([^)]*document\.body[\s\S]{0,180}subtree\s*:\s*true[\s\S]{0,180}attributes\s*:\s*true/g)||[]).length;
  for(const route of text.matchAll(/data-v=["']([^"']+)["']/g))routeValues.add(route[1]);

  if(/target=["']_blank["']/i.test(text)&&!/rel=["'][^"']*noopener/i.test(text))warnings.push(`${name}: target=_blank without noopener`);
}

for(const [id,files] of buttonIds){
  const occurrences=(combined.match(new RegExp(`(?:#|id=["'])${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`, 'g'))||[]).length;
  if(occurrences<2)warnings.push(`${files[0]}: button #${id} appears to have no explicit binding/reference`);
  if(files.length>1)warnings.push(`Duplicate literal button id #${id}: ${[...new Set(files)].join(', ')}`);
}

const renderedViews=new Set([...combined.matchAll(/view\s*===\s*["']([^"']+)["']/g)].map(match=>match[1]));
for(const route of routeValues){
  const referenced=new RegExp(`(?:view\\s*===\\s*["']${route}["']|data-v=["']${route}["']|\\[data-v=["']${route}["']\\])`).test(combined);
  if(!renderedViews.has(route)&&!referenced)warnings.push(`Navigation route ${route} has no visible render/handler reference`);
}

const index=rows.find(row=>row.name==='index.html')?.text||'';
const indexIds=[...index.matchAll(/\bid=["']([^"']+)["']/g)].map(match=>match[1]);
const duplicateIndexIds=[...new Set(indexIds.filter((id,index,array)=>array.indexOf(id)!==index))];
if(duplicateIndexIds.length)failures.push(`index.html contains duplicate ids: ${duplicateIndexIds.join(', ')}`);

if(aggressiveObserverCount)warnings.push(`${aggressiveObserverCount} aggressive body attribute observer(s) remain; inspect for tap-time layout work`);
if(inlineClickCount)warnings.push(`${inlineClickCount} inline onclick handler(s) remain; delegated/property handlers are easier to audit`);
if(missingTypeCount)warnings.push(`${missingTypeCount} generated button(s) omit type; runtime normalization covers non-submit controls`);

console.log('Interaction audit');
console.log(`- Files scanned: ${rows.length}`);
console.log(`- Button literals: ${buttonCount}`);
console.log(`- Navigation routes: ${routeValues.size}`);
console.log(`- Document click delegates: ${documentClickCount}`);
console.log(`- Inline onclick handlers: ${inlineClickCount}`);
console.log(`- Buttons without explicit type: ${missingTypeCount}`);

if(warnings.length){
  console.log('\nInteraction warnings:');
  [...new Set(warnings)].slice(0,80).forEach(warning=>console.log(`- ${warning}`));
  if(warnings.length>80)console.log(`- … ${warnings.length-80} additional warnings omitted`);
}

if(failures.length){
  console.error('\nInteraction failures:');
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
