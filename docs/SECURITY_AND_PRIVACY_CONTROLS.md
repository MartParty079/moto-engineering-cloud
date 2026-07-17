# Security, Privacy, and Incident Controls

## Data inventory

Before enabling a feature, record:

- data category and exact fields
- source: user, phone, motorcycle, server, or third party
- purpose and user-visible benefit
- whether collection is required or optional
- whether data is precise location, identity, media, diagnostics, or other sensitive information
- storage location and encryption boundary
- retention and deletion behavior
- users, roles, services, and providers that can access it
- App Store privacy-label category
- user consent and control surface

Current high-sensitivity categories include precise GPS tracks, ride timestamps, motorcycle location history, photos/video/audio, account identity, emergency-profile details, and telemetry that may reveal rider behavior.

## Authorization baseline

- Every user-owned table must have RLS enabled.
- SELECT, INSERT, UPDATE, and DELETE policies must be evaluated separately.
- Ownership is determined from the authenticated server identity, not a trusted request-body `user_id`.
- Administrative functions must verify role server-side.
- Trigger functions are not directly executable by browser roles.
- Storage object paths must be namespaced by authenticated user and validated by policy.
- Public buckets must not allow broad object listing.
- Service-role credentials must never enter browser, iOS bundle, repository, logs, screenshots, or support messages.

## API baseline

All public API routes must implement, as applicable:

- allowed-method enforcement
- authentication before paid or private work
- authorization for referenced resources
- schema validation and rejection of unknown or oversized input
- bounded coordinates, ranges, pagination, file sizes, and timeouts
- per-user and per-IP abuse controls
- safe error messages without stack traces or secrets
- outbound-request allowlists and timeout/abort behavior
- structured audit events for privileged or destructive actions
- idempotency for ride upload and other retried writes

## Authentication and sessions

- Use secure platform-managed authentication rather than custom passwords.
- Enable leaked-password protection and appropriate password requirements.
- Require fresh authentication for account deletion, role changes, exports of sensitive data, and security settings.
- Provide session/device revocation.
- Avoid long-lived tokens outside platform-managed secure storage.
- Native code must store sensitive tokens only in Keychain and must not log them.

## iPhone permissions

Request permissions in context and separately. Do not request background location, photos, camera, microphone, Bluetooth, notifications, or motion access until the related feature is used. Permission text must explain the actual purpose and remain consistent with product behavior and App Store disclosures.

The app must remain usable in a reduced mode when optional permissions are denied.

## Logging and observability

Do not log access tokens, passwords, precise GPS trails, full request bodies containing personal data, uploaded media, or provider keys. Use request IDs, user IDs only where necessary, redacted coordinates for operational metrics, release identifiers, and structured severity levels.

Security-relevant events include:

- repeated failed authentication or authorization
- role or feature-access changes
- account export or deletion
- unusual provider usage
- bulk downloads or deletes
- RLS or database errors suggesting cross-user access attempts
- unexpected traffic spikes and repeated malformed requests

## Incident response

### Severity

- SEV-1: active credential compromise, cross-user data exposure, destructive attack, or safety-critical false behavior
- SEV-2: exploitable authorization weakness, sensitive-data exposure with limited scope, sustained service failure
- SEV-3: contained vulnerability, privacy defect, or degradation without confirmed exploitation
- SEV-4: low-impact defect or hardening opportunity

### Response sequence

1. Detect and record time, deployment, route, account scope, and evidence.
2. Contain using feature flags, provider shutdown, credential revocation, access-policy change, or Vercel rollback.
3. Preserve relevant logs without copying unnecessary personal data.
4. Determine affected users, data categories, time window, and attack path.
5. Eradicate the root cause and rotate exposed credentials.
6. Validate the fix in preview and test for equivalent paths.
7. Recover gradually with monitoring.
8. Document the incident, notifications, decisions, and preventive actions.

Do not hide or minimize confirmed user-data exposure. Legal notification requirements depend on facts and jurisdiction and require qualified legal review.

## Attack-resilience priorities

1. Authorization and cross-user isolation
2. Secret protection and provider-cost abuse
3. GPS/location privacy
4. destructive actions and account takeover
5. upload validation and storage abuse
6. denial-of-service and resource exhaustion
7. dependency and supply-chain compromise
8. unsafe or misleading ride information

## Required pre-demonstration controls

- invite-only access or explicit allowlist
- pre-release and safety acknowledgement
- privacy policy and terms reachable without signing in
- delete ride and sign-out controls verified
- admin tools hidden and server-blocked for normal accounts
- unfinished sharing and emergency features disabled
- provider hard caps active
- Vercel runtime errors reviewed
- Supabase security advisors reviewed
- production rollback procedure confirmed