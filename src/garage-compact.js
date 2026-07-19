// Compact garage cards: show motorcycle identity and totals by default.
// Notes, tools, edit, delete, and settings live inside one expandable drawer.
(() => {
  if (window.__motoGarageCompactInstalled) return;
  window.__motoGarageCompactInstalled = true;

  const CARD_SELECTOR = '.bikeHero';

  function cardHost(card) {
    return card.querySelector(':scope > div') || card;
  }

  function labelFor(card) {
    const heading = card.querySelector('h2,h3,strong')?.textContent?.trim();
    return heading ? `More options for ${heading}` : 'More bike options';
  }

  function ensureDrawer(card) {
    let drawer = card.querySelector('.garageCompactDrawer');
    if (!drawer) {
      drawer = document.createElement('details');
      drawer.className = 'garageCompactDrawer';
      drawer.innerHTML = `<summary><span>Show more</span><i aria-hidden="true">⌄</i></summary><div class="garageCompactContent"></div>`;
      drawer.querySelector('summary')?.setAttribute('aria-label', labelFor(card));
      drawer.addEventListener('click', event => event.stopPropagation());
      drawer.addEventListener('toggle', () => {
        const text = drawer.querySelector('summary span');
        if (text) text.textContent = drawer.open ? 'Show less' : 'Show more';
      });
      cardHost(card).appendChild(drawer);
    }
    return drawer;
  }

  function moveNotes(card, content) {
    const host = cardHost(card);
    const note = [...host.children].find(node =>
      node.tagName === 'P' && !node.classList.contains('garageCompactNotes')
    );
    if (!note) return;
    note.classList.add('garageCompactNotes');
    content.prepend(note);
  }

  function moveActionGrid(card, content) {
    const actionGrid = card.querySelector('.garagePrimaryActions');
    if (actionGrid && !content.contains(actionGrid)) content.appendChild(actionGrid);
  }

  function moveLegacyControls(card, content) {
    const controls = [...card.querySelectorAll('[data-edit^="bikes:"],[data-del^="bikes:"]')];
    controls.forEach(control => {
      if (content.contains(control)) return;
      const wrapper = control.closest('.actions,.buttonRow,.bikeActions');
      const node = wrapper && card.contains(wrapper) && !wrapper.closest('.garageCompactDrawer')
        ? wrapper
        : control;
      if (!content.contains(node)) content.appendChild(node);
    });
  }

  function compactCard(card) {
    if (!(card instanceof HTMLElement)) return;
    const host = cardHost(card);
    const drawer = ensureDrawer(card);
    const content = drawer.querySelector('.garageCompactContent');
    if (!content) return;

    moveNotes(card, content);
    moveActionGrid(card, content);
    moveLegacyControls(card, content);

    // Totals can be injected after this module runs. Keep the drawer last so
    // mileage and hours always remain above the Show more control.
    if (host.lastElementChild !== drawer) host.appendChild(drawer);
    card.classList.add('garageCardCompact');
  }

  function compactAll(root = document) {
    root.querySelectorAll?.(CARD_SELECTOR).forEach(compactCard);
    if (root.matches?.(CARD_SELECTOR)) compactCard(root);
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        compactAll(node);
        const card = node.closest?.(CARD_SELECTOR);
        if (card) compactCard(card);
      });
    }
  });

  const start = () => {
    compactAll();
    observer.observe(document.querySelector('#app') || document.body, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();