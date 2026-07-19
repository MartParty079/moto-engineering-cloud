# Moto Mission Security Controls

## Enforced in the database and application

- Account creation is invite-only through an `auth.users` trigger.
- All exposed public tables have RLS and FORCE RLS enabled.
- All public-table and storage policies target `authenticated`, not `public`.
- A restrictive verified, non-anonymous account policy applies to every exposed table and storage object.
- Administrator and owner privileges are stored in the protected `private.admin_principals` registry.
- Privileged reads and writes require a recent TOTP-backed `aal2` session.
- Role, feature-release, feature-grant, and invitation changes are audited.
- AI functions require verified JWTs, restricted origins, bounded input, and per-user limits.
- Password recovery uses generic responses and IP/email limits.
- The app exposes no public signup action.

## Hosted Supabase Auth settings to activate

These controls are not stored in PostgreSQL migrations and require the Supabase Auth dashboard:

1. Enable **Password Verification Hook** and select `private.hook_password_verification_attempt`.
2. Enable **MFA Verification Hook** and select `private.hook_mfa_verification_attempt`.
3. Set password minimum length to **14** and require uppercase, lowercase, numbers, and symbols.
4. Enable leaked-password protection when the project plan supports it.
5. Configure Cloudflare Turnstile or hCaptcha for sign-in and recovery.
6. Keep email confirmation enabled and configure production custom SMTP.
7. Restrict Site URL and Redirect URLs to the production application and approved preview domains.

The installed password hook enforces five failed attempts per 15 minutes with a 30-minute lock and ten failures per day with a 24-hour lock once activated.

## Vercel firewall

The current connector cannot mutate firewall rules. In Vercel Firewall, add strict rate limits for authentication-facing application paths, challenge suspicious traffic, and deny common scanner paths. Direct browser traffic to Supabase remains protected by Auth limits, hooks, Edge Function limits, and RLS rather than Vercel.
