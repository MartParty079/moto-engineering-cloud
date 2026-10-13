import { pathToFileURL } from 'node:url';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const out = process.env.MOTO_DESIGN_SCREENSHOTS || await mkdtemp(join(tmpdir(), 'moto-design-'));await mkdir(out,{recursive:true});
const browser = process.env.PLAYWRIGHT_CDP_URL ? await chromium.connectOverCDP(process.env.PLAYWRIGHT_CDP_URL) : await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined});
const context = await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000},colorScheme:'dark'});
const page = await context.newPage();
const errors = []; page.on('pageerror',error=>errors.push(error.message));
const user = {id:'00000000-0000-4000-8000-000000000001',email:'bartholomew.fitzgerald@northwind-industries-holdings.example.com',role:'authenticated',aud:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false,factors:[]};
let accessRole='rider', dashboardEnabled=true;
const bike = {id:'00000000-0000-4000-8000-000000000003',user_id:user.id,name:'Honda CRF450RL — Big Bend backcountry weekend',year:2022,make:'Honda',model:'CRF450RL',odometer:1248,created_at:'2026-01-01T00:00:00Z'};
try {
  await context.addInitScript(()=>localStorage.setItem('moto-startup-permissions-v1',JSON.stringify({location:'granted',motion:'granted'})));
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'&&url.port==='5173')return route.continue();
    if(url.hostname!=='127.0.0.1'||url.port!=='54321')return route.abort();
    if(url.pathname==='/auth/v1/token')return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'invalid_grant',error_description:'Local test rejection'})});
    const table=url.pathname.split('/').at(-1);
    let body=table==='user_profiles'?[{user_id:user.id,role:accessRole,display_name:'Marty'}]:table==='bikes'?[bike]:table==='feature_flags'?['dashboard','garage_mode','motorcycles','maintenance','ride_log','notebook','project_files'].map(feature_key=>({id:feature_key,feature_key,name:feature_key,minimum_role:'rider',release_stage:'production',enabled:feature_key==='dashboard'?dashboardEnabled:true})):[];
    if(route.request().headers().accept?.includes('vnd.pgrst.object'))body=body[0]||null;
    if(url.pathname==='/auth/v1/user')body=user;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });

  const contrast=async selector=>{
    const ratio=await page.locator(selector).first().evaluate(e=>{
      const rgb=color=>(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
      const luminance=c=>rgb(c).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
      let parent=e,bg;while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;parent=parent.parentElement;}
      const a=luminance(getComputedStyle(e).color),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });assert.ok(ratio>=4.5,`${selector} contrast ${ratio.toFixed(2)} must be readable`);
  };
  const capture=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name} must not overflow`);await page.screenshot({path:join(out,`${name}.png`),fullPage:true});};
  const theme=async mode=>{if(await page.locator('html').getAttribute('data-theme')!==mode){await page.locator('[data-theme-toggle]').first().click();await page.waitForFunction(mode=>document.documentElement.dataset.theme===mode,mode);} };
  await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Sign in securely'}).waitFor();
  await capture('signin-dark-desktop');await theme('light');await capture('signin-light-desktop');
  await page.setViewportSize({width:390,height:844});await capture('signin-light-mobile');
  assert.equal(await page.getByRole('button',{name:'Create account',exact:true}).count(),0);
  await page.evaluate(user=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:user.id,role:'authenticated',aal:'aal1',exp:Math.floor(Date.now()/1000)+3600}))+'.test',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),user);
  await page.reload();await page.locator('.motoWelcomePage').waitFor();assert.equal(await page.locator('#missionSignOut').count(),1);
  for(const mode of ['light','dark']){
    await theme(mode);
    for(const [width,height] of [[1440,1000],[390,844],[320,740]]){
      await page.setViewportSize({width,height});await contrast('.missionHeading p');await capture(`home-${mode}-${width}`);
      const toggle=page.locator('[data-theme-toggle]').first(),box=await toggle.boundingBox();assert.ok(box.height>=43&&box.width>=43);
    }
    await page.setViewportSize({width:1440,height:1000});
    for(const view of ['routes','rides','garage','settings','devices']){
      await page.locator(`#nav [data-v="${view}"]`).click();
      if(view==='routes')await page.locator('#missionGpxInput').waitFor();
      if(view==='settings'){await page.locator('#missionDataPreferences form').waitFor();assert.equal(await page.locator('#missionDataPreferences [name=theme]').inputValue(),mode==='light'?'day':'night');}
      if(view==='rides')await page.locator('.unifiedRideLog').waitFor();
      await capture(`${view}-${mode}-desktop`);
      if(view==='settings'){await page.locator('#missionSecurity').click();await page.locator('#securityCenterOverlay').waitFor();await contrast('.securityCard h3');await capture(`security-${mode}`);await page.locator('#closeSecurityCenter').click();}
      if(view==='garage'){await page.locator('.garageCardCompact').first().click();await page.locator('#garageCenterOverlay').waitFor();await capture(`bike-detail-${mode}`);await page.locator('.garageCenterBack').click();}
      await page.setViewportSize({width:390,height:844});await capture(`${view}-${mode}-mobile`);await page.setViewportSize({width:1440,height:1000});
    }
    await page.locator('#missionRideMode').click();await page.locator('#rideDashOverlay').waitFor();assert.equal(await page.locator('.widget-speed').first().evaluate(e=>getComputedStyle(e).backgroundImage),'none','Speed panel follows the selected theme');await contrast('.dashSpeedNumber');await contrast('#rideV3Title');await capture(`cockpit-${mode}-desktop`);await page.setViewportSize({width:390,height:844});await capture(`cockpit-${mode}-mobile`);await page.locator('#dashClose').click();await page.setViewportSize({width:1440,height:1000});
    await page.locator('#nav [data-v="dashboard"]').click();await page.locator('.motoWelcomePage').waitFor();
    await page.reload();await page.locator('.motoWelcomePage').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),mode,'Theme survives reload');
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='200%');await capture('home-dark-large-text');assert.ok(await page.evaluate(()=>document.querySelector('#main').getBoundingClientRect().top>=document.querySelector('.top').getBoundingClientRect().bottom),'Large text must not overlap header');await page.evaluate(()=>document.documentElement.style.fontSize='');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#welcomeStartRide').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:['light/dark theme and reload persistence','invite-only boundary','desktop/mobile five areas','320px long-name layout','200% type','reduced motion','cockpit both themes'],screenshots:out,errors}));
}catch(error){console.log({message:error.message,errors,screenshots:out});throw error}finally{await context.close();await browser.close()}
