# Moto Mission 2.0 — implementation registry

Started 4 November 2026 from `main` at `08142cf`, verified against remote main. Source requirements: [Master Overhaul PRD](MOTO_MISSION_2_PRD.txt). This is the first delivery slice, not completion of the overhaul or a production audit.

## Approved decisions and boundaries

The user explicitly retained invitation-only access on 4 November. Existing verified-account access, MFA and administrative role gates remain. SEC-001 and other guest-first language in the source PRD are overridden by this decision; guest/local accounts remain deferred. Account-scoped local storage does not introduce guest access.

The existing static ES module frontend remains canonical for this slice. The proposed React/TypeScript migration is not a prerequisite for repairing motorcycle context. Paid providers remain disabled under the earlier user decision in `server/provider-policy.js`; NAV-011 does not authorize enabling TomTom or Google or incurring spend. Existing ECU exclusions and hardware safety gates remain. No production access, snapshots, external writes, migrations, merge or deployment are part of this local change.

## First implementation: active motorcycle

`ride-center.js` remains the garage/ride controller used by the cockpit. It now owns active motorcycle selection, using the existing `MissionStore` in `rider-preferences.js`. The `active-motorcycle` key is scoped by backend origin and account, independent of preferences and ride journals. A validated stored choice wins; otherwise the earliest available garage motorcycle is selected. Removed or inaccessible IDs cannot remain the idle selection. Selecting a motorcycle or starting a ride saves the choice before reporting success. Failed writes leave the current selection intact.

`motorcycle-selector.js/.css`, imported by `main.js` and `ride-dashboard.js`, provides a shared searchable native dialog with keyboard dismissal/focus restoration, current selection, and Garage/Add and Ride Mode entry points. The chip appears on all five primary shell destinations and in a separate cockpit row that remains visible when the cockpit hides its brand. The existing start-ride confirmation lists the selected motorcycle first; changing idle context alone does not start recording or change route preferences. Opening/closing this dialog does not rerender the route workspace.

The recorder's existing bike snapshot stays authoritative during recording, startup, pause, reload recovery and pending upload. Switching to another motorcycle fails with a visible instruction to finish/recover the saved ride. This conservative first slice does not split rides or change their attribution. Account transitions close an open picker and clear cached garage context before asynchronous reload. No new HTML script/style entry, global observer, database schema, service worker or API change is introduced.

## Requirement registry — first inspected areas

Statuses describe local source and mocked tests only. Partial means at least one mandatory clause remains. Uninspected requirements in the source PRD remain unverified, not implicitly implemented or absent.

