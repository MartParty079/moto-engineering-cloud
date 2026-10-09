const APP_NAME = 'Moto Mission';
function applyBranding() {
  document.title = APP_NAME;
  const copy = [['.brandCopy h1',APP_NAME],['.brandCopy p','Prepare · Ride · Review'],['.navFooter b',APP_NAME]];
  for (const [selector,text] of copy) {
    const element = document.querySelector(selector);
    if (element && element.textContent !== text) element.textContent = text;
  }
}
const root = document.querySelector('#app');
if (root) new MutationObserver(applyBranding).observe(root,{childList:true});
applyBranding();
