# MM-UI-007 — compact interface and navigation

User work order, 4 November 2026. Continue the existing overhaul task branch (started from current main `08142cf`), preserving the active motorcycle slice at `42e9b85`. Implement in reviewable local stages. This work order does not authorize production deployment or a merge. Invitation-only verified access and MFA remain mandatory.

## Entry-point audit and ownership

| Existing entry | New destination | Canonical implementation |
|---|---|---|
| Home / Adventure map | Map → Explore | adventure-mode.js, adventure-integration-v2.js; existing Leaflet renderer |
| Routes/GPX | Map → Routes | route-library/store/editing, adventure route editor, offline-navigation-ui/routing |
| Track guidance | Map → Navigate | adventure track progress and downloaded-network guidance; recorder road context remains authoritative |
| Ride Mode | Ride Center → Live | ride-center/runtime/recorder/journal; ride-dashboard for existing customization |
| Device status | Ride Center → Sensors; Garage shortcut | One shared status renderer; no simulator or invented connections |
| Rides / Review | Ride Center → Review | ride-log-bridge/review/analysis/gpx |
| Route weather | Weather → Route | route-weather service and route-weather-ui |
| Weather at location/area | Weather → Now / Area | Explicit location/coordinate query through existing bounded weather service |
| Motorcycle profiles / maintenance | Garage | main, motorcycle-profiles, garage-center; existing data and handlers |
| Preferences / security | Settings | rider-preferences and existing security/admin gates |
| Notes / project files / Garage Mode | Secondary tools in menu | Existing owners; preserve records and permissions |

Dependencies remain static ES modules, Vite, Supabase client and existing dynamically loaded Leaflet 1.9.4. No React/TypeScript migration, new UI dependency, backend replacement, database migration or paid-provider enablement is required. Existing `marty-brand.css` owns design tokens; imported domain styles own compact layouts.

## Verified gaps and preservation gates

- Fit to Road is absent as a graph-aware match/preview/apply pipeline. Existing local GPX originals and edited copies are preserved; do not label geometric track following as fitted turn-by-turn navigation.
- Offline coverage is a bounded small OSM road-network beta, not a complete regional topo pack. Tile outages must show a bounded map failure state and retain GPX/offline tools.
- BLE/ESP32/OBD/TPMS integrations and calibrated chassis lean are not established. Sensor cards must say disconnected, unsupported or experimental. Existing ECU exclusions remain.
- Route-weather snapshots and rainfall are modeled estimates; radar is a separate capability and must not be represented as forecast truth. No new imagery license or live source may be assumed.
- iOS background capture remains platform-limited. Preserve recording isolation and local journals across screen changes; a tab change must never stop the recorder.
- Superseded navigation markup can be removed once each action is mapped. Do not delete dormant runtime modules or database records without reference/usage evidence.

## Implementation stages

1. Audit: this mapping and capability register.
2. Shared foundation: forest/orange tokens, five primary tabs, compact shell, persistent workspaces, reusable sheets/segments/metrics/status.
3. Map: embedded retained renderer, Explore/Routes/Navigate and collapsible GPX/offline controls.
4. Ride Center: live recorder controls, shared sensor status and existing review/export/customization.
5. Weather/Garage: explicit forecasts, rainfall and compact motorcycle/service entry points.
6. Settings/cleanup: grouped settings, compatible saved UI preferences and remove superseded visible navigation.
7. Validation: automated audit, real-browser mocked workflows, 393×852 / smaller / landscape / large text, screenshots and measured transitions. Physical iPhone and visual comparison to supplied mockups remain manual if those assets are unavailable.

## Release and rollback

No production access or external writes are needed for local implementation. Before an authorized release, verify invited rider/admin/MFA, disabled features, account transitions, active ride tab switching, pause/recovery/export, GPX original equality, offline graph guidance, map camera retention, weather failures/cached age, safe areas, larger text and physical iPhone portrait/landscape. Confirm shell/service-worker revalidation and API bypass. Existing observer/bundle warnings must remain disclosed.

