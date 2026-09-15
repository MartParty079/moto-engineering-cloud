const APP_NAME = 'Marty Moto Party';
function applyBranding() {
  document.title = APP_NAME;
  const copy = [['.brandCopy h1',APP_NAME],['.brandCopy p','Rider hub'],['.navFooter b',APP_NAME]];
  for (const [selector,text] of copy) {
    const element = document.querySelector(selector);
    if (element && element.textContent !== text) element.textContent = text;
  }
}
const root = document.querySelector('#app');
if (root) new MutationObserver(applyBranding).observe(root,{childList:true});
applyBranding();
