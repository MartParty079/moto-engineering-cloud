# PRD feature delivery — 9 October 2026

Reference: Moto_Mission_Master_PRD_v1.0.docx. User decisions override the document: retain invitation-only verified access and MFA; defer guest/local accounts; exclude ECU data and controls; use free map/weather services for now. These are web beta implementations, not a declaration that the full native PRD is complete. Current work is local on `feat/prd-features`, without a new deployment or remote migration.

## Implemented behavior

| Requirement | Implementation and limits |
|---|---|
| Original and edited GPX | route-store/route-library/route-editing preserve original bytes and add separate derivatives with lineage. Preview required for trim, split, reverse, merge and coordinate edits. Elevation profiles preserve missing data and segment gaps. Original cloud synchronization remains deferred. |
| Offline route calculation and rerouting | offline-routing/offline-navigation-ui download up to three small OSM networks, radius 0.25–2 km, with bounded response sizes. Local graph search, vector road view, saved destinations, one-way roads and supported turn restrictions work without a backend. Two off-route fixes trigger local rerouting. Outside coverage fails visibly. Distance or constant-speed ETA cost; avoid highways/tolls or require known pavement. Unknown/conditional access, barriers and unsupported restrictions are conservatively excluded. This is not a full regional basemap, closure feed or scenic/elevation optimizer. |
| Guidance and recording | Explicit start/stop guidance, geometric turn prompts and optional speech. Opt-in recording starts the existing recorder for a selected motorcycle. Fresh GPS and known accuracy required; obey actual signs. Browser background capture and helmet hardware behavior need field validation. |
| Route weather | route-weather/UI sample up to eight route locations at estimated arrival times, with configurable rain thresholds and sampled length coverage. Display probability, amount, temperature, wind, previous three completed local days and prorated rolling 72h rain. Explicit fetch/refresh after ETA/reroute; no automatic refresh service. Missing data stays unknown. Model estimates are not ground observations. Cache age and failed refresh remain visible. |
| Mud/dust potential | Explicit surface/drainage/soil inputs; low-confidence uncalibrated mud estimate only with sufficient inputs. Dust remains unknown without moisture/dry-duration evidence. No safe-speed recommendation. Ground calibration remains a gate. |
| Provider cost boundary | server/provider-policy disables paid road/live/POI lookups even when provider keys exist. Free OSM road/POI fallback remains. Weather reserves up to 96 location units per UTC day atomically on this device, counting failed calls. This is not an account/project-wide quota or provider zero-overage guarantee. No paid fallback. |
| Ride lifecycle | Durable pause/resume/finish releases capture while paused; reload preserves recovery. No paused GPS/motion appends. Optional automatic upload and known-unmetered-only policy; unknown network cost defers restrictive automatic upload. Explicit Retry requests manual upload. |
| Review and retention | Full bounded owner-filtered cloud pagination feeds GPS playback, speed graph, capture-gap events, time-weighted speed and quality indicators. Missing historical matched limits exclude speeding assessment; unverified chassis lean stays unavailable. Separate local review cache keeps latest configurable N (default 10), honors pins and reduces older detail only with backup confirmation and summary/sample validation. Original GPX, cloud samples and pending journals are preserved. Compact caches omit detailed events. |
| Cockpit | Navigation/Touring/Performance presets, portrait/landscape layouts, drag/drop and keyboard controls. Complex editing locks while recording unless fresh known GPS indicates stopped. Missing motion measurements display unavailable; phone source is explicit. |
| Media/voice | Local audio player, supported OS Media Session actions and guidance duck/mute/pause/critical policy. Opt-in one-command browser speech with explicit start/stop confirmation. Subscription apps, native Bluetooth/CarPlay and background audio integration remain unavailable. Speech may use an online browser service. |
| Settings/isolation | Owner/project-scoped local preferences for upload, review detail, speeding tolerance, appearance and maneuver voice. Appearance applies after identity validation. Storage namespaces provide app isolation, not device encryption. Storage can be evicted; export valuable originals. |

## Remaining PRD gates

