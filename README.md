# Moto Engineering Cloud

Moto Mission is a rider-focused motorcycle garage and ride logger. The web app keeps motorcycle records, service history, GPS ride capture, a fixed live sensor screen, and a simple map in one installable application.

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
5. A small, maintainable rider interface

## Repository structure

- `index.html` — application shell and module loading
- `src/` — active rider modules and retained legacy source awaiting separate deletion review
- `api/` — server-side provider and utility endpoints
- `supabase/` — database migrations
- `docs/` — architecture, operations, decisions, policy, and test guidance
- `manifest.webmanifest` / service worker — installable PWA support
- `vercel.json` — deployment routing, caching, and security headers

## Developer handoff and Swift port

The web app must remain usable throughout the Swift port. Swift is an additional client during development, using compatible accounts and records; it must not require retiring the web app. Release web repairs independently when verified. Backend changes must remain compatible with the deployed web client until a deliberate cutover. See [parallel-use requirements](docs/WEB_SWIFT_COEXISTENCE.md).

Start with [SWIFT_PORT_HANDOFF.txt](SWIFT_PORT_HANDOFF.txt). It documents the current app, screen parity, data and API contracts, safety limits, proposed native structure, port phases, and a starting prompt for Claude.

- [Source inventory](docs/APP_INVENTORY.txt): module loading, dependencies, table/RPC references, storage keys and checked-in base schemas. Regenerate with `npm run docs:inventory`.
- [Repair and validation record](docs/HANDOFF_VALIDATION.md): changes, local test evidence, remaining risks and release checks.
- Copy `.env.example` to `.env.local` and supply an authorized development project's public configuration. The existing client fallback points to the production project; override both URL and key before development.

Run `npm ci` only when dependencies need installation, then `npm run dev`. Vite serves the frontend; it does not execute the Vercel `api/` handlers. Run `npm run audit` for syntax, offline regression tests and the production build. Optional mocked browser verification is documented in the validation record.

Native integration still requires a full reviewed schema export. The three recording tables have been inspected and copied to a local schema fixture for compatibility tests. The web ride queue persists in owner-scoped IndexedDB and uses the completion contract in docs/RIDE_SYNC.md. See docs/DEPLOYMENT_RELEASE.md for release receipts and remaining limits. Browser persistence does not provide continuous iOS background recording.

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
