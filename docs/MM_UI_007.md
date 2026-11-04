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
