import { supabase } from './supabase.js';

async function requireAal2() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === 'aal2') return true;
  await window.MotoSecurityCenter?.open?.();
  return false;
}

function notify(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return console.info(message);
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

document.addEventListener('change', event => {
  const control = event.target.closest?.('[data-user-role],[data-profile-role],[data-feature-enabled],[data-feature-stage],[data-feature-role],[data-grant-user]');
  if (!control) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void (async () => {
    if (!(await requireAal2())) return notify('Recent MFA verification is required.');
    let result;
    if (control.matches('[data-user-role],[data-profile-role]')) {
      result = await supabase.rpc('admin_set_user_role', {
        target_user_id: control.dataset.userRole || control.dataset.profileRole,
        new_role: control.value,
      });
    } else if (control.matches('[data-grant-user]')) {
      result = await supabase.rpc('admin_set_feature_grant', {
        target_user_id: control.dataset.grantUser,
        target_feature_id: control.dataset.grantFeature,
        is_enabled: control.checked,
      });
    } else {
      const target_feature_id = control.dataset.featureEnabled || control.dataset.featureStage || control.dataset.featureRole;
      const changes = control.dataset.featureEnabled ? { enabled: control.checked }
        : control.dataset.featureStage ? { release_stage: control.value }
          : { minimum_role: control.value };
      result = await supabase.rpc('admin_update_feature_flag', { target_feature_id, changes });
    }
    if (result.error) return notify(result.error.message);
    notify('Privileged change saved and audited.');
  })();
}, true);