Rollback restores the prior reviewed frontend after authorization. Preserve IndexedDB, route originals, pending journals and additive UI preference keys. No database rollback or site-data deletion is required.

## Implemented frontend

- Five primary tabs with orange selection, compact active-motorcycle header and safe-area-aware bottom navigation. Legacy Routes/Rides/Devices links resolve to nested destinations; maintenance, Garage Mode, notes and files remain secondary tools.
- Shared `ui-components.js/css` owns segmented controls, metric cards and sheet states: hidden, minimized, half, expanded and fullscreen. Handles support tapping, keyboard arrows and pointer swipes. Native dialogs provide metric detail and fullscreen radar; reduced-motion rules disable decorative transitions.
- `workspace-ui.js/css` owns Map, Ride Center and grouped Settings presentation. Existing module imports load these files; `index.html` gains no independently loaded resources. Main retains connected inactive roots and their scroll positions, hides them with `hidden`/`inert`, and destroys them on account reset.
- Map reuses one Leaflet renderer, existing cloud editors, immutable local GPX library and bounded offline-network tools. Explore/Routes/Navigate share the camera. Route sheets expose original download, separate edited copies, routing settings and beta offline guidance. Navigation shows available recorder/road/guidance information, freshness and uncertainty rather than inventing instructions or speed limits. Tile failures retain tools and display availability status.
- Ride Center reuses the durable recorder, recovery/export controls, dashboard customization and ride library/playback. Metric graphs contain only actual GPS-linked snapshots. Shared sensor status remains explicit about unsupported sources. Recording fanout suppression remains active on iPhone while integrated tabs stay accessible; no recorder journal/schema change was made.
- Weather Now/Route/Area uses the existing bounded Open-Meteo service, adds 24/48/72-hour modeled totals and hourly details, and shares the existing 96-location-unit device-day budget with route forecasts. No automatic location forecast polling. Existing RainViewer past imagery is reused with attribution, frame-age labels, a native fullscreen view and actual tile-load checks before success. Weather listeners are disposed on workspace/account reset.
- Garage exposes the existing motorcycle selector, profile and service tools prominently. Settings provides nine collapsible groups; existing security, MFA, administration and preference dialogs remain accessible. Street/Adventure/Enduro/Custom are application display presets, not vehicle control or new routing capabilities.

Interface preferences use additive `interface`, `dashboard-metrics` and `weather-location` records in the existing scoped store; appearance retains its existing owner. Section modes use session storage. Account transitions clear retained roots/graphs/state and reload scoped data. No database migration, route overwrite, service-worker change, backend replacement, package dependency or paid-provider enablement was introduced.

## Refactored or superseded UI

- Removed oversized landing/route/settings presentation from `rider-welcome-ui.js`; it delegates to the canonical workspace renderer. Its working maintenance dialog remains shared with Garage.
- Removed separate visible top-level Routes, Rides/Review and Devices destinations. Hidden compatibility buttons retain existing callers and permissions while routing to canonical sections.
- Replaced destructive main-screen replacement on tab switches with retained roots, and removed the ride-library handler that overwrote the current top-level screen.
- Reused existing map sheets and device renderer instead of creating parallel editors or sensor managers. Replaced map-owner polling in Ride OS with explicit map lifecycle events.
- Removed already-suppressed decorative Ride OS scene construction/animation. Its former DOM was already removed by the existing performance guard; no telemetry feature was removed.
- Retained dormant runtime modules where deletion could not be justified by import/global/event evidence. No runtime file or user record was deleted.

## Validation record — 4 November 2026

Local tests use isolated mock accounts/providers and synthetic GPS. No production credentials, accounts or data were accessed. Browser runs use installed desktop Chromium, including an iPhone user-agent and touch viewport; this is not physical Safari testing.