| Requirement | Status in this slice | Evidence and remaining work |
|---|---|---|
| BASE-003 / WO-002 | Partial | Shell, garage/ride controller, journal, route store, small offline graph and provider policy inspected. Existing broad source inventory: `APP_INVENTORY.txt`. Deployed behavior, full database/storage schema, feature flags and provider spend have not been accessed. |
| UX-001 / BIKE-003 / WO-001 | Partial; shell omission repaired | Header/cockpit selection and search, primary-screen visibility and ride-start ordering verified. Explicit recent-bike list, default management, avatars and post-ride identity parity remain. |
| UX-002 | Existing partial | Bike/Devices is a primary destination; `garage-center.js` owns cards, service and mods. Devices remain capability-gated. Full per-bike calibration/device binding is not established. |
| UX-003 / BIKE-008 | Partial | Reload persistence, initial garage fallback and existing immutable recorder bike snapshot. Generic anonymous ride mode remains deferred under invite-only/account policy. Full setup snapshot completeness still needs schema review. |
| UX-004 | Implemented conservative guard locally | Reject a different bike while any local ride remains recoverable, including pause/reload/pending upload. Explicit segment splitting is not provided. |
| UX-009 | Partial | Selection dialog preserves route form DOM and current ride ID. Full map camera/guidance/other-overlay matrix remains to audit. |
| UX-008 / UX-010 | Partial | 44px chip controls, 320/390px layouts, keyboard dialog, accessible labels and both themes tested. Physical glove/sunlight/motion/accessibility validation remains. |
| BIKE-002 / SEC-001 | Deferred by user decision | No guest account mode or new account onboarding is introduced. |
| GPX-002 / GPX-015 / WO-003 | Partial existing | `route-store.js` stores add-only original bytes and geometry, and separate edited copies with source IDs. Exact original downloads have regression coverage. Hashes, graph-backed RouteVersion/segment schema and full revision contract remain. |
| MAP-001 / NAV-002 / GPX-017 / WO-004 | Partial existing | `offline-routing.js` and UI support small bounded OSM networks, not complete licensed regional packs, search indexes or iOS offline parity. Feasibility/licensing spike remains. |
| GPX-004–019 / WO-005 | Unverified beyond existing preservation | The inspected offline graph is not evidence of graph-aware GPX fitting. HMM/sequence matching, ambiguity preview/apply and meaningful graph-derived maneuvers require a separate vertical slice. |
| MAP-010 / MAP-011 / WO-006 | Unverified | Existing recorder-road-context modules require replay-based continuity/hysteresis audit. |
| RIDE-001 / RIDE-008 / WO-007 | Partial existing | Durable pause/reload/resume, owner isolation, lost-receipt deduplication, local GPX recovery and cloud export tests pass. Native background capture and physical riding remain unverified. |
| BIKE-005 / BIKE-006 / WO-008 | Unverified | This change does not associate devices or certify sensor quality. |
| WO-009 | Partial existing | `route-weather.js` and PRD browser tests cover route snapshots, modeled rolling 72h and outage caching. No new live weather proof or ground calibration. |
| SEC-007 / WO-010 | Partial existing | Paid dispatch disabled server-side; this is not a new cross-device hard quota or migration audit. Existing tenant/migration tests run locally; production policies/advisors unverified. |

GitHub read-only metadata inspection on 4 November found open issue #13 (telemetry data contract) and open PR #79 (`fix/ride-speed-gauge-format`, Ride speed card). Neither is changed or superseded by this slice. No issues or PRs were created: external writes require specific approval under repository policy.

## Validation and release checks

`npm run test:browser:motorcycle` uses real Chromium and IndexedDB with mocked localhost auth/data and all other network blocked. It covers all primary screens, search, reload, failed selection storage, preserved route form, desktop/390/320px layouts, cockpit/start ordering, recording/paused/recovered switching guards, account isolation and removed-bike fallback. Browser screenshots are temporary artifacts outside source control.

Also run `npm run audit`, the existing navigation, durable recording, GPX, PRD and design browser suites, and the recording static audit. Local mocks do not establish deployed access policies, MFA enforcement, real map success, storage eviction behavior or physical iPhone usability.

Local evidence on 4 November: `npm run audit` passed all 25 tests and the production build; all six Chromium browser suites passed; all 45 recording static checks and `git diff --check` passed. The new suite also checks a live account transition with the selector open, failed storage writes without a false selection, and readable choice contrast in light/dark mode. Selector screenshots at 320px and dark mode, plus the recording guard, were visually inspected. The copied source PRD has the same SHA-256 as the user attachment. Existing observer/generated-button and large-bundle warnings remain. No live provider, production account, deployed policy, physical hardware or field ride was tested.

Risk: medium client context/UI change with recorder/auth lifecycle integration requiring high-risk release checks. Before any authorized deployment, use an authorized development environment to verify invited rider/admin/MFA access, sign-out and account changes, unavailable local storage, empty/deleted bikes, paused/pending ride recovery, unchanged ride motorcycle attribution, desktop/narrow/landscape cockpit, and actual iPhone recording isolation. Verify shell/PWA updates preserve IndexedDB and pending journals, `/api/*` bypasses SPA fallback, and runtime errors remain bounded. No production credentials are needed for local validation.

Rollback: revert this focused frontend change and deploy the prior reviewed build only after explicit authorization. The additive local key can remain; older clients ignore it. Preserve IndexedDB and pending journals. No database rollback or data deletion is required.

## Next slices

Finish BASE-003's requirement-level source inventory and regression reproduction before broad refactoring. Then review canonical RouteSource/RouteVersion contracts and prove motor-legal offline graph feasibility on iOS before claiming Fit to Road. Keep later weather, hardware, native and quota changes independently reviewable. This branch is only the active motorcycle slice and initial registry.