- Guest/local accounts are intentionally deferred. ECU telemetry, diagnostics and controls are excluded.
- Native Swift/background location, BLE/ESP32 transport, calibrated chassis lean and quality provenance, helmet/CarPlay integrations need native implementation and physical tests.
- Large licensed offline regional basemaps, route snapping/freehand road editing, elevation/scenic optimization and offline geocoding are not implemented by the small OSM graph beta.
- Community hazard reporting/moderation, reliable live traffic/enforcement feeds and ground-calibrated mud/dust require real sources and backend workflows. Never fabricate these layers.
- Project-wide atomic provider reservations, provider-side reconciliation, dynamic quotas and multi-device rate enforcement require backend design. Local counters can be cleared and cannot guarantee public provider limits.
- Cross-device route/preference synchronization, server-side retention and persisted per-sample source/calibration/matched-limit metadata need reviewed migrations and RLS validation. Current retention affects only local review copies.
- Weather risk notices apply to explicitly fetched route snapshots. Proactive alerts, route-change subscriptions and scheduled refresh remain deferred.

## Provider terms and data handling

Open-Meteo's free API is for non-commercial use, with published limits of fewer than 10,000 calls/day, 5,000/hour and 600/minute. The present implementation is intended for the private non-commercial beta; commercial launch requires a fresh licensing decision. Attribution and estimate uncertainty are visible. Route sample coordinates are sent only on explicit fetch. See https://open-meteo.com/en/terms and https://open-meteo.com/en/docs.

OSM road geometry uses the community Overpass endpoint with visible ODbL attribution, bounded download area/size/time and no paid fallback. Community endpoint availability is not guaranteed. No standard OSM raster tile bulk download or prefetch is introduced; see https://operations.osmfoundation.org/policies/tiles/. Existing online map resources remain subject to their own policies.

## Validation and release

Run `npm run audit`, `npm run check:providers`, `npm run test:browser`, `npm run test:browser:rides`, `npm run test:browser:gpx`, and `npm run test:browser:prd`. Browser tests use local mocked Supabase/OSM/Open-Meteo endpoints, real Chromium IndexedDB and blocked other network access. Fixtures establish local behavior, not live provider availability, production policy enforcement or field reliability. Provider concurrency tests verify 100 configured-key calls make zero outbound paid requests. Atomic local reservation tests exercise concurrent updates.

Risk is high for recorder, authentication lifecycle and provider behavior. No auth protocol, RLS, database migration or service-worker change is included. Main's background table refresh preserves active route/settings forms; stale loads are discarded across owner changes. Before an authorized release, use disposable development records and actual invited rider/admin accounts: verify MFA and denied features; malformed API input and provider outage; pause/reload/resume/finish and pending uploads; upload-off/manual retry; edited-original byte equality; offline reroute and boundary failure; weather timezone/day/partial-hour behavior; review pinning/backup retention; orientation/parked controls; microphone/audio denial; account switching and local storage failure. Physical iPhone background/GPS and speech/helmet behavior remain manual gates.

Verify hard refresh and installed-PWA updates preserve route stores and pending journals, `/api/*` bypasses SPA rewrites, no stale shell/cache or uncaught module errors appear, and no configured paid provider is contacted. Recheck terms before commercial use. No production credentials are required for local tests.

Rollback: revert the coherent task and deploy the previous reviewed build only after explicit authorization. Preserve IndexedDB and pending ride queues; older frontend versions may not expose the new caches/edited routes. Download valuable originals before downgrade. No database rollback or data deletion is required.


## Local validation evidence

`npm run audit` passed with 25 tests and the production build. `npm run check:providers` passed without configured providers; it makes no claim of live success. All four Chromium suites passed against local mocks: navigation/access, durable pause/reload/recovery and deduplicated sync, GPX originals/complete exports, and the new route editing/weather-outage/offline-routing/playback/preferences/media/isolation workflows. Desktop and 390px mobile checks found no uncaught page errors or horizontal overflow. The recording static audit passed all 45 checks; `git diff --check` passed. Existing observer/generated-button warnings and the large main bundle warning remain. No live provider, production account, native iPhone, physical hardware or deployment check was performed for this task.

Changed files are the route/edit/weather/offline-navigation modules and route stores; ride journal/recorder/runtime/center/review/analysis/GPX/dashboard modules; media/preferences and shared styles/area rendering; the four provider API routes plus server/provider-policy and road-provider-default; package scripts, browser/unit tests and the engineering/GPX/sync/PRD documents. No new independently loaded HTML scripts, dependencies, migrations or service-worker changes were added.


## Design continuation — 13 October 2026

The user requested a complete UI/UX redesign using the supplied `skills-main.zip`, with light and dark modes. See [UI_DESIGN.md](UI_DESIGN.md) for the visual/interaction decisions, owning files, theme persistence, verification and remaining hardware checks. This continues the same uncommitted local task and preserves the PRD work, invitation-only/MFA access and ECU exclusion. No deployment occurred.
