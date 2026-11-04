import {pathToFileURL} from 'node:url';

export const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
export const launchOptions=engine=>({headless:true,executablePath:engine==='chromium'?process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined:undefined});

export async function isolateTestRequests(page,baseURL){
  const origin=new URL(baseURL);
  if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw new Error('Browser evidence must use a localhost test server.');
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin.origin)return route.continue();
    // These legacy recorder proofs intentionally exercise an unavailable online map.
    // The MM-UI-007 suite separately uses real Leaflet with labeled synthetic tiles.
    if(url.hostname==='unpkg.com')return route.fulfill({status:200,contentType:url.pathname.endsWith('.js')?'application/javascript':'text/css',body:''});
    // Recorder weather is ancillary to these proofs; return an explicit unavailable
    // response rather than letting an intentional network block become a browser error.
    if(url.hostname==='api.open-meteo.com')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({error:true,reason:'Weather unavailable in isolated recorder proof.'})});
    return route.abort();
  });
}
