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

Keep additive schema during frontend rollback. Never drop completion markers/RPC while pending clients can retry. Export/reconcile journals before downgrading to an incompatible recorder. Verify canonical URL, main commit, worker v47, cache headers and bounded API JSON errors. Refresh existing tabs without clearing site data. Physical iPhone long-ride/background/hardware acceptance remains manual.

## Receipts

Deployment pending final validation.
