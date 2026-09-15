import './overview-last-updated.js';
import { supabase } from './supabase.js';

const nativeFetch = window.fetch.bind(window);
const providerKey = 'motoRoadProvider';

window.fetch = async function motoProviderFetch(input, init = {}) {
  const originalUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
  let url;
  try { url = new URL(originalUrl, location.href); } catch { return nativeFetch(input, init); }
  if (url.origin !== location.origin || !['/api/road-info', '/api/road-info-live'].includes(url.pathname)) return nativeFetch(input, init);

  let session = (await supabase.auth.getSession()).data.session;
  if (!session?.access_token) session = (await supabase.auth.refreshSession()).data.session;

  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
  headers.set('Accept', 'application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  url.pathname = '/api/road-info-live';
  const request = input instanceof Request ? new Request(url, input) : url;
  const response = await nativeFetch(request, { ...init, headers, cache: 'no-store' });
  if (!response.ok) return response;

  try {
    const data = await response.clone().json();
    if (data?.providerUsed && !data?.usage && session?.user) {
      const { data: usage, error } = await supabase.rpc('consume_road_api_request', { p_provider: data.providerUsed });
      if (!error) {
        data.usage = Array.isArray(usage) ? usage[0] : usage;
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
        });
      }
    }
  } catch (error) {
    console.warn('Provider usage counter fallback skipped', error);
  }

  return response;
};

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
