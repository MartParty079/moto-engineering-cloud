# Moto Mission PRD structure

Reference: Moto_Mission_Master_PRD_v1.0.docx, 8 October 2026. This change implements the requested application structure, using current capabilities; it is not a claim that every phase in the PRD has shipped.

## Decision and ownership

The user retained invitation-only access and existing MFA for this rebuild; guest/local mode is deferred. No production access, remote migration, provider configuration, deployment, or external write is required for this change.

| Area | Owning modules and behavior |
|---|---|
| Map | main.js shell and rider-welcome-ui.js launch page; existing adventure-mode.js fullscreen online map with GPS, layers, heading controls and tracks |
| Routes/GPX | route-library.js and route-store.js own account/project-scoped device imports, previews and exact original downloads; adventure-mode.js displays originals read-only alongside existing cloud routes/editor |
| Rides/Review | ride-log-bridge.js history/details with full paginated GPX export via ride-gpx.js; ride-runtime.js remains the durable recorder owner and exports complete local tracks before upload |
| Bike/Devices | Existing garage/profile modules and maintenance; devices page identifies phone source and disconnected/experimental hardware |
| Settings/Admin | Rider preferences and existing security console; existing administrator navigation remains role-gated |

main.js imports the area renderer through its existing domain owner. No independently loaded scripts or styles are added to index.html. Desktop and narrow mobile navigation share the same five destinations. Existing data-v identifiers for Map (dashboard), Rides (rides) and Bike (garage) remain compatible with stored links. Routes/settings reuse the existing dashboard rollout permission; device status reuses motorcycles permission. These aliases grant no new backend privileges. Last-screen restoration uses the explicit page lifecycle event rather than another navigation observer. Ride Mode stays available in the header; iPhone recording isolation is retained.

Maintenance, Garage Mode, notes and project files remain secondary tools. Dormant engineering implementations and stored records are preserved; removed AI/engineering navigation is not reintroduced.

## Feature continuation

The 2026-10-09 implementation and remaining requirement gates are tracked in [PRD_DELIVERY.md](PRD_DELIVERY.md). This supersedes the original deferred-feature list. ECU data/controls are excluded and guest/local accounts remain deferred. Current changes are local and have not been deployed.

## Validation and release

Run npm run audit, npm run test:browser and npm run test:browser:rides and npm run test:browser:gpx with the local mocked Supabase endpoint documented in HANDOFF_VALIDATION.md. Browser tests abort all network outside local test origins. PLAYWRIGHT_EXECUTABLE_PATH can select an installed browser executable if the matching Playwright browser bundle is unavailable. Screenshots are generated in the temporary test directory and excluded from source control.

Risk: medium UI/navigation change with high-risk access-gating integration. Authentication protocols, RLS, storage policies, server APIs and service workers are unchanged. Existing release gates still apply.

Before any authorized release: validate invite-only sign-in, verified accounts and MFA; test rider and administrator roles; verify disabled-feature links fail closed; load all five areas on desktop and narrow mobile; import/preview/export a disposable GPX in an authorized development environment; recover and complete a ride; verify shell hard refresh and installed-PWA updates do not lose pending journal records; confirm /api routes bypass SPA fallback; inspect runtime errors. Physical iPhone/background capture and real map/provider success remain manual checks.

Rollback: revert this coherent UI change and redeploy the previous reviewed build only with human authorization. No database rollback or data deletion is needed. Preserve browser IndexedDB and pending ride queues throughout rollback.

## Local validation evidence

The repository audit passed: syntax checks, interaction checks, 17 unit/database tests and Vite production build. Existing persistent-observer, generated-button and large-bundle warnings remain. The interaction scanner reports home/garage handler warnings because the mobile router uses a destination mapping; both routes are covered by browser interactions.

Mocked Chromium smoke tests passed at 1280px, 900px and 390px: invitation-only sign-in, failed sign-in recovery, five-area navigation, last-screen reload, GPX sheet entry, bounded map failure, device status, preferences/security, maintenance, Garage, Ride Mode, rider administration hiding and disabled-feature fallback. No uncaught page errors or mobile horizontal overflow were observed. Durable Chromium tests passed reload recovery, resumed capture, account isolation, lost-response deduplication and completion. GPX browser tests passed import/preview, exact original downloads, reload persistence, owner isolation, mobile layout, segmented map geometry and complete long-ride export against local mocks. Map/provider success, real cloud data exports, physical iPhone field behavior and deployed access policies remain unverified.

Changed files: index.html; src/main.js; src/rider-welcome-ui.js; src/marty-brand.js; src/styles.css; src/navigation-state.js; src/ui-polish.js; src/mobile-workflow-fixes.js and .css; src/access-control.js; src/app-interaction-stability.js; src/adventure-mode.js; src/adventure-integration-v2.js; src/ride-dashboard.js; tests/browser-smoke.mjs; tests/browser-durable.mjs; docs/ENGINEERING_BASELINE.md; docs/PRD_STRUCTURE.md.

Feature continuation files: src/gpx.js; src/route-store.js; src/route-library.js; src/ride-gpx.js; src/ride-runtime.js; src/ride-center.js; src/ride-log-bridge.js; tests/gpx.test.mjs; tests/route-store.test.mjs; tests/browser-gpx.mjs; package.json; docs/GPX_WORKFLOW.md; docs/RIDE_SYNC.md. Shared UI/map modules above also integrate these features.
