import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.E2E_BASE_URL||'http://127.0.0.1:4173';
const engine=String(process.env.E2E_BROWSER||'chromium').toLowerCase();
const browserType=engine==='webkit'?webkit:chromium;
const out=path.resolve('test-results/proof',engine);
await fs.mkdir(out,{recursive:true});

const browser=await browserType.launch({headless:true});
const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'});
await context.addInitScript(()=>{
  localStorage.setItem('motocloud-install-seen','1');
  localStorage.setItem('chatgpt-api-key','must-be-removed');
  localStorage.setItem('moto-ai-history','must-be-removed');
});
const page=await context.newPage();
const errors=[];
let aiNetworkRequests=0;
page.on('pageerror',error=>errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
await page.route(/(?:\/api\/(?:ai|openai|chatgpt)|api\.openai\.com)/i,async route=>{
  aiNetworkRequests+=1;
  await route.abort();
});

let evidence={engine,errors,aiNetworkRequests};
try{
  await page.goto(`${baseURL}/?e2e=1`,{waitUntil:'networkidle',timeout:30000});
  await page.waitForFunction(()=>window.MotoAIIntegration?.removed===true,null,{timeout:15000});
  await page.waitForSelector('#nav',{state:'attached',timeout:15000});
  await page.waitForTimeout(250);

  const state=await page.evaluate(async()=>{
    let blocked=false;
    let blockedName='';
    try{await fetch('/api/ai/chat',{method:'POST',body:'{}'})}
    catch(error){blocked=true;blockedName=error?.name||''}
    const aiNav=document.querySelectorAll('[data-v="ai"]').length;
    const aiLabels=[...document.querySelectorAll('button,a,[role="button"]')].filter(node=>/(AI Assistant|ChatGPT)/i.test(`${node.textContent||''} ${node.getAttribute('aria-label')||''}`)).length;
    const storedKeys=[];
    for(let index=0;index<localStorage.length;index+=1)storedKeys.push(localStorage.key(index));
    return{
      integration:window.MotoAIIntegration,
      aiNav,
      aiLabels,
      blocked,
      blockedName,
      storedKeys,
      documentFlag:document.documentElement.dataset.aiIntegration
    };
  });

  evidence={...evidence,...state,aiNetworkRequests};
  if(state.integration?.enabled!==false||state.integration?.removed!==true)throw new Error(`AI removal state is incorrect: ${JSON.stringify(state.integration)}`);
  if(state.aiNav!==0||state.aiLabels!==0)throw new Error(`AI interface remains: nav=${state.aiNav}, labels=${state.aiLabels}`);
  if(!state.blocked)throw new Error('AI API request was not blocked');
  if(aiNetworkRequests!==0)throw new Error(`Blocked AI request reached the network layer ${aiNetworkRequests} time(s)`);
  if(state.storedKeys.some(key=>/(?:chatgpt|openai|moto-ai|ai-assistant)/i.test(key||'')))throw new Error(`AI storage keys remain: ${state.storedKeys.join(', ')}`);
  if(state.documentFlag!=='removed')throw new Error(`Missing document AI removal flag: ${state.documentFlag}`);
  if(errors.length)throw new Error(`Browser errors: ${errors.join(' | ')}`);

  await page.screenshot({path:path.join(out,'ai-integration-removed-v46.png'),fullPage:true});
  await fs.writeFile(path.join(out,'ai-integration-removed-v46.json'),JSON.stringify({...evidence,status:'PASS'},null,2));
  console.log(`${engine}: ChatGPT navigation, storage, tables and network access are disabled.`);
}catch(error){
  evidence={...evidence,status:'FAIL',error:String(error?.stack||error),body:await page.locator('body').innerText().catch(()=>''),aiNetworkRequests};
  await page.screenshot({path:path.join(out,'ai-integration-removed-v46-failure.png'),fullPage:true}).catch(()=>{});
  await fs.writeFile(path.join(out,'ai-integration-removed-v46.json'),JSON.stringify(evidence,null,2));
  throw error;
}finally{
  await browser.close();
}