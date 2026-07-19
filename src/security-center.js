import { supabase } from './supabase.js';

const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[ch]));

let session = null;
let profile = { role: 'rider', display_name: '' };
let currentLevel = null;
let nextLevel = null;
let factors = [];
let pendingEnrollment = null;
let recoveryMode = false;
let refreshing = null;
let localFailedAttempts = 0;

const isAdmin = () => ['admin', 'owner'].includes(profile.role);
const hasAal2 = () => currentLevel === 'aal2';
const verifiedTotp = () => factors.find(factor => factor.factor_type === 'totp' && factor.status === 'verified');
const strongPassword = password => password.length >= 14
  && /[a-z]/.test(password)
  && /[A-Z]/.test(password)
  && /\d/.test(password)
  && /[^A-Za-z0-9]/.test(password);

function toast(message) {
  const node = $('#toast');
  if (node) {
    node.textContent = message;
    node.classList.add('show');
    setTimeout(() => node.classList.remove('show'), 2600);
  } else {
    console.info(message);
  }
}

async function refreshSecurityState(force = false) {
  if (refreshing && !force) return refreshing;
  refreshing = (async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    session = sessionData.session;
    if (!session) {
      profile = { role: 'rider', display_name: '' };
      currentLevel = null;
      nextLevel = null;
      factors = [];
      return;
    }
    const [profileResult, assuranceResult, factorResult] = await Promise.all([
      supabase.from('user_profiles').select('user_id,display_name,role').eq('user_id', session.user.id).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    if (profileResult.data) profile = profileResult.data;
    currentLevel = assuranceResult.data?.currentLevel || 'aal1';
    nextLevel = assuranceResult.data?.nextLevel || currentLevel;
    const factorData = factorResult.data || {};
    factors = factorData.all || [...(factorData.totp || []), ...(factorData.phone || [])];
  })();
  try {
    await refreshing;
  } finally {
    refreshing = null;
  }
}

function securityNavGroup() {
  const nav = $('#nav');
  if (!nav || !session) return null;
  let group = $('#securityCenterGroup');
  if (!group) {
    group = document.createElement('div');
    group.id = 'securityCenterGroup';
    group.className = 'navGroup securityCenterGroup';
    group.innerHTML = '<div class="navLabel">ACCOUNT SECURITY</div><button id="securityCenterNav"><span class="navIcon">🔐</span><span>Security & MFA</span><em></em></button>';
    const footer = nav.querySelector('.navFooter');
    footer ? nav.insertBefore(group, footer) : nav.appendChild(group);
  }
  const badge = group.querySelector('em');
  if (badge) badge.textContent = verifiedTotp() ? (hasAal2() ? 'AAL2' : 'VERIFY') : 'SETUP';
  group.querySelector('#securityCenterNav').onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    void openSecurityCenter();
  };
  return group;
}

function hardenAuthForm() {
  const form = $('#auth');
  if (!form || form.dataset.securityHardened === '1') return;
  form.dataset.securityHardened = '1';
  form.querySelector('[value="signup"]')?.remove();
  const password = form.querySelector('input[name="password"]');
  if (password) {
    password.autocomplete = 'current-password';
    password.maxLength = 256;
  }
  const signIn = form.querySelector('[value="signin"]');
  if (signIn) signIn.textContent = 'Sign in securely';
  const notice = document.createElement('div');
  notice.className = 'secureAuthNotice';
  notice.innerHTML = '<strong>Invite-only access</strong><span>Email verification is required. Repeated password failures are locked by the authentication service.</span><button type="button" id="secureRecover">Forgot password?</button>';
  form.after(notice);

  form.onsubmit = async event => {
    event.preventDefault();
    const message = $('#msg');
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim().toLowerCase();
    const suppliedPassword = String(data.get('password') || '');
    const submit = form.querySelector('button[type="submit"],button[value="signin"]');
    if (!email || !suppliedPassword) return;
    if (localFailedAttempts >= 5) {
      if (message) message.textContent = 'Too many local attempts. Close and reopen the app, or wait for the server lockout to expire.';
      return;
    }
    if (submit) submit.disabled = true;
    if (message) message.textContent = 'Verifying…';
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password: suppliedPassword });
    if (submit) submit.disabled = false;
    if (error || !authData.user?.email_confirmed_at || authData.user?.is_anonymous) {
      localFailedAttempts += 1;
      if (authData.session) await supabase.auth.signOut();
      if (message) message.textContent = error?.status === 429
        ? 'Too many sign-in attempts. Try again later.'
        : 'Unable to sign in with those credentials.';
      return;
    }
    localFailedAttempts = 0;
    if (message) message.textContent = 'Success';
  };

  notice.querySelector('#secureRecover').onclick = async () => {
    const email = String(form.querySelector('input[name="email"]')?.value || '').trim().toLowerCase();
    if (!email) {
      if ($('#msg')) $('#msg').textContent = 'Enter your email address first.';
      return;
    }
    notice.querySelector('#secureRecover').disabled = true;
    await supabase.functions.invoke('auth-recover', { body: { email } });
    notice.querySelector('#secureRecover').disabled = false;
    if ($('#msg')) $('#msg').textContent = 'If that verified account exists, a recovery email has been requested.';
  };
}

async function requireAal2() {
  await refreshSecurityState(true);
  if (hasAal2()) return true;
  await openSecurityCenter();
  toast(verifiedTotp() ? 'Enter your authenticator code to unlock administration.' : 'Set up MFA to unlock administration.');
  return false;
}

function statusMarkup() {
  const confirmed = !!session?.user?.email_confirmed_at;
  return `<div class="securityMetrics">
    <article><small>EMAIL</small><strong>${confirmed ? 'VERIFIED' : 'BLOCKED'}</strong><span>${esc(session?.user?.email || '')}</span></article>
    <article><small>ACCOUNT ROLE</small><strong>${esc(profile.role.toUpperCase())}</strong><span>Database-enforced</span></article>
    <article><small>SESSION</small><strong>${esc((currentLevel || 'aal1').toUpperCase())}</strong><span>${hasAal2() ? 'Admin unlocked' : 'Standard access'}</span></article>
    <article><small>TOTP MFA</small><strong>${verifiedTotp() ? 'ENROLLED' : 'REQUIRED'}</strong><span>${verifiedTotp() ? 'Authenticator linked' : 'Not configured'}</span></article>
  </div>`;
}

function mfaMarkup() {
  const factor = verifiedTotp();
  if (pendingEnrollment) {
    const qr = pendingEnrollment.totp?.qr_code || '';
    const secret = pendingEnrollment.totp?.secret || '';
    return `<article class="securityCard securityMfaCard"><header><div><small>MULTI-FACTOR AUTHENTICATION</small><h3>Scan the setup code</h3></div><span class="securityPill warning">PENDING</span></header>
      <p>Scan this code with 1Password, Google Authenticator, Microsoft Authenticator, or another TOTP application.</p>
      <div class="securityQr">${qr ? `<img src="${esc(qr)}" alt="TOTP setup QR code">` : ''}<code>${esc(secret)}</code></div>
      <form id="verifyEnrollment" class="securityInlineForm"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6-digit code" required><button class="primary">Verify and enable</button></form>
      <button type="button" class="securityTextButton" id="cancelEnrollment">Cancel enrollment</button></article>`;
  }
  if (!factor) {
    return `<article class="securityCard securityMfaCard"><header><div><small>MULTI-FACTOR AUTHENTICATION</small><h3>Administrator MFA required</h3></div><span class="securityPill danger">LOCKED</span></header>
      <p>Administrative reads and writes are denied by PostgreSQL until this account completes a recent TOTP challenge.</p>
      <button type="button" class="primary" id="startMfaEnrollment">Set up authenticator</button></article>`;
  }
  if (!hasAal2()) {
    return `<article class="securityCard securityMfaCard"><header><div><small>MULTI-FACTOR AUTHENTICATION</small><h3>Verify this session</h3></div><span class="securityPill warning">AAL1</span></header>
      <p>Your authenticator is enrolled. Enter a current code to unlock administrative functions for this session.</p>
      <form id="verifyExistingFactor" class="securityInlineForm"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6-digit code" required><button class="primary">Unlock administration</button></form></article>`;
  }
  return `<article class="securityCard securityMfaCard"><header><div><small>MULTI-FACTOR AUTHENTICATION</small><h3>Administrator verified</h3></div><span class="securityPill success">AAL2</span></header>
    <p>This session has recently completed TOTP verification. Sensitive database policies and administrative RPCs are available.</p>
    <button type="button" class="securityTextButton danger" id="removeMfaFactor">Remove authenticator</button></article>`;
}

function passwordMarkup() {
  const canSkipCurrent = recoveryMode || !!session?.user?.invited_at;
  return `<article class="securityCard"><header><div><small>PASSWORD SECURITY</small><h3>${canSkipCurrent ? 'Set a strong password' : 'Change password'}</h3></div><span class="securityPill">14+ CHARACTERS</span></header>
    <p>Passwords must contain uppercase, lowercase, numeric, and symbol characters. Other sessions are revoked after a successful change.</p>
    <form id="securePasswordForm" class="securityForm">
      ${canSkipCurrent ? '' : '<label>Current password<input name="current" type="password" autocomplete="current-password" required></label>'}
      <label>New password<input name="next" type="password" autocomplete="new-password" minlength="14" maxlength="128" required></label>
      <label>Confirm new password<input name="confirm" type="password" autocomplete="new-password" minlength="14" maxlength="128" required></label>
      <button class="primary">Save secure password</button><p class="securityFormMessage"></p>
    </form></article>`;
}

function adminMarkup() {
  if (!isAdmin()) return '';
  if (!hasAal2()) return `<article class="securityCard"><header><div><small>ADMINISTRATION</small><h3>Privileged controls locked</h3></div><span class="securityPill danger">MFA REQUIRED</span></header><p>Complete the authenticator challenge above before inviting users, changing roles, or modifying releases.</p></article>`;
  return `<article class="securityCard"><header><div><small>INVITE-ONLY ACCESS</small><h3>Invite a verified user</h3></div><span class="securityPill success">AUDITED</span></header>
    <p>The invitation expires after seven days. New account creation is rejected unless an active invitation exists.</p>
    <form id="secureInviteForm" class="securityInlineForm"><input name="email" type="email" autocomplete="off" placeholder="user@example.com" required><button class="primary">Send invitation</button></form>
    <p class="securityInviteMessage"></p></article>
    <article class="securityCard"><header><div><small>ACTIVE SESSIONS</small><h3>Session controls</h3></div></header><button type="button" class="securityTextButton danger" id="signOutOtherSessions">Sign out all other sessions</button></article>
    <article class="securityCard securityAudit"><header><div><small>ADMIN AUDIT</small><h3>Recent privileged events</h3></div><button type="button" id="refreshAudit">Refresh</button></header><div id="securityAuditRows"><p>Loading…</p></div></article>`;
}

