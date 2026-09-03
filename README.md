# Moto Engineering Cloud

Moto Engineering Cloud is the software platform for the Moto Mission motorcycle data-logging and engineering program. It combines project management, motorcycle records, ride logging, telemetry, PCB planning, maintenance, parts, and field-work workflows in one installable web application.

## Current system

- **Frontend:** static ES modules deployed on Vercel
- **Backend:** Vercel serverless API routes
- **Database, authentication, and storage:** Supabase
- **Primary device target:** ESP32-S3 motorcycle logger
- **Primary motorcycle:** 2022 Honda CRF450RL

## Engineering priorities

1. Reliable GPS and IMU ride recording
2. Safe vehicle power and communications interfaces
3. Durable local storage and recovery from interrupted rides
4. Authenticated cloud synchronization
5. Traceable engineering work packages and test evidence
6. K-Line integration without blocking the core logger

## Repository structure

- `index.html` — application shell and module loading
- `src/` — browser modules and styles
- `api/` — server-side provider and utility endpoints
- `supabase/` — database migrations
- `docs/` — architecture, operations, decisions, policy, and test guidance
- `manifest.webmanifest` / service worker — installable PWA support
- `vercel.json` — deployment routing, caching, and security headers

## Release rules

A release is acceptable only when:

- The latest Vercel deployment is `READY`.
- API routes are not intercepted by the SPA fallback.
- Supabase security advisors have no unreviewed high-risk findings.
- Authentication-dependent features fail closed.
- The app shell and service worker are not served with stale immutable caching.
- Removed or unfinished features are not represented as operational.
- The engineering baseline and risk register are updated for material changes.

## Development workflow

1. Read `docs/REPOSITORY_POLICY.md` before creating branches or adding runtime modules.
2. Define or update the requirement.
3. Start one task branch from current `main`.
4. Make the smallest coherent change in the owning module.
5. Validate browser and API behavior.
6. Validate Supabase policies and function permissions when applicable.
7. Open one focused pull request with validation, risk, and rollback notes.
8. Deploy through the GitHub-to-Vercel integration only after authorized merge.
9. Inspect deployment state and runtime errors.
10. Record the decision and remaining risk.
11. Delete the merged branch.

Do not use backup branches, version-chain branches, or new patch/hotfix runtime files as a substitute for fixing the owning module. Git history is the archive.

## Production services

- GitHub repository: `MartParty079/moto-engineering-cloud`
- Vercel project: `moto-engineering-cloud`
- Supabase project: `bxqexjvwxtnlflznyqyq`

Secrets belong in Vercel or Supabase environment configuration. Never commit service-role keys, paid-provider secrets, or private tokens.

## Status

The application is under active stabilization. The authoritative system definition is maintained in `docs/ENGINEERING_BASELINE.md`, repository lifecycle rules are in `docs/REPOSITORY_POLICY.md`, and deployment procedures are in `docs/OPERATIONS.md`.
