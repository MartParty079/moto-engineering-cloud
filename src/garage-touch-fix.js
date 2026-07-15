/* Restore taps when an invisible fixed layer is left above the Garage view. */
const SELECTOR = '#garageIntelligence, #garageServiceModal';

function isVisible(el, style) {
  if (!el || style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function coversGarage(el, garageRect) {
  const r = el.getBoundingClientRect();
  const overlapW = Math.max(0, Math.min(r.right, garageRect.right) - Math.max(r.left, garageRect.left));
  const overlapH = Math.max(0, Math.min(r.bottom, garageRect.bottom) - Math.max(r.top, garageRect.top));
  return overlapW * overlapH > Math.min(garageRect.width * garageRect.height * 0.45, 90000);
}

function disableInvisibleBlockers() {
  const garage = document.querySelector('#garageIntelligence');
  if (!garage) return;
  const garageRect = garage.getBoundingClientRect();
  const protectedNodes = new Set([...document.querySelectorAll(SELECTOR)]);

  document.querySelectorAll('body *').forEach(el => {
    if ([...protectedNodes].some(node => node === el || node.contains(el))) return;
    const style = getComputedStyle(el);
    if (!isVisible(el, style) || style.pointerEvents === 'none') return;
    if (style.position !== 'fixed' && style.position !== 'absolute') return;
    if (!coversGarage(el, garageRect)) return;

    const opacity = Number.parseFloat(style.opacity || '1');
    const transparent = opacity <= 0.03 || style.backgroundColor === 'rgba(0, 0, 0, 0)';
    const empty = !(el.textContent || '').trim() && !el.querySelector('button,input,a,summary,[role="button"]');
    if (transparent && empty) {
      el.dataset.garageTouchBlocker = 'disabled';
      el.style.setProperty('pointer-events', 'none', 'important');
    }
  });
}

function hardenGarageControls() {
  document.querySelectorAll('#garageIntelligence button,#garageIntelligence summary,#garageServiceModal button,#garageServiceModal input').forEach(el => {
    el.style.setProperty('pointer-events', 'auto', 'important');
    el.style.touchAction = el.matches('input') ? 'auto' : 'manipulation';
  });
}

let scheduled = false;
function scheduleRepair() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    disableInvisibleBlockers();
    hardenGarageControls();
  });
}

new MutationObserver(scheduleRepair).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style','hidden'] });
window.addEventListener('pageshow', scheduleRepair);
window.addEventListener('focus', scheduleRepair);
document.addEventListener('touchstart', scheduleRepair, { passive: true, capture: true });
document.addEventListener('pointerdown', scheduleRepair, { passive: true, capture: true });
scheduleRepair();
