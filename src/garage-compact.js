// Compact Garage cards: identity and totals stay visible; controls live in Quick settings.
(() => {
  if (window.__motoGarageCompactInstalled) return;
  window.__motoGarageCompactInstalled = true;
  const CARD_SELECTOR = '.bikeHero';
  const hostFor = card => card.querySelector(':scope > div') || card;
  function labelFor(card) {
    const heading = card.querySelector('h2,h3,strong')?.textContent?.trim();
    return heading ? `Quick settings for ${heading}` : 'Quick motorcycle settings';
  }
  function ensureDrawer(card) {
    let drawer = card.querySelector('.garageCompactDrawer');
    if (!drawer) {
      drawer = document.createElement('details');
      drawer.className = 'garageCompactDrawer';
      drawer.innerHTML = `<summary><span>Quick settings</span><i aria-hidden="true">⌄</i></summary><div class="garageCompactContent"></div>`;
      hostFor(card).appendChild(drawer);
    }
    drawer.querySelector('summary')?.setAttribute('aria-label', labelFor(card));
    if (!drawer.dataset.bound) {
      drawer.dataset.bound = '1';
      drawer.addEventListener('click', event => event.stopPropagation());
      drawer.addEventListener('toggle', () => {
        const text = drawer.querySelector('summary span');
        if (text) text.textContent = drawer.open ? 'Hide settings' : 'Quick settings';
      });
    }
    return drawer;
  }
  function compactCard(card) {
    if (!(card instanceof HTMLElement)) return;
    const host = hostFor(card),drawer = ensureDrawer(card),content = drawer.querySelector('.garageCompactContent');
    if (!content) return;
    const note = [...host.children].find(node => node.tagName === 'P' && !node.classList.contains('garageCompactNotes'));
    if (note) { note.classList.add('garageCompactNotes'); content.prepend(note); }
    const actionGrid = card.querySelector('.garagePrimaryActions');
    if (actionGrid && !content.contains(actionGrid)) content.appendChild(actionGrid);
    [...card.querySelectorAll('[data-edit^="bikes:"],[data-del^="bikes:"]')].forEach(control => {
      if (content.contains(control)) return;
      const wrapper = control.closest('.actions,.buttonRow,.bikeActions');
      const node = wrapper && card.contains(wrapper) && !wrapper.closest('.garageCompactDrawer') ? wrapper : control;
      if (!content.contains(node)) content.appendChild(node);
    });
    if (host.lastElementChild !== drawer) host.appendChild(drawer);
    card.classList.add('garageCardCompact');
  }
  function compactAll(root=document) {
    root.querySelectorAll?.(CARD_SELECTOR).forEach(compactCard);
    if (root.matches?.(CARD_SELECTOR)) compactCard(root);
  }
  const observer = new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
    if (!(node instanceof HTMLElement)) return;
    compactAll(node);
    const card=node.closest?.(CARD_SELECTOR);if(card)compactCard(card);
  })));
  const start=()=>{compactAll();observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true})};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
