(() => {
  const steps = [];
  const now = () => new Date().toLocaleTimeString();
  const add = (label, ok, detail = '') => {
    steps.push({ label, ok, detail, time: now() });
    render();
  };

  const panel = document.createElement('section');
  panel.id = 'accessDiagnostics';
  panel.setAttribute('role', 'status');
  panel.style.cssText = [
    'position:fixed','left:12px','right:12px','bottom:12px','z-index:2147483647',
    'max-height:46vh','overflow:auto','padding:12px','border-radius:14px',
    'background:rgba(5,10,18,.96)','border:1px solid rgba(255,255,255,.22)',
    'box-shadow:0 18px 60px rgba(0,0,0,.55)','color:#f8fafc',
    'font:12px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'
  ].join(';');

  const render = () => {
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
        <strong style="font-size:13px;letter-spacing:.08em">ACCESS DIAGNOSTICS</strong>
        <button id="closeAccessDiagnostics" style="border:1px solid rgba(255,255,255,.2);background:#172033;color:#fff;border-radius:8px;padding:5px 9px">Hide</button>
      </div>
      ${steps.map(s => `<div style="display:grid;grid-template-columns:20px 1fr;gap:6px;padding:5px 0;border-top:1px solid rgba(255,255,255,.08)"><span>${s.ok ? '✅' : '❌'}</span><div><b>${s.label}</b>${s.detail ? `<div style="color:${s.ok ? '#a7f3d0' : '#fca5a5'};word-break:break-word">${String(s.detail).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>` : ''}<small style="color:#64748b">${s.time}</small></div></div>`).join('')}
    `;
    panel.querySelector('#closeAccessDiagnostics')?.addEventListener('click', () => panel.remove());
  };

  const mount = () => {
    if (!document.body.contains(panel)) document.body.appendChild(panel);
    add('Diagnostics script loaded', true, location.href);
  };

  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });

  window.addEventListener('error', event => {
    add('JavaScript error', false, `${event.message || 'Unknown error'}${event.filename ? ` — ${event.filename}:${event.lineno || 0}` : ''}`);
  });
  window.addEventListener('unhandledrejection', event => {
    add('Unhandled promise rejection', false, event.reason?.message || String(event.reason || 'Unknown rejection'));
  });

  setTimeout(() => add('App shell rendered', !!document.querySelector('#app')?.children.length, document.querySelector('#app')?.children.length ? 'App content detected' : '#app is still empty'), 1200);
  setTimeout(() => add('Navigation detected', !!document.querySelector('#nav'), document.querySelector('#nav') ? '#nav found' : '#nav not found'), 1800);
  setTimeout(() => add('Access bootstrap loaded', !!document.querySelector('#accessOwnerButton,#accessBootstrapButton,[data-access-bootstrap]'), document.querySelector('#accessOwnerButton,#accessBootstrapButton,[data-access-bootstrap]') ? 'Access control element found' : 'No access control element found'), 2200);

  import('./supabase.js').then(async mod => {
    add('Supabase module imported', !!mod.supabase, mod.supabase ? 'Client available' : 'No exported client');
    if (!mod.supabase) return;
    const { data, error } = await mod.supabase.auth.getSession();
    if (error) {
      add('Supabase session read', false, error.message);
      return;
    }
    const session = data?.session;
    add('Authenticated session', !!session, session ? session.user.email || session.user.id : 'No active session');
    if (!session) return;
    const profile = await mod.supabase.from('user_profiles').select('user_id,role,display_name').eq('user_id', session.user.id).maybeSingle();
    add('Profile query', !profile.error, profile.error ? profile.error.message : `Role: ${profile.data?.role || 'missing'} | Name: ${profile.data?.display_name || 'none'}`);
    const flags = await mod.supabase.from('feature_flags').select('id',{count:'exact',head:true});
    add('Feature flags query', !flags.error, flags.error ? flags.error.message : `${flags.count ?? 0} feature flags accessible`);
  }).catch(error => add('Supabase module import', false, error.message || String(error)));
})();
