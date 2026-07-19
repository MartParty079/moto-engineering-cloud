// Compact garage cards: keep bike identity/totals visible and collapse secondary controls.
(() => {
  if (window.__motoGarageCompactInstalled) return;
  window.__motoGarageCompactInstalled = true;

  const CARD_SELECTOR = '.bikeHero';

  function labelFor(card) {
    const heading = card.querySelector('h2,h3,strong')?.textContent?.trim();
    return heading ? `More options for ${heading}` : 'More bike options';
  }

  function ensureDrawer(card) {
    let drawer = card.querySelector(':scope > .garageCompactDrawer');
    if (drawer) return drawer;

    drawer = document.createElement('details');
    drawer.className = 'garageCompactDrawer';
    drawer.innerHTML = `<summary><span>Show more</span><i aria-hidden="true">⌄</i></summary><div class="garageCompactContent"></div>`;
    drawer.querySelector('summary').setAttribute('aria-label', labelFor(card));
    drawer.addEventListener('toggle', () => {
      const text = drawer.querySelector('summary span');
      if (text) text.textContent = drawer.open ? 'Show less' : 'Show more';
    });
    card.appendChild(drawer);
    return drawer;
  }

  function moveSecondaryControls(card) {
    if (!(card instanceof HTMLElement)) return;
    const drawer = ensureDrawer(card);
    const content = drawer.querySelector('.garageCompactContent');
    if (!content) return;

    // Garage Health adds the main action grid after cards render.
    const actionGrid = card.querySelector(':scope .garagePrimaryActions');
    if (actionGrid && !content.contains(actionGrid)) content.appendChild(actionGrid);

    // Move legacy edit/delete/settings controls into the same drawer without
    // disturbing header, image, identity, totals, or health summaries.
    const controls = [...card.querySelectorAll('[data-edit^="bikes:"],[data-del^="bikes:"],button[data-garage-settings]')];
    controls.forEach(control => {
      if (content.contains(control)) return;
      const wrapper = control.closest('.row,.actions,.buttonRow,.bikeActions');
      const node = wrapper && card.contains(wrapper) && !wrapper.closest('.garageCompactDrawer') ? wrapper : control;
      if (!content.contains(node)) content.appendChild(node);
    });

    card.classList.add('garageCardCompact');
  }

  function compactAll(root = document) {
    root.querySelectorAll?.(CARD_SELECTOR).forEach(moveSecondaryControls);
    if (root.matches?.(CARD_SELECTOR)) moveSecondaryControls(root);
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        compactAll(node);
        const card = node.closest?.(CARD_SELECTOR);
        if (card) moveSecondaryControls(card);
      });
    }
  });

  const start = () => {
    compactAll();
    observer.observe(document.querySelector('#app') || document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
