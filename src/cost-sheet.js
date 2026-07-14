import { supabase } from './supabase.js';

const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadParts() {
  const { data, error } = await supabase.from('parts').select('*').order('source_id');
  if (error) throw error;
  return data || [];
}

function exportCsv(rows) {
  const quote = value => /[",\n]/.test(String(value ?? '')) ? `"${String(value).replaceAll('"', '""')}"` : value ?? '';
  const header = ['ID', 'Component', 'System', 'Qty', 'Unit Cost', 'Extended', 'Owned', 'Installed', 'Status', 'URL'];
  const body = rows.map(row => [
    row.source_id,
    row.part,
    row.system,
    row.qty,
    row.unit_cost,
    (Number(row.qty) || 0) * (Number(row.unit_cost) || 0),
    row.owned ? 'Yes' : 'No',
    row.installed ? 'Yes' : 'No',
    row.status,
    row.source_url
  ]);
  download('CRF450RL_Running_Cost_Sheet.csv', [header, ...body].map(row => row.map(quote).join(',')).join('\n'), 'text/csv');
}

function exportGuide(rows) {
  const total = rows.reduce((sum, row) => sum + (Number(row.unit_cost) || 0) * (Number(row.qty) || 0), 0);
  const items = rows.map((row, index) => `<h2>${index + 1}. ${esc(row.part)}</h2><table><tr><td class="icon">■</td><td><p><b>Role:</b> ${esc(row.specification || 'Not documented')}</p><p><b>Note:</b> ${esc(row.notes || '—')}</p><p><b>Price:</b> ${row.unit_cost ? money(row.unit_cost) : 'Enter live price'}</p>${row.source_url ? `<p><b>Link:</b> <a href="${esc(row.source_url)}">${esc(row.source_url)}</a></p>` : ''}</td></tr></table>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:10pt Arial;color:#17303d;margin:.55in}h1{text-align:center;color:#0b5068}h2{color:#175d72}table{width:100%;border-collapse:collapse;page-break-inside:avoid}td{border:1px solid #ccd8de;padding:10px}.icon{width:75px;text-align:center;font-size:40pt;color:#175d72;background:#f3f7f8}.summary{background:#eaf4f7;padding:12px}</style></head><body><h1>CRF450RL Data Logger<br><small>Component Guide and Cost Baseline</small></h1><div class="summary"><b>Known subtotal:</b> ${money(total)}</div>${items}</body></html>`;
  download('CRF450RL_Data_Logger_Component_Guide.doc', `\ufeff${html}`, 'application/msword');
}

function installStyles() {
  if ($('#costSheetStyles')) return;
  const style = document.createElement('style');
  style.id = 'costSheetStyles';
  style.textContent = `.costSheet{margin:0 0 16px}.costTop,.costActions,.docCard{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.costActions{justify-content:flex-end}.costMetrics{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px;margin:14px 0}.costMetrics div{background:rgba(9,44,64,.55);border:1px solid rgba(126,153,170,.24);border-radius:12px;padding:11px}.costMetrics span{display:block;color:#8fa9b9;font-size:11px;text-transform:uppercase}.costMetrics b{font-size:20px}.costTableWrap{overflow:auto;border:1px solid rgba(126,153,170,.22);border-radius:12px}.costTable{border-collapse:collapse;width:100%;min-width:930px}.costTable th,.costTable td{padding:8px;border-bottom:1px solid rgba(126,153,170,.16);text-align:left}.costTable th{background:#102a3a;color:#a9c0ce}.costTable input[type=number]{width:80px}.costMessage{min-height:18px;color:#69d5a4}@media(max-width:800px){.costMetrics{grid-template-columns:repeat(2,1fr)}}`;
  document.head.appendChild(style);
}

async function renderCostSheet(host) {
  if (!host) return;
  try {
    const rows = await loadParts();
    const planned = rows.reduce((sum, row) => sum + (Number(row.qty) || 0) * (Number(row.unit_cost) || 0), 0);
    const purchased = rows.filter(row => row.owned).reduce((sum, row) => sum + (Number(row.qty) || 0) * (Number(row.unit_cost) || 0), 0);
    const installed = rows.filter(row => row.installed).reduce((sum, row) => sum + (Number(row.qty) || 0) * (Number(row.unit_cost) || 0), 0);
    host.innerHTML = `<div class="costTop"><div><span class="eyebrow">LIVE PROCUREMENT CONTROL</span><h3>Running cost sheet</h3><p class="sub">Cloud-synced price, purchase, and installation tracking.</p></div><div class="costActions"><button class="secondary" id="costGuide">Word guide</button><button class="primary" id="costCsv">Export CSV</button></div></div><div class="costMetrics"><div><span>Planned</span><b>${money(planned)}</b></div><div><span>Purchased</span><b>${money(purchased)}</b></div><div><span>Remaining</span><b>${money(Math.max(0, planned - purchased))}</b></div><div><span>Installed</span><b>${money(installed)}</b></div></div><div class="costTableWrap"><table class="costTable"><thead><tr><th>Item</th><th>System</th><th>Qty</th><th>Unit</th><th>Total</th><th>Owned</th><th>Installed</th><th>Link</th></tr></thead><tbody>${rows.map(row => `<tr><td><b>${esc(row.source_id || '')} ${esc(row.part)}</b></td><td>${esc(row.system)}</td><td><input type="number" min="0" step="1" value="${Number(row.qty) || 0}" data-field="qty" data-id="${row.id}"></td><td><input type="number" min="0" step=".01" value="${Number(row.unit_cost) || 0}" data-field="unit_cost" data-id="${row.id}"></td><td><b>${money((Number(row.qty) || 0) * (Number(row.unit_cost) || 0))}</b></td><td><input type="checkbox" ${row.owned ? 'checked' : ''} data-field="owned" data-id="${row.id}"></td><td><input type="checkbox" ${row.installed ? 'checked' : ''} data-field="installed" data-id="${row.id}"></td><td>${row.source_url ? `<a class="mini" target="_blank" rel="noopener" href="${esc(row.source_url)}">Open</a>` : '—'}</td></tr>`).join('') || '<tr><td colspan="8">No parts yet.</td></tr>'}</tbody></table></div><div class="costMessage"></div>`;
    $('#costGuide').onclick = () => exportGuide(rows);
    $('#costCsv').onclick = () => exportCsv(rows);
    host.querySelectorAll('[data-field]').forEach(input => {
      input.onchange = async () => {
        const value = input.type === 'checkbox' ? input.checked : Number(input.value) || 0;
        const { error } = await supabase.from('parts').update({ [input.dataset.field]: value }).eq('id', input.dataset.id);
        if (error) host.querySelector('.costMessage').textContent = error.message;
        else renderCostSheet(host);
      };
    });
  } catch (error) {
    host.innerHTML = `<div class="empty">${esc(error.message || error)}</div>`;
  }
}

function enhance() {
  installStyles();
  const main = $('#main');
  if (!main) return;
  const eyebrow = main.querySelector('.section .eyebrow')?.textContent.trim();
  if (eyebrow === 'BOM & PROCUREMENT' && !main.querySelector('#runningCostSheet')) {
    const host = document.createElement('section');
    host.id = 'runningCostSheet';
    host.className = 'card costSheet';
    main.querySelector('.metrics')?.after(host);
    renderCostSheet(host);
  }
  if (eyebrow === 'DOCUMENT CONTROL' && !main.querySelector('#guideCard')) {
    const card = document.createElement('section');
    card.id = 'guideCard';
    card.className = 'card docCard';
    card.innerHTML = '<div><h3>CRF450RL Component Guide</h3><p class="sub">Generate the guide from the current cloud parts list.</p></div><button class="secondary">Download Word guide</button>';
    card.querySelector('button').onclick = async () => exportGuide(await loadParts());
    main.querySelector('.section')?.after(card);
  }
}

const observer = new MutationObserver(() => queueMicrotask(enhance));
observer.observe(document.documentElement, { subtree: true, childList: true });
addEventListener('DOMContentLoaded', enhance, { once: true });
setTimeout(enhance, 500);