async function openSecurityCenter() {
  await refreshSecurityState(true);
  if (!session) return;
  $('#securityCenterOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'securityCenterOverlay';
  overlay.innerHTML = `<section class="securityPanel"><header class="securityPanelHeader"><div><small>ACCOUNT PROTECTION</small><h2>Security Center</h2><p>Authentication, MFA, sessions, invitations, and administrator audit controls.</p></div><button id="closeSecurityCenter" aria-label="Close">×</button></header><div class="securityPanelBody">${statusMarkup()}<div class="securityGrid">${mfaMarkup()}${passwordMarkup()}${adminMarkup()}</div></div></section>`;
  document.body.appendChild(overlay);
  document.body.classList.add('securityCenterOpen');
  overlay.querySelector('#closeSecurityCenter').onclick = closeSecurityCenter;
  overlay.addEventListener('click', event => { if (event.target === overlay) closeSecurityCenter(); });
  bindSecurityPanel();
  if (hasAal2() && isAdmin()) void loadAudit();
}

function closeSecurityCenter() {
  $('#securityCenterOverlay')?.remove();
  document.body.classList.remove('securityCenterOpen');
}

async function verifyFactor(factorId, code, button) {
  if (!/^\d{6}$/.test(code)) return toast('Enter a valid six-digit code.');
  button.disabled = true;
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  button.disabled = false;
  if (error) return toast('Authenticator verification failed.');
  pendingEnrollment = null;
  await supabase.auth.refreshSession();
  await refreshSecurityState(true);
  toast('MFA verified. Administrative access is unlocked.');
  await openSecurityCenter();
}

function bindSecurityPanel() {
  $('#startMfaEnrollment')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Moto Mission' });
    event.currentTarget.disabled = false;
    if (error || !data) return toast(error?.message || 'Unable to start MFA enrollment.');
    pendingEnrollment = data;
    await openSecurityCenter();
  });
  $('#verifyEnrollment')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void verifyFactor(pendingEnrollment?.id, String(data.get('code') || ''), event.currentTarget.querySelector('button'));
  });
  $('#cancelEnrollment')?.addEventListener('click', async () => {
    if (pendingEnrollment?.id) await supabase.auth.mfa.unenroll({ factorId: pendingEnrollment.id });
    pendingEnrollment = null;
    await openSecurityCenter();
  });
  $('#verifyExistingFactor')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void verifyFactor(verifiedTotp()?.id, String(data.get('code') || ''), event.currentTarget.querySelector('button'));
  });
  $('#removeMfaFactor')?.addEventListener('click', async () => {
    if (!confirm('Removing MFA immediately locks all administrator controls. Continue?')) return;
    const factor = verifiedTotp();
    if (!factor) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) return toast(error.message);
    await supabase.auth.refreshSession();
    await refreshSecurityState(true);
    toast('Authenticator removed. Administrative access is locked.');
    await openSecurityCenter();
  });
  $('#securePasswordForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('.securityFormMessage');
    const data = new FormData(form);
    const current = String(data.get('current') || '');
    const next = String(data.get('next') || '');
    const confirmation = String(data.get('confirm') || '');
    if (next !== confirmation) { message.textContent = 'The new passwords do not match.'; return; }
    if (!strongPassword(next)) { message.textContent = 'Use at least 14 characters with uppercase, lowercase, a number, and a symbol.'; return; }
    const submit = form.querySelector('button');
    submit.disabled = true;
    if (!recoveryMode && !session.user.invited_at) {
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email: session.user.email, password: current });
      if (reauthError) { submit.disabled = false; message.textContent = 'Current password verification failed.'; return; }
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (!error) await supabase.auth.signOut({ scope: 'others' });
    submit.disabled = false;
    if (error) { message.textContent = error.message; return; }
    recoveryMode = false;
    message.textContent = 'Password changed and other sessions revoked.';
    form.reset();
  });
  $('#secureInviteForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get('email') || '').trim().toLowerCase();
    const message = $('.securityInviteMessage');
    const button = form.querySelector('button');
    button.disabled = true;
    const { data, error } = await supabase.functions.invoke('admin-invite-user', { body: { email } });
    button.disabled = false;
    if (error || data?.error) { message.textContent = data?.error || 'Unable to send invitation.'; return; }
    message.textContent = 'Invitation sent. The account must verify its email before accessing data.';
    form.reset();
  });
  $('#signOutOtherSessions')?.addEventListener('click', async () => {
    await supabase.auth.signOut({ scope: 'others' });
    toast('Other sessions have been revoked.');
  });
  $('#refreshAudit')?.addEventListener('click', () => void loadAudit());
}