| Check | Result / evidence |
|---|---|
| `npm run audit` | Syntax, interaction audit, 25 Node tests and Vite production build pass. Existing observer/generated-button and large-bundle warnings remain. |
| `npm run test:browser` | Invite-only access, failed sign-in recovery, five tabs, disabled-feature restoration, map failure fallback and mobile navigation pass. |
| `npm run test:browser:rides` | IndexedDB reload/recovery, account isolation, access-retry recovery, upload receipt deduplication and completion pass. |
| `npm run test:browser:gpx` | Original byte equality, segment preservation, reload/account isolation, geometry and paginated GPX export pass. |
| `npm run test:browser:prd` | Separate edited copies, offline road network, cached weather outage, optional uploads, playback and account isolation pass. |
| `npm run test:browser:design` | Appearance persistence, 320px long names, 200% type, reduced motion and invite-only boundary pass. |
| `npm run test:browser:motorcycle` | Selection persistence, failed-write preservation, account switching, route form retention and active/recoverable ride guards pass. |
| `npm run test:browser:ui` | Five tabs/submodes; actual Leaflet instance/camera retention; sheet keyboard/tap/swipe; GPX originals; live/sensors/review; explicit weather/outage cache; past radar/fullscreen; startup/density preferences; iPhone isolation across tabs; responsive layouts pass. No uncaught browser errors. |
| Chromium production-build proofs | `e2e-proof.mjs`: all 25 checks; `e2e-road-context.mjs`: parsing, synchronized limit, overspeed and cache; `e2e-recorder-scroll.mjs`: 885px scroll; `e2e-ai-removed.mjs`: removed AI entry/storage/network checks all pass. |
| Static recorder audit | All 45 checks pass. |
| Timing | Latest UI suite measured 21–59ms tab transitions in mocked desktop Chromium. This supports the <300ms target locally, not a 60 FPS or battery claim. |

The UI suite covers 393×852, 320×740, 430×932 and 852×393 logical viewports and 200% root text. Its actual Leaflet renderer uses visibly labeled synthetic map tiles, not screenshots of a successfully connected map provider. The recorder proofs deliberately return unavailable map/weather fixtures; the separate UI suite covers successful renderer/radar fixture paths.

Local screenshot gallery: `test-results/mm-ui-007/index.html` with 13 current-screen images and the previous landing-page comparison. Raw captures: `%TEMP%/moto-ui-007-XW2yIp`. Audit and browser logs are beside the gallery; production-build recorder artifacts are in `test-results/proof/chromium`. Generated artifacts are ignored by Git. Approved reference images were not available, so before/after comparison is provided without claiming approved-mockup parity.

## Outstanding acceptance and release gates

The frontend migration is implemented and locally validated; the complete work-order acceptance is **not yet signed off**:

1. Graph-aware **Fit to Road** was absent in the existing system and remains visibly unavailable. A reviewed matching/uncertainty/manual-correction pipeline is required to complete that workflow. Existing offline graph routing is not relabeled as track matching.
2. Vehicle telemetry integrations/calibration remain unsupported or experimental; no live RPM, lean, OBD or TPMS data is fabricated. Review metrics depend on actual recorded fields.
3. Supply/inspect approved reference mockups for visual signoff. Test physical iPhone 16 Safari and installed PWA, safe areas, portrait/landscape, larger text, touch/gloves, real GPS, real offline updates, background suspension/recovery and provider failures. WebKit was not run locally.
4. Measure physical-device map gesture FPS, battery use and sustained capture. Local transition measurements alone do not prove these targets.
5. Review high-risk retained-root/access/recorder lifecycle changes before release. Validate invited rider/admin/MFA, disabled features and account transitions on the authorized environment; check that no previous owner's route, weather, graph or motorcycle appears. No new Supabase policy/migration was made.
6. Reconfirm Open-Meteo/RainViewer beta usage and attribution fit the intended release. Real provider availability and account-wide/multi-device quotas were not tested. Preserve existing road-cache freshness checks.
7. Production deployment still requires explicit approval after review. The earlier “Push to Vercel” instruction authorizes a branch preview of this continuation; it does not authorize merging to `main` or a production release. The existing PR is updated around the final redesign scope. Confirm the preview commit and deployment READY state before sharing its URL; the original selector-only preview does not contain this redesign.
