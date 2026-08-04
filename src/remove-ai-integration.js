import { supabase } from './supabase.js';

// Moto Mission no longer exposes or contacts the former ChatGPT / AI assistant.
// This module loads before main.js so AI tables and endpoints are disabled before
// the application begins loading data.
(() => {
  if (window.__motoAIIntegrationRemoved) return;
  window.__motoAIIntegrationRemoved = true;
  document.documentElement.dataset.aiIntegration = 'removed';

  const AI_TABLES = new Set(['ai_messages', 'ai_change_proposals']);
  const AI_URL = /(?:\/api\/(?:ai|openai|chatgpt)(?:\/|\?|$)|api\.openai\.com|chatgpt\.com\/backend-api)/i;
  const REMOVED_ERROR = Object.freeze({
    message: 'The ChatGPT integration has been removed from Moto Mission.',
    code: 'AI_INTEGRATION_REMOVED'
  });

  function disabledQuery() {
    let writeAttempt = false;
    const target = {
      select() { return proxy; },
      order() { return proxy; },
      limit() { return proxy; },
      range() { return proxy; },
      eq() { return proxy; },
      neq() { return proxy; },
      in() { return proxy; },
      is() { return proxy; },
      not() { return proxy; },
      gte() { return proxy; },
      lte() { return proxy; },
      contains() { return proxy; },
      single() { return proxy; },
      maybeSingle() { return proxy; },
      insert() { writeAttempt = true; return proxy; },
      upsert() { writeAttempt = true; return proxy; },
      update() { writeAttempt = true; return proxy; },
      delete() { writeAttempt = true; return proxy; },
      then(resolve, reject) {
        return Promise.resolve(writeAttempt
          ? { data: null, error: REMOVED_ERROR }
          : { data: [], error: null, count: 0 }
        ).then(resolve, reject);
      }
    };
    const proxy = new Proxy(target, {
      get(object, property) {
        if (property in object) return object[property];
        return () => proxy;
      }
    });
    return proxy;
  }

  try {
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = table => AI_TABLES.has(String(table)) ? disabledQuery() : originalFrom(table);
  } catch (error) {
    console.warn('AI table guard could not replace the Supabase accessor.', error);
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (AI_URL.test(url)) return Promise.reject(new DOMException(REMOVED_ERROR.message, 'NotSupportedError'));
    return nativeFetch(input, init);
  };

  function removeAIInterface() {
    document.querySelectorAll('[data-v="ai"],#aiPanel,#aiAssistant,#aiChat,#aiComposer,[data-ai-assistant]').forEach(node => node.remove());
    document.querySelectorAll('button,a,[role="button"]').forEach(node => {
      const label = `${node.textContent || ''} ${node.getAttribute('aria-label') || ''}`.trim();
      if (/^(?:✦\s*)?(?:AI Assistant|ChatGPT)$/i.test(label)) node.remove();
    });
    document.querySelectorAll('#nav .navGroup').forEach(group => {
      if (!group.querySelector('[data-v],button,a')) group.remove();
    });

    const main = document.querySelector('#main');
    const activeAI = document.querySelector('[data-v="ai"].active') ||
      (main && /AI ASSISTANT|CHATGPT/i.test(main.textContent || '') ? main : null);
    if (activeAI) document.querySelector('[data-v="dashboard"]')?.click();
  }

  document.addEventListener('click', event => {
    const aiControl = event.target.closest?.('[data-v="ai"],[data-ai-assistant]');
    if (!aiControl) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.querySelector('[data-v="dashboard"]')?.click();
  }, true);

  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && /(?:chatgpt|openai|moto-ai|ai-assistant)/i.test(key)) localStorage.removeItem(key);
    }
  } catch {}

  const root = document.querySelector('#app') || document.body;
  const observer = new MutationObserver(() => queueMicrotask(removeAIInterface));
  observer.observe(root, { childList: true, subtree: true });
  queueMicrotask(removeAIInterface);

  window.MotoAIIntegration = Object.freeze({
    enabled: false,
    removed: true,
    reason: 'Removed by project owner',
    blockedTables: [...AI_TABLES]
  });
})();