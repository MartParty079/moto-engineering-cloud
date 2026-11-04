export async function openArea(page,view){
  const aliases={dashboard:['home'],routes:['home','routes'],rides:['rideCenter','review'],devices:['rideCenter','sensors']};
  const [tab,mode]=aliases[view]||[view];
  const primary=page.locator(`#motoBottomNav [data-go="${tab}"]`);
  if(await primary.count())await primary.click();
  else {await page.locator('#menu').click();await page.locator(`#nav [data-v="${view}"]`).click();}
  if(mode)await page.locator(`#main [data-workspace-modes] [data-mode="${mode}"]`).click();
  if(view==='routes'){
    await page.locator('#missionGpxInput').waitFor({state:'attached'});
    const drawer=page.locator('#missionMapDrawer');
    if(await drawer.getAttribute('data-panel-state')!=='fullscreen')await drawer.locator('[data-panel-expand]').click();
  }
  if(view==='settings')await page.locator('#missionDataPreferences').evaluate(node=>{node.closest('details').open=true;});
}
