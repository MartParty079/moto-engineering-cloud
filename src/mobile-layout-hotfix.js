function syncPageClass(){
  const main = document.querySelector('#main');
  if(!main) return;
  const title = main.querySelector(':scope > .section h2, :scope > .hero h2')?.textContent?.trim().toLowerCase() || '';
  const page = title === 'roadmap' ? 'roadmap' : title === 'engineering' ? 'engineering' : title === 'parts' ? 'parts' : '';
  document.body.classList.toggle('roadmap-view',page === 'roadmap');
  main.dataset.mobilePage = page;
}

let queued = false;
function scheduleSync(){
  if(queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    syncPageClass();
  });
}

const observer = new MutationObserver(mutations => {
  const relevant = mutations.some(mutation => {
    if(mutation.target?.id === 'main') return true;
    return [...mutation.addedNodes].some(node => node.nodeType === 1 && (
      node.id === 'main' || node.querySelector?.('#main')
    ));
  });
  if(relevant) scheduleSync();
});
observer.observe(document.querySelector('#app') || document.body,{childList:true,subtree:true});
window.addEventListener('popstate',scheduleSync);
scheduleSync();