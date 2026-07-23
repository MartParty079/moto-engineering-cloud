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
const literalButtonIds=new Map();
const literalRouteValues=new Set();
let buttonCount=0;
let inlineHtmlClickCount=0;
let propertyClickCount=0;
let missingTypeCount=0;
let unnamedButtonCount=0;
let documentClickCount=0;
let aggressiveObserverCount=0;

const isLiteral=value=>Boolean(value)&&!/[${}]/.test(value);

for(const {name,text} of rows){
  const buttons=[...text.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  buttonCount+=buttons.length;
  for(const match of buttons){
    const attrs=match[1]||'';
    const body=(match[2]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    const id=attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
    if(isLiteral(id)){
      if(!literalButtonIds.has(id))literalButtonIds.set(id,new Set());
      literalButtonIds.get(id).add(name);
    }
    if(!/\btype=["'](?:button|submit|reset)["']/i.test(attrs))missingTypeCount+=1;
    if(!body&&!/\b(?:aria-label|title)=["'][^"']+["']/i.test(attrs)){
      unnamedButtonCount+=1;
      warnings.push(`${name}: icon/empty button needs an accessible label${isLiteral(id)?` (#${id})`:''}`);
    }
  }

  inlineHtmlClickCount+=(text.match(/<[^>]+\sonclick\s*=/gi)||[]).length;
  propertyClickCount+=(text.match(/\.onclick\s*=/g)||[]).length;
  documentClickCount+=(text.match(/document\.addEventListener\(\s*["']click["']/g)||[]).length;
  aggressiveObserverCount+=(text.match(/MutationObserver[\s\S]{0,500}observe\([^)]*document\.body[\s\S]{0,180}subtree\s*:\s*true[\s\S]{0,180}attributes\s*:\s*true/g)||[]).length;
  for(const route of text.matchAll(/data-(?:v|go)=["']([^"']+)["']/g))if(isLiteral(route[1]))literalRouteValues.add(route[1]);

  if(/target=["']_blank["']/i.test(text)&&!/rel=["'][^"']*noopener/i.test(text))warnings.push(`${name}: target=_blank without noopener`);
}

for(const [id,files] of literalButtonIds){
  if(files.size>1)warnings.push(`Button id #${id} is declared in multiple files: ${[...files].join(', ')}`);
}

const renderedViews=new Set([...combined.matchAll(/view\s*===\s*["']([^"']+)["']/g)].map(match=>match[1]).filter(isLiteral));
const handledBottomRoutes=new Set([...combined.matchAll(/go\s*===\s*["']([^"']+)["']/g)].map(match=>match[1]).filter(isLiteral));
for(const route of literalRouteValues){
  if(['home','ride','maps','garage','menu'].includes(route)&&!handledBottomRoutes.has(route))warnings.push(`Bottom-navigation route ${route} has no matching handler`);
}

const index=rows.find(row=>row.name==='index.html')?.text||'';
const indexIds=[...index.matchAll(/\bid=["']([^"']+)["']/g)].map(match=>match[1]).filter(isLiteral);
const duplicateIndexIds=[...new Set(indexIds.filter((id,index,array)=>array.indexOf(id)!==index))];
if(duplicateIndexIds.length)failures.push(`index.html contains duplicate ids: ${duplicateIndexIds.join(', ')}`);

if(aggressiveObserverCount)warnings.push(`${aggressiveObserverCount} body attribute observer(s) can run during button-state changes`);
if(inlineHtmlClickCount)warnings.push(`${inlineHtmlClickCount} inline HTML onclick handler(s) remain`);
if(missingTypeCount)warnings.push(`${missingTypeCount} generated button(s) omit type; app-interaction-stability normalizes non-submit controls at runtime`);

console.log('Interaction audit');
console.log(`- Files scanned: ${rows.length}`);
console.log(`- Button literals: ${buttonCount}`);
console.log(`- Rendered main views: ${renderedViews.size}`);
console.log(`- Literal route controls: ${literalRouteValues.size}`);
console.log(`- Document click delegates: ${documentClickCount}`);
console.log(`- Property click bindings: ${propertyClickCount}`);
console.log(`- Inline HTML onclick handlers: ${inlineHtmlClickCount}`);
console.log(`- Buttons without explicit type: ${missingTypeCount}`);
console.log(`- Unnamed icon buttons: ${unnamedButtonCount}`);

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
