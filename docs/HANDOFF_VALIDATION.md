# Handoff repairs and validation

Updated 2026-09-16. Reconciled with main at 1cbfaf7, preserving current rider home, invitation-only security, unified Ride OS and recording isolation. See DEPLOYMENT_RELEASE.md for remote receipts.

## Changes and evidence

- Shared shell, auth/home, navigation and utility styling: main.js, styles.css, marty-brand.css/js, rider-welcome-ui.js and ui-polish.js. pwa.js places installation in the header/form instead of over content.
- Ride journal, recorder, runtime, sync and center modules plus dashboard/Adventure/motion integration provide persistent recovery, stopped-only uploads, deduplicated samples and transactional completion.
- GPS validity, access-loading failure state, exact same-origin provider routing and shared API request validation repair unsafe/misleading failure behavior.
- Worker v49 and vercel.json preserve API bypass, unrelated caches and shell revalidation. The map and gauge refresh removes superseded Ride visual and map-overlay modules after checking HTML, service-worker, import and global references.
- Additive migration retains bigint sample IDs and existing RLS, adds client UUID and completion RPC, and revokes browser TRUNCATE.
- Text handoff, generated inventory, copied three-table schema fixture and automated tests support the next developer.

npm run audit runs syntax/interaction checks, Node tests and Vite build. Existing observer/reload and generated-button warnings remain; large-bundle warnings remain an optimization item. recording-static-audit checks loader order, GPS authority, isolation, stopped-only sync and worker version against the new owning modules.

Browser smoke checks invitation-only auth, failed sign-in recovery, home, settings, maintenance, garage, mobile navigation and Ride overlay at desktop/tablet/390px widths. Browser recovery checks real IndexedDB reload, resumed capture, account isolation, pending upload, lost response retry without duplicates, and fail-closed access recovery. All requests outside the local test origins are aborted. No production records are created.

## Reproduce

Configure local Vite with public placeholders and VITE_SUPABASE_URL=http://127.0.0.1:54321. Start on 127.0.0.1:5173. Use npm ci when dependencies need installation. Supply PLAYWRIGHT_MODULE or install Playwright in the test environment. PLAYWRIGHT_CDP_URL optionally selects an existing test browser. Run npm run test:browser and npm run test:browser:rides. They create isolated contexts.

Existing CI retains Chromium/WebKit recorder proof, scrolling, road-context and AI-removal suites. Headless WebKit is not a physical iPhone field test.

The road-context suite starts the real recorder and verifies bounded road lookups during isolation. Isolation forwards GPS directly to the road-context owner, avoiding capture-listener ordering dependencies. GPS fixtures timestamp each delivered fix so stale pre-ride positions cannot falsely pause recording.

## Remaining limits

Physical iPhone/PWA capture, long rides, suspension and hardware remain manual. Only the three recording tables were inspected; a full backend/Storage export is needed for native parity. No development cloud project or Apple signing setup was created. Keep pending site data during updates. Review security-advisor warnings and deployment receipts; see RIDE_SYNC.md for rollback and accounting limits.