async function loadAudit() {
  const node = $('#securityAuditRows');
  if (!node || !hasAal2()) return;
  const { data, error } = await supabase.from('admin_audit_log').select('id,action,target_type,target_id,details,created_at').order('created_at', { ascending: false }).limit(25);
  if (error) { node.innerHTML = `<p>${esc(error.message)}</p>`; return; }
  node.innerHTML = (data || []).map(row => `<article><div><strong>${esc(row.action.replaceAll('_', ' '))}</strong><span>${esc(row.target_type || '')} ${esc(row.target_id || '')}</span></div><time>${esc(new Date(row.created_at).toLocaleString())}</time></article>`).join('') || '<p>No privileged changes recorded yet.</p>';
}

function bindAdminMutations() {
  $$('[data-user-role],[data-profile-role]').forEach(select => {
    if (select.dataset.secureAdminBound === '1') return;
    select.dataset.secureAdminBound = '1';
    select.onchange = async () => {
      if (!(await requireAal2())) return;
      const target = select.dataset.userRole || select.dataset.profileRole;
      const { error } = await supabase.rpc('admin_set_user_role', { target_user_id: target, new_role: select.value });
      if (error) { toast(error.message); return; }
      toast('User role updated and audited.');
      await refreshSecurityState(true);
    };
  });
  $$('[data-feature-enabled],[data-feature-stage],[data-feature-role]').forEach(control => {
    if (control.dataset.secureAdminBound === '1') return;
    control.dataset.secureAdminBound = '1';
    control.onchange = async () => {
      if (!(await requireAal2())) return;
      const id = control.dataset.featureEnabled || control.dataset.featureStage || control.dataset.featureRole;
      const changes = control.dataset.featureEnabled ? { enabled: control.checked }
        : control.dataset.featureStage ? { release_stage: control.value }
          : { minimum_role: control.value };
      const { error } = await supabase.rpc('admin_update_feature_flag', { target_feature_id: id, changes });
      if (error) return toast(error.message);
      toast('Feature control updated and audited.');
    };
  });
  $$('[data-grant-user]').forEach(control => {
    if (control.dataset.secureAdminBound === '1') return;
    control.dataset.secureAdminBound = '1';
    control.onchange = async () => {
      if (!(await requireAal2())) return;
      const { error } = await supabase.rpc('admin_set_feature_grant', {
        target_user_id: control.dataset.grantUser,
        target_feature_id: control.dataset.grantFeature,
        is_enabled: control.checked,
      });
      if (error) return toast(error.message);
      toast('Feature grant updated and audited.');
    };
  });
}

function secureAdminNavigation(event) {
  const target = event.target.closest?.('#accessBootstrapGroup button,.accessAdminGroup button,#rolePreviewNav,#userMetricsNav,#releaseManagerNav,#userAccessNav');
  if (!target || target.id === 'securityCenterNav' || hasAal2()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openSecurityCenter();
}

async function syncUi() {
  hardenAuthForm();
  if (!session) {
    $('#securityCenterGroup')?.remove();
    return;
  }
  securityNavGroup();
  bindAdminMutations();
}

const observer = new MutationObserver(() => queueMicrotask(syncUi));
observer.observe($('#app') || document.body, { childList: true, subtree: true });
document.addEventListener('click', secureAdminNavigation, true);
supabase.auth.onAuthStateChange((event, nextSession) => {
  session = nextSession;
  recoveryMode = event === 'PASSWORD_RECOVERY' || recoveryMode;
  if (nextSession?.user && (!nextSession.user.email_confirmed_at || nextSession.user.is_anonymous)) {
    void supabase.auth.signOut();
    return;
  }
  setTimeout(async () => {
    await refreshSecurityState(true);
    await syncUi();
    if (event === 'PASSWORD_RECOVERY') await openSecurityCenter();
  }, 0);
});

await refreshSecurityState(true);
await syncUi();
window.MotoSecurityCenter = { open: openSecurityCenter, refresh: () => refreshSecurityState(true) };
