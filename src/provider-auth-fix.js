import { supabase } from './supabase.js';

const nativeFetch = window.fetch.bind(window);
const providerKey = 'motoRoadProvider';

// Paid road providers require a live Supabase JWT. Some iOS/PWA navigation
// paths were reaching /api/road-info before the session token was attached.
window.fetch = async function motoProviderFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || '';
  if (!url.includes('/api/road-info')) return nativeFetch(input, init);

  let session = (await supabase.auth.getSession()).data.session;
  if (!session?.access_token) {
    session = (await supabase.auth.refreshSession()).data.session;
  }

  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
  headers.set('Accept', 'application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  return nativeFetch(input, { ...init, headers, cache: 'no-store' });
};

// Keep automatic provider selection active unless the rider explicitly changes it.
if (!localStorage.getItem(providerKey) || localStorage.getItem(providerKey) === 'osm') {
  localStorage.setItem(providerKey, 'auto');
}

function syncProviderSelector() {
  const select = document.querySelector('#safeRoadProvider');
  if (!select || select.dataset.providerAuthFixed) return;
  select.dataset.providerAuthFixed = '1';
  select.value = localStorage.getItem(providerKey) || 'auto';
  select.addEventListener('change', () => localStorage.setItem(providerKey, select.value));
}

new MutationObserver(syncProviderSelector).observe(document.body, { childList: true, subtree: true });
syncProviderSelector();
