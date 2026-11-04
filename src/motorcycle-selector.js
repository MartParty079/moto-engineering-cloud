import './motorcycle-selector.css';

const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const controller = () => window.MotoRide;

function refreshButtons() {
  const bike = controller()?.getActiveBike?.();
  document.querySelectorAll('[data-motorcycle-selector]').forEach(button => {
    const text = bike?.name || 'Select motorcycle';
    const label = `Active motorcycle: ${bike?.name || 'none selected'}. Change motorcycle`;
    if (button.textContent !== text) button.textContent = text;
    if (button.title !== text) button.title = text;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label',label);
  });
}

export function mountMotorcycleSelector(button) {
  if (!button) return;
  button.dataset.motorcycleSelector = '';
  button.classList.add('motorcycleChip');
  button.setAttribute('aria-haspopup','dialog');
  button.onclick = () => openSelector(button);
  refreshButtons();
}

function openSelector(trigger) {
  const existing = document.querySelector('#motorcycleSelector');
  if (existing?.open) return;
  existing?.remove();
  const bikes = controller()?.getBikes?.() || [], active = controller()?.getActiveBike?.();
  const dialog = document.createElement('dialog');
  dialog.id = 'motorcycleSelector';
  dialog.className = 'motorcycleSelector';
  dialog.setAttribute('aria-labelledby','motorcycleSelectorTitle');
  dialog.innerHTML = `<header><h2 id="motorcycleSelectorTitle">Your motorcycle</h2><button type="button" data-close aria-label="Close motorcycle selector">×</button></header>
    <label>Search motorcycles<input type="search" data-search autocomplete="off"></label>
    <p data-status role="status" aria-live="polite"></p><div class="motorcycleChoices">${bikes.map(bike => `<button type="button" data-select-bike="${esc(bike.id)}" aria-pressed="${String(bike.id) === String(active?.id)}"><span>${esc(bike.name)}</span><small>${String(bike.id) === String(active?.id) ? 'Selected' : 'Select'}</small></button>`).join('')}</div>
    <p data-empty ${bikes.length ? 'hidden' : ''}>${bikes.length ? 'No matching motorcycles.' : 'No motorcycles available. Add one in Garage, or retry when your garage is available.'}</p>
    <footer><button type="button" data-garage>Garage / Add motorcycle</button><button type="button" data-ride>Ride Mode</button></footer>`;
  document.body.appendChild(dialog);
  const close = () => dialog.close();
  dialog.addEventListener('close',() => {dialog.remove();if(trigger.isConnected)trigger.focus();},{once:true});
  dialog.querySelector('[data-close]').onclick = close;
  dialog.querySelector('[data-search]').oninput = event => {
    const query = event.target.value.trim().toLocaleLowerCase();
    const choices = [...dialog.querySelectorAll('[data-select-bike]')];
    choices.forEach(button => {button.hidden = !button.textContent.toLocaleLowerCase().includes(query);});
    dialog.querySelector('[data-empty]').hidden = choices.some(button => !button.hidden);
  };
  dialog.querySelector('[data-garage]').onclick = () => {close();window.MotoRideDash?.close?.();document.querySelector('#nav [data-v="garage"]')?.click();};
  dialog.querySelector('[data-ride]').onclick = () => {close();controller()?.open?.();};
  dialog.querySelectorAll('[data-select-bike]').forEach(button => button.onclick = async () => {
    const buttons = [...dialog.querySelectorAll('button')];
    buttons.forEach(item => {item.disabled = true;});
    try {await controller().selectBike(button.dataset.selectBike);close();}
    catch(error) {dialog.querySelector('[data-status]').textContent = error.message;}
    finally {buttons.forEach(item => {item.disabled = false;});}
  });
  const ride = controller()?.getState?.();
  if (ride?.sessionId) dialog.querySelector('[data-status]').textContent = 'Your saved ride keeps its original motorcycle. Finish or recover it in Ride Mode before switching.';
  dialog.showModal();
}

window.addEventListener('moto-motorcycle-context',refreshButtons);
window.addEventListener('moto-motorcycles-reset',() => {document.querySelector('#motorcycleSelector')?.close();refreshButtons();});
window.addEventListener('moto-rides-update',refreshButtons);
