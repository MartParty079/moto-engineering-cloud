const stampKey = 'motoOverviewLastUpdated';
let lastOverviewSignature = '';
let observerQueued = false;

function formatExact(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(timestamp));
}

function formatRelative(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ensureStyles() {
  if (document.querySelector('#overviewUpdatedStyles')) return;
  const style = document.createElement('style');
  style.id = 'overviewUpdatedStyles';
  style.textContent = `
    .overviewUpdatedRow{display:flex;justify-content:flex-end;margin:-2px 0 12px}
    .overviewUpdatedBadge{display:inline-flex;align-items:center;gap:8px;padding:7px 11px;border:1px solid rgba(148,163,184,.2);border-radius:999px;background:rgba(15,23,42,.58);color:#cbd5e1;font-size:12px;line-height:1;box-shadow:0 8px 24px rgba(0,0,0,.12)}
    .overviewUpdatedBadge i{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}
    .overviewUpdatedBadge b{color:#f8fafc;font-weight:700}
    .overviewUpdatedBadge time{font-variant-numeric:tabular-nums}
    @media(max-width:640px){.overviewUpdatedRow{justify-content:flex-start;margin-top:-4px}.overviewUpdatedBadge{font-size:11px;padding:7px 10px}}
  `;
  document.head.appendChild(style);
}

function isOverview(main) {
  const hero = main?.querySelector('.hero.card');
  return Boolean(hero && /Universal Motorcycle Data System/i.test(hero.textContent || ''));
}

function updateText() {
  const badge = document.querySelector('#overviewLastUpdated');
  if (!badge) return;
  const timestamp = Number(badge.dataset.timestamp);
  badge.querySelector('time').textContent = formatExact(timestamp);
  badge.querySelector('[data-relative]').textContent = formatRelative(timestamp);
}

function mount() {
  const main = document.querySelector('#main');
  if (!isOverview(main)) {
    lastOverviewSignature = '';
    return;
  }

  const hero = main.querySelector('.hero.card');
  const signature = `${hero.textContent}|${main.querySelector('.metrics')?.textContent || ''}`;
  let row = main.querySelector('#overviewUpdatedRow');

  if (!row) {
    const timestamp = Date.now();
    localStorage.setItem(stampKey, String(timestamp));
    row = document.createElement('div');
    row.id = 'overviewUpdatedRow';
    row.className = 'overviewUpdatedRow';
    row.innerHTML = `<div id="overviewLastUpdated" class="overviewUpdatedBadge" data-timestamp="${timestamp}" title="This is when the current Overview data finished rendering on this device."><i></i><span>Data updated <b data-relative>just now</b></span><span>•</span><time></time></div>`;
    hero.insertAdjacentElement('afterend', row);
    lastOverviewSignature = signature;
    updateText();
    return;
  }

  if (signature !== lastOverviewSignature) {
    const timestamp = Date.now();
    localStorage.setItem(stampKey, String(timestamp));
    const badge = row.querySelector('#overviewLastUpdated');
    if (badge) badge.dataset.timestamp = String(timestamp);
    lastOverviewSignature = signature;
  }
  updateText();
}

function queueMount() {
  if (observerQueued) return;
  observerQueued = true;
  requestAnimationFrame(() => {
    observerQueued = false;
    mount();
  });
}

ensureStyles();
new MutationObserver(queueMount).observe(document.querySelector('#app') || document.body, { childList: true, subtree: true });
setInterval(updateText, 30000);
window.addEventListener('focus', updateText);
queueMount();
