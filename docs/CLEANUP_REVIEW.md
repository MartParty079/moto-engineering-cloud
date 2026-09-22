# Rider app cleanup — 2026-09-22

Scope: final source cleanup of the existing simplified rider branch and refreshed native handoff. No user records, SQL migrations, published API routes, recorder protocol or service-worker behavior removed.

## Reference review

Traced index.html script/style entrypoints, static and literal dynamic imports (including the localhost Supabase mock), active script/link creation, CSS references, worker precache URLs, tests, CI and global/event consumers. The active graph has 20 src files. Leaflet is the only dynamically injected external script/style pair. The worker precaches root/manifest/icon, not removed legacy modules.

Removed 116 files: unreachable legacy frontend modules/styles, duplicate public CSS, obsolete starter/roadmap assets and four old browser drivers. Deprecated global providers have no active loader; active UI uses its current canonical owners. Removed the test of the retired fetch wrapper, retained provider boundary tests, and reduced the recording static audit to live durable-capture invariants. CI now calls the current browser suites, with updated selectors, in Chromium/WebKit.

Published APIs remain because no current UI caller is insufficient evidence that external clients do not use an endpoint. Database history, RLS, grants, recovery storage and historical engineering documentation are retained deliberately. The dev mock stays because supabase.js dynamically imports it only on localhost with e2e=1.

Old cached browser shells are not guaranteed to support deleted unbundled legacy paths. Current Vite builds contain hashed assets. Verify an online reload/relaunch after deploying; do not clear site data or journals. Reverting the cleanup commit restores source; no destructive database rollback is needed.

## Validation

Completed: npm run audit (17 tests passed, syntax/interactions checked, production build passed), eight live recording static checks, regenerated source inventory and git diff --check. The obsolete provider-wrapper test was removed with its unused implementation; the active provider boundary tests remain. Main JS/CSS build hashes are unchanged from the pre-cleanup build. Source inventory is now 27 browser/API/helper files, including 20 src files.

Browser smoke launch was attempted and failed before running any workflow: Playwright's Chromium executable is not installed. Updated Chromium/WebKit CI suites and physical iPhone workflows remain unverified in this environment. No device result is inferred from a successful build. The native handoff lists known contract gaps rather than claiming a complete current schema.

## Removed paths

- `src/ride-dashboard-header-controls.css`
- `src/ride-intelligence.css`
- `src/mobile-workflow-fixes.css`
- `src/recorder-phase4-v44.js`
- `src/ride-lean-bridge.css`
- `src/startup-permissions.js`
- `src/ride-dashboard-compact.css`
- `src/ride-center.css`
- `src/garage-center.css`
- `src/ride-os-v3.js`
- `src/offline-cache.css`
- `src/ride-experience-v2.css`
- `src/ride-os-v3.css`
- `src/ride-log-bridge.js`
- `src/overview-last-updated.js`
- `src/security-admin-guard.js`
- `src/adventure-mode.css`
- `src/garage-compact.css`
- `src/iphone-ui-cleanup.css`
- `src/adaptive-layout.css`
- `src/remove-ai-integration.js`
- `src/adaptive-layout.js`
- `src/ride-speed-cell.css`
- `src/ride-dashboard-themes.css`
- `src/access-control.js`
- `src/motorcycle-profiles.css`
- `src/app-interaction-stability.css`
- `src/adventure-tools.js`
- `src/ride-lean-bridge.js`
- `src/ui-polish.css`
- `src/ride-layout-cleanup.css`
- `src/ui-system-v2.css`
- `src/premium-visibility.css`
- `src/marty-brand.css`
- `src/adventure-tools.css`
- `src/mobile-fix.css`
- `src/ride-speed-cell.js`
- `src/ride-experience-v2.js`
- `src/ride-weather.css`
- `src/access-control.css`
- `src/ride-lean-v2.js`
- `src/mobile-layout-hotfix.js`
- `src/app-interaction-stability.js`
- `src/recorder-features-v42.js`
- `src/ui-system-v2.js`
- `src/vehicle-data.js`
- `src/recorder-road-context-compat-v45.js`
- `src/ios-motion-disable.js`
- `src/recorder-features-v42.css`
- `src/ride-safe-enhancements.css`
- `src/vehicle-data.css`
- `src/marty-brand.js`
- `src/security-center.css`
- `src/adventure-integration-v2.js`
- `src/garage-center.js`
- `src/offline-cache.js`
- `src/recording-isolation.js`
- `src/adventure-ride-control.css`
- `src/ride-layout-cleanup.js`
- `src/ride-analytics.js`
- `src/site-audit.css`
- `src/motorcycle-profiles.js`
- `src/cost-sheet.js`
- `src/access-bootstrap.js`
- `src/provider-auth-fix.js`
- `src/ride-dash-live-hotfix.css`
- `src/garage-health.js`
- `src/recorder-road-context-v45.js`
- `src/garage-compact.js`
- `src/ui-polish.js`
- `src/ride-hud.js`
- `src/recorder-scroll-v43.css`
- `src/ride-delete.js`
- `src/garage-health.css`
- `src/road-provider-default.js`
- `src/cirkit-link.js`
- `src/ride-picker-stability.js`
- `src/add-record-fix.js`
- `src/ride-analytics.css`
- `src/ride-dashboard-header-controls.js`
- `src/mobile-layout-hotfix.css`
- `src/adventure-ride-control.js`
- `src/ride-experience-safety.js`
- `src/navigation-state.js`
- `src/security-center.js`
- `src/garage-observer-guard.js`
- `src/rider-welcome-ui.js`
- `src/bike-editor-fix.js`
- `src/access-bootstrap.css`
- `src/ride-hud.css`
- `src/ride-log-bridge.css`
- `src/ride-picker-stability.css`
- `src/ride-performance-guard.js`
- `src/ride-experience-hotfix.css`
- `src/adventure-mode.js`
- `src/ride-weather.js`
- `src/premium-visibility.js`
- `src/provider-dashboard.js`
- `src/ride-tools.js`
- `src/ride-start-guard.js`
- `src/mobile-workflow-fixes.js`
- `src/access-diagnostics.js`
- `src/ride-safe-enhancements.js`
- `public/src/offline-cache.css`
- `public/src/ride-experience-v2.css`
- `public/src/iphone-ui-cleanup.css`
- `public/src/ride-speed-cell.css`
- `public/src/ride-layout-cleanup.css`
- `public/src/premium-visibility.css`
- `public/src/ride-picker-stability.css`
- `public/starter-project.json`
- `public/roadmap-rev-a.json`
- `scripts/e2e-road-context.mjs`
- `scripts/e2e-proof.mjs`
- `scripts/e2e-ai-removed.mjs`
- `scripts/e2e-recorder-scroll.mjs`
