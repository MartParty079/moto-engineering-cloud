# September 2026 deployment

Branch: codex/swift-handoff-stabilization, reconciled with main at 1681bff.
Target: https://moto-engineering-cloud.vercel.app/
The user explicitly authorized deployment and requested continuation.

## Scope and sequence

Preserve the current rider app, add the clean front end and durable recovery, and deliver SWIFT_PORT_HANDOFF.txt plus generated inventory. Verify locally, apply the additive recording migration, merge via PR to main, then verify the matching Vercel production deployment.

## Schema review

Schema-only inspection on 2026-09-14 found ACTIVE_HEALTHY; bigint identity sample IDs; UUID bike/session IDs; ownership and verified-permanent-user RLS; no user triggers on these tables. The test fixture copies those contracts without user records. Migration preserves legacy inserts/policies, adds nullable markers/client IDs and an invoker completion RPC, and revokes browser TRUNCATE.

Pre-release security advisor warnings include disabled leaked-password protection and authenticated-callable SECURITY DEFINER functions. Schema-only guard review found recent admin MFA checks in the five administration functions and caller ownership predicates in provider/dispatch functions. This review is scoped, not a comprehensive security audit. New completion is SECURITY INVOKER with owner checks and PUBLIC/anon denied. Existing warnings remain; no authentication settings are changed silently.

## Rollback and verification

Keep additive schema during frontend rollback. Never drop completion markers/RPC while pending clients can retry. Export/reconcile journals before downgrading to an incompatible recorder. Verify canonical URL, main commit, worker v49, cache headers and bounded API JSON errors. Refresh existing tabs without clearing site data. Physical iPhone long-ride/background/hardware acceptance remains manual.

## Receipts

- Supabase applied migration durable_ride_sync successfully at version 20260915145159. The repository filename matches the remote migration history.
- Catalog verification: sample ID int8 retained, client UUID and unique index present, all three RLS flags and six policies retained; completion RPC invoker; anon execution false, authenticated execution true; authenticated sample TRUNCATE false.
- Post-migration security advisor retains the existing warnings described above. Remediation references: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
- Local audit: 11 tests, syntax/interactions and Vite build pass. Recording architecture: 45 checks pass. Both isolated browser suites pass; screenshots inspected at desktop and 390px.
- PR #77 opened against main. Initial GitHub audit job and Vercel preview build passed. Production merge/deployment await the remaining browser CI checks.

## October 2026 PRD and design release

The user authorized deployment on 13 October 2026 after reviewing the locally implemented PRD continuation and light/dark redesign. Release branch: `feat/prd-features`; production must be the reviewed merge on `main`. The preceding production deployment is `dpl_ByTuG96tcpZuMasjtAnD3oBRGWd6`, commit `7c2ffde02c52b5776c679abbd7d325cd6046d83c` (PR #80), at https://moto-engineering-cloud.vercel.app/.

Scope: immutable GPX edits, bounded OSM offline routing, Open-Meteo route weather, durable pause/recovery, GPS review/playback, optional upload/local cache retention, media/voice capability fallbacks, and the shared UI/UX redesign with persistent light/dark appearance. Invitation-only/MFA access is preserved; guest/local accounts remain deferred and ECU features are excluded. Paid-provider dispatch is disabled. No migration, auth configuration, secret or service-worker change is included. See PRD_DELIVERY.md and UI_DESIGN.md for precise capability limits and changed files.

Release evidence before push: audit passed with 25 tests and the production build; five mocked Chromium browser suites and all 45 recording static checks passed. Desktop/mobile, 320px long names, 200% type, key text contrast, theme persistence, owner isolation, pause/reload recovery, original GPX bytes and local offline routing were checked. Existing observer/generated-button and large-bundle warnings remain. Physical iPhone/background behavior and real provider availability remain manual limitations; mock evidence does not certify them.

Risk is high because this includes recorder lifecycle and provider behavior. The implementation diff was reviewed locally for failure handling, account boundaries, duplicate styles and source provenance; CI and the Vercel preview must pass before merging the exact reviewed head. The duplicate public speed stylesheet was replaced with a source import through its owning module. API routing and cache rules remain unchanged.

After merge, verify the Vercel production deployment is READY for the merge SHA, the canonical alias serves the new assets, invite-only sign-in and both public themes load at desktop/mobile widths, failed sign-in remains bounded, shell/worker cache headers revalidate, malformed API inputs return JSON 4xx, and paid-provider health is disabled. Authenticated production records are not accessed by automated public smoke checks. Retain pending journals and local route libraries across refresh/update.

Rollback restores the preceding reviewed main deployment with human authorization. Keep existing additive database schema and all IndexedDB stores; do not clear site data or delete pending recordings. No database rollback is needed. PR/CI/production receipts will be reported with the release result.
