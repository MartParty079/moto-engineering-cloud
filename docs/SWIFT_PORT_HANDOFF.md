# Moto Mission — project definition and Swift port handoff

Updated: 2026-09-23. This document describes the simplified rider app on `feat/slim-rider-app`, based on commit `e1da08e` plus the accompanying cleanup. It supersedes the September 15 handoff. It is a source review, not certification of the live database, sensors, or iPhone behavior.

## 1. Product and scope

Moto Mission is a motorcycle garage, service log, GPS ride recorder, live instrument display, and fullscreen map with GPX tools. The owner wants a small, easy-to-manage app: one Ride screen, one Map screen, no configurable dashboard pages or themes. Torque is an instrument-layout reference; Waze/onX are map-layout references. Their proprietary data, routing, and features are not implemented.

Build a native Swift client while keeping the web app usable. Preserve existing accounts, ownership, UUIDs, stored rides, and mileage semantics. Use compatible backend contracts; do not fork production data or retire the web client without an explicit cutover decision.

There is no Xcode project, native app, signing configuration, or native release in this repository. This handoff defines work to implement, not a completed port.

| Area | Current behavior | Native parity requirement |
|---|---|---|
| Authentication | Email/password sign-in and sign-out; session persistence through Supabase | Existing accounts, refresh/expiry, account isolation, visible errors |
| Garage | List, add, edit motorcycles; year, make, model, odometer in miles | Preserve record IDs and existing fields; cancel never writes |
| Service | Most recent 50 records; add/edit service, motorcycle display name, date, mileage, cost, notes | Compatible payloads; do not silently replace name association with bike UUID |
| Ride history | Most recent 50 sessions; bike, date, distance, duration, average speed | Read current shared records; pagination is a future improvement |
| Ride Center | Single dark instrument screen; bike selection, start/stop, GPS speed beside mapped speed limit, distance, time, heading, altitude, accuracy, road details | Unknown values stay unknown; large touch controls; scroll on short screens |
| Recovery | Interrupted ride resume/finish, pending retry, JSON recovery export, guarded discard | Durable local capture and idempotent upload before visual polish |
| Lean | Opt-in calibrated phone tilt, left/right session peaks, experimental label | Core Motion implementation validated on mounted physical devices; never claim calibrated motorcycle bank angle without evidence |
| Map | Edge-to-edge map, speed and limit top right, tools bottom left, locate/zoom, search and settings | Safe-area controls with map background extending under system areas |
| GPX | Import tracks/routes/waypoints; select segment, rename, reverse, display, convert and export | Preserve coordinates and segment boundaries; explicit saving semantics |

Excluded: engineering/project/PCB/firmware screens, AI, theme selection, multi-page ride layouts, fuel/weather UI, analytics UI, emergency dispatch, OBD/ECU telemetry, vehicle control, CarPlay, offline tile packs, land ownership/trail datasets, road snapping and turn-by-turn guidance. Historical schemas/APIs do not make these active features.

The current shell does **not** expose signup, password reset, MFA enrollment/challenge, account administration, attachments, or saved-ride deletion. Do not copy the old handoff's claims. Native account recovery/MFA support is a release design decision: preserve backend authorization, do not bypass it because the web UI is limited.

## 2. Source, access and environments

- Repository: https://github.com/MartParty079/moto-engineering-cloud
- Production source branch: `main`; current simplified preview branch: `feat/slim-rider-app`.
- Preview: https://moto-engineering-cloud-git-feat-slim-rider-app-nachoandmarty.vercel.app
- Production URL: https://moto-engineering-cloud.vercel.app — may differ from preview.
- Stack: plain ES-module JavaScript, HTML/CSS, Vite; Vercel API handlers; Supabase Auth/Postgres. No React/Next.js.
- Node 22 is used in CI. Use the checked-in package lock, not arbitrary upgrades.
- Current runtime dependencies: `@supabase/supabase-js`, Vite. Database tests use PGlite; local journal tests use fake-indexeddb.
- Leaflet 1.9.4 loads from unpkg at runtime. Map tiles are external; they are not bundled for offline use.
- Read `AGENTS.md`, `docs/REPOSITORY_POLICY.md`, `docs/WEB_SWIFT_COEXISTENCE.md`, and `docs/RIDE_SYNC.md`.

Required access from the owner: repository, an authorized isolated development Supabase project, development Vercel/API configuration, test accounts with verified emails, and later Apple developer team/signing/TestFlight access. Obtain credentials through an approved secret store, never in this document or source control.

Web development:
```sh
npm ci
# Copy .env.example to .env.local and supply authorized DEVELOPMENT values.
npm run dev
npm run audit
node scripts/recording-static-audit.mjs
npm run docs:inventory
```

Vite does not execute `api/`. For end-to-end provider testing use an authorized preview deployment or a separately configured local API runner. Do not interpret an SPA HTML response as API success.

| Configuration | Consumer | Requirement |
|---|---|---|
| VITE_SUPABASE_URL | Web | Development Supabase URL |
| VITE_SUPABASE_PUBLISHABLE_KEY | Web | Matching public client key; legacy VITE_SUPABASE_ANON_KEY takes precedence |
| SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY | API | Matching server-side project configuration; handlers also accept VITE aliases |
| GOOGLE_PLACES_API_KEY | API only | Text place search plus authorized usage allowance |
| GOOGLE_ROADS_API_KEY / TOMTOM_API_KEY | API only | Optional capped road providers |
| Native backend URL, public key, API base URL | Swift build configuration | Separate development/release configurations; public key is not user authorization |

The web client and some handlers contain production-project public fallbacks. Explicitly override BOTH URL and key before development. Never put service-role keys or paid-provider secrets into Swift, the browser, screenshots, logs, or docs.

## 3. Runtime ownership map

| Source | Responsibility | Suggested native owner |
|---|---|---|
| src/main.js | Auth shell; Garage, Service, History CRUD | AppState, AuthService, garage/service repositories |
| src/supabase.js | Client config; localhost-only test mock switch | BackendClient |
| src/gps-shared.js, location-validity.js | Shared GPS broker and validity | LocationService |
| src/ride-center.js | Public ride state/actions and events | RideStore observable state |
| src/ride-recorder.js | Capture lifecycle, serialized local writes, owner changes | RideRecorder actor |
| src/ride-journal.js | Atomic local ride/sample persistence | RideJournal backed by SQLite/Core Data |
| src/ride-runtime.js | Capture locks, stopped-only sync coordinator | CaptureCoordinator and SyncService |
| src/ride-sync.js | Idempotent Supabase protocol | RideSyncService |
| src/ride-dashboard.js + CSS | Fixed instrument screen and recovery controls | RideCenterView |
| src/lean-tracker.js | Calibration, validity, smoothing, peaks | LeanEstimator and MotionService |
| src/ride-road-data.js | Ride road freshness, mapped-limit filtering | RoadContextService |
| src/ride-dashboard-map-page.js + CSS | Map, layers, search, speed HUD | MapView and MapStore |
| src/gpx.js | GPX parsing, conversion, session state, export | GPXParser, GPXDocument, GPXStore |
| src/pwa.js, public/sw.js | Browser installation and caching | No direct native port |
| api/ and server/ | Existing server contracts | Keep server-side; call through URLSession |

Use native observable state and explicit lifecycles, not translations of browser globals, DOM selectors, timers, or monkey-patched geolocation APIs. The generated `docs/APP_INVENTORY.txt` lists remaining source references. `src/supabase-mock.js` is a localhost-only test aid, not a backend or a production data contract.

## 4. Data contracts and units

Three recording tables have a schema-only snapshot in `tests/fixtures/ride-schema.sql`. Apply the additive contract from `supabase/migrations/20260915145159_durable_ride_sync.sql` (verify exact repository filename). Historical migration files and generated base CREATE statements are not a complete live schema.

Before native integration, obtain a reviewed schema-only export of columns, defaults, constraints, indexes, RLS, grants, triggers, RPC signatures, and storage policies for the development environment. Do not apply the test fixture to a real project: its `auth.uid()` is a test stub.

| Entity | Fields used by active app | Identity / caveat |
|---|---|---|
| bikes | id, user_id, name, year, make, model, odometer, created_at; completion updates gps_odometer_miles, rides_since_odometer_confirm | UUID id/owner. Snapshot requires name; current Add bike form does not send name. Resolve against reviewed schema before declaring CRUD parity |
| maintenance | id, user_id, service, bike, service_date, odometer, cost, notes, created_at | Full current schema has not been verified here; bike is a display-name string in the current form |
| ride_sessions | id, user_id, bike_id, bike_name, started_at, ended_at, status, duration_seconds, distance_miles, max_speed_mph, average_speed_mph, end_lat, end_lng, client_sync_version, completion_applied_at | UUID; server status recording/complete/cancelled |
| ride_samples | id, client_sample_id, session_id, user_id, recorded_at, latitude, longitude, altitude_m, accuracy_m, speed_mps, heading_deg | Server id is bigint identity. Retry identity is nullable unique UUID client_sample_id |

Use Codable adapters with explicit snake_case mapping and optional measurements. Do not decode unknown speed/altitude as zero. Handle Postgres numeric representations deliberately; retain precision for mileage/cost. Use 64-bit integers for server sample IDs.

Units: coordinates decimal degrees; sample altitude/accuracy meters; sample speed m/s; heading degrees; summaries and odometer miles/MPH; duration seconds; UTC ISO-8601 timestamps. Browser-local capture times are epoch milliseconds. Screen altitude/accuracy are feet. Cost UI uses dollars. The generic SI guidance in DATA_CONTRACTS does not override these existing legacy field units.

Current distance is Haversine, summed only when both fixes have accuracy <80 m and each step is <0.5 mile. Resume resets the previous fix so gaps do not add a straight connecting distance. GPS speed is accepted from 0–250 MPH; invalid speed remains null. Average speed is the arithmetic mean of valid samples, NOT distance/duration and not time-weighted. Elapsed duration includes interruptions. Document any future metric change instead of silently rewriting history.

## 5. Recorder, persistence and synchronization — mandatory behavior

Local states: idle → recording → pending → synced. A persisted recording with no live capture is presented as interrupted. Discard uses an additional discarding state.

Local database is partitioned by backend origin and owner. Browser database name: `moto-ride-journal-v1:<backend origin>`; ride key [owner,id], sample key [owner,rideId,sequence]. Native storage must preserve this isolation concept, not reuse a shared unscoped queue.

1. Require an authenticated owner and selected owned motorcycle.
2. Acquire exclusive capture ownership. Web uses Web Locks; Swift should use one recorder actor/coordinator.
3. Generate stable session UUID. Atomically persist every sample and summary before acknowledging capture. Capture is limited to approximately 1 GPS sample/second in the web runtime.
4. Storage failure stops capture visibly and retains previously committed data.
5. Account changes release capture and retain old-owner pending data without uploading it under the new account.
6. Stop waits for queued writes, sets pending, persists stop time, then attempts upload. Do not upload a still-recording ride.
7. Resume records an interruption and clears the previous location.
8. Retry pending sync on connectivity recovery; failures remain pending, never falsely “saved to cloud.”

Network protocol (source: ride-sync.js):
- Upsert ride_sessions with stable id, user_id, bike_id/name, started_at, status recording, client_sync_version=1. Conflict id, ignore duplicates.
- Upsert samples in batches ≤100. Map local row.id UUID to client_sample_id; OMIT server bigint id. Conflict client_sample_id, ignore duplicates.
- Delete local sample rows only after server acknowledgement. Lost acknowledgements must replay the same UUIDs.
- Persist completionRequested BEFORE RPC. Then call `complete_ride_v1`.
- Only receipt {session_id: matching UUID, status: "complete"} permits synced state.
- Request timeout is 15 seconds in web sync.
- Never implement separate mileage-update fallback if completion RPC is missing.

RPC arguments:
```text
p_session_id: UUID
p_ended_at: UTC timestamp
p_duration_seconds: integer
p_distance_miles: numeric
p_max_speed_mph: numeric
p_average_speed_mph: numeric
p_end_lat, p_end_lng: nullable double (both null or both present)
p_sample_count: integer (all uploaded samples)
```

The invoker RPC checks owner/version/values/sample count, locks the session, and updates bike mileage plus completion in one transaction. Repeated completion must not repeat mileage. Duration is constrained to 0–2,678,400 seconds; speed ≤250 MPH; distance ≤100,000 miles; end-time/duration consistency tolerance is 2 seconds. Use the migration itself for exact validation.

Discard is prohibited after completionRequested: a lost receipt can hide a committed mileage update. Retry first. A pre-completion discard persists cleanup intent and deletes owned cloud samples/session before removing local data. Do not add saved-ride deletion or mileage reversal without a separate accounting design.

Recovery export format is `moto-local-ride-v1`: local ride metadata and unacknowledged sample rows. Already-acknowledged samples are on the server. There is no recovery import UI. Swift cannot automatically read Safari IndexedDB; synchronize existing rides in web first or build an explicitly validated import tool.

## 6. Map, road context and provider contracts

Map background fills the display. Controls stay inside safe areas, with speed next to limit at top right and a compact tools menu at bottom left. Search, GPX, and Settings are tool tabs. Settings include Street/Terrain/Satellite, follow location and screen-awake toggle. Search/drag pauses following; Locate resumes it. Preserve readable attribution.

Current tiles: OpenStreetMap, OpenTopoMap, Esri World Imagery. Swift could use MapKit plus overlays, or a dedicated map SDK, but provider choice, commercial terms, caching rights, styling, cost and attribution must be reviewed before adoption. Apple maps are not a drop-in source for onX layers. No offline-map licensing has been established.

| Endpoint | Current caller / request | Expected handling |
|---|---|---|
| GET /api/road-info | Ride: lat, lon, provider=osm, optional heading/speed. Map: lat, lon, provider=osm, heading/speed and bearer if available | Road payload includes status, road/type/surface/lanes, limit.mph, limitKind, source/confidence; provider-specific fields can vary |
| GET /api/poi-nearby | Map text search: q, lat/lon at map center; Authorization Bearer session access token | places array with name/address/lat/lon; current UI selects up to 5 valid results |
| GET /api/road-info-live | Retained compatibility endpoint; not called by current shell | Paid-provider path; inspect handler before any reuse |
| GET /api/fuel-nearby | Retained compatibility endpoint; no current UI | Not part of Swift parity |
| POST /api/route-road-cache | Retained compatibility endpoint; no current UI | Does NOT implement GPX route conversion or navigation |
| GET /api/provider-health | Configuration diagnostics | Configured boolean is not proof of live provider success |

Paid providers call Supabase `consume_road_api_request(p_provider)` using user bearer authorization and a public project key. Missing authorization/quota/configuration must not trigger unmetered paid calls. Keep keys on the server. Search q must contain 3–200 characters; malformed coordinates return 400, unsupported methods 405, text-search unavailable 503, upstream failure generally 502. Do not assume every provider failure uses the same status/body.

Map search: manual submit, 1.5-second cooldown, 18-second timeout, 30-query in-memory cache. Current cache is keyed by text, not location; native should include location to avoid reusing results after moving. Results place a marker only, not a navigable route.

Shared Map/Ride refresh: 15 seconds uncached, 60 seconds cached, 5 seconds after heading change or near an observed change zone, fresh received fixes ≤15 seconds, 12-second timeout, cancel on close/background. Retain the whole last successful road during requests/errors/no-match responses. Show Updating during a fresh refresh and Last known after errors, GPS loss, age >45 seconds or displacement >150 m. Expire after 120 seconds from request start or displacement >3 km. A new valid road replaces all fields, even when its limit is unavailable. Only mapped/relation limits are shown; estimates are withheld. Follow posted signs.

Map and Ride use OSM with heading/speed. Both now share the same display retention, expiry, cancellation and limitKind filtering. Mapped limits and road matches are advisory, not authoritative traffic-sign recognition.

### Frequent-road cache and change observations

src/road-cache.js owns local storage keyed by backend and account: moto-road-cache-v1:<backend>:<owner>. It stores only OSM mapped-limit segments, never paid-provider payloads: max 400 segments and 100 observed change points, retained for 30 days. API road-info adds roadId and the selected pair of OSM geometry vertices. A cache hit requires valid GPS accuracy ≤40 m, distance ≤25 m to the segment (no endpoint extrapolation), and heading difference <35°. Ambiguous near-parallel competing matches decline the cache. Changes update on GPS fixes without waiting for a network lookup. Native should port geometry/heading and ambiguity tests, not use a simple radius around old GPS fixes.

Orange map markers indicate the observed new-limit location after consecutive same-named-road matches with different limits, compatible heading, ≤120-second observation gap and <1.5 km separation. This is not the sign location or a surveyed boundary. Near-zone lookup means within 250 m in a compatible travel direction. No corridor download or route prediction is implemented. Cached road provenance/date must stay visible. Map settings can delete the local cache; account switching isolates it without deleting another account's data. Cache data is precise location history on the device: include it in native retention/privacy design.

## 7. GPX contract

Parser accepts GPX XML with namespace-aware local names: trk/trkseg/trkpt, rte/rtept, wpt. Upload cap 5 MB; point cap 50,000 across all entries. Reject malformed XML, non-GPX root, DOCTYPE/entities, missing/nonfinite/out-of-range coordinates. Zero latitude/longitude/elevation are valid. Names must be escaped on export and treated as text in UI.

Every track segment is independently selectable. Segments with fewer than two points are not routes. Never join gaps. Optional elevation is meters. Ascent sums positive consecutive elevation differences and displays feet; missing data is unknown, and noise can inflate gain.

Make route clones the selected track into GPX rte/rtept points and keeps the original. Reverse changes selected point order. Export saves the selected track/route plus imported waypoints as GPX 1.1. Conversion does not simplify, road-snap, calculate directions, or choose legal/ridable paths.

Current files live only in memory, survive map close/reopen, and clear on refresh/sign-out. Export is required to keep changes. Waypoint-only files display but currently cannot be exported through the UI. Timestamps, extensions, metadata, and arbitrary GPX fields are not round-tripped; point coordinates, available elevation/name and selected route name are retained.

Native proposal: Files importer with security-scoped access, bounded XMLParser, local GPX library, and ShareLink/file export. Durable GPX storage would improve the web baseline but is an explicit native enhancement, not existing backend capability. Define retention/delete/export behavior and migration separately.

## 8. Sensors and background behavior

Use Core Location for GPS and Core Motion for orientation. Request permissions in context, explain denials, and allow Garage/Service use without sensors. Plan location usage descriptions, motion usage description, background location mode if required, and a clear active-recording indicator. Confirm current Apple entitlement and review requirements when implementing.

Native background recording is a primary reason for the port, but is NEW work. Verify lock screen, incoming calls, low power, airplane mode, GPS loss, permission revocation, process death and restart. Do not promise recording after force quit; recover a persisted interrupted session honestly.

Lean parity: upright/still calibration, near-vertical screen facing rider; at least 15 samples over 750 ms within 2 degrees for baseline. Screen rotation, invalid mount/sensor, gaps >2 seconds, or >75-degree relative tilt invalidate calibration. Exponential smoothing factor .2; left/right peaks reset at ride start. Backgrounding requires recalibration. Samples and peaks are not written to ride history. A native gravity/attitude implementation must be validated independently; do not blindly map Core Motion axes to browser beta/gamma.

Hardware remains future work: no production ESP32 transport, OBD readout, CAN/K-Line implementation, ECU writes, emergency services or validated bank-angle sensor. Preserve the electrical safety boundaries in HARDWARE_INTERFACE and SAFETY_BOUNDARIES.

## 9. Proposed native structure

Suggested modules (recommendation, not existing Swift code):
- App: environment configuration, dependency assembly, navigation, session state.
- Identity: Supabase auth adapter; Keychain token storage and refresh; owner changes.
- Garage / Service / History: repositories and SwiftUI views; Codable DTOs.
- Ride: recorder actor, transactional journal, sync actor, observable snapshots.
- Sensors: Core Location and Core Motion adapters; independent pure validators.
- Map: rendering adapter, follow state, road context, search, attribution.
- GPX: bounded parser, document model, conversion/export and optional local library.
- Tests: pure calculation fixtures, persistence/retry integration, backend isolation and physical-device acceptance.

Keep UI on MainActor and persistence/network serialized where necessary. Cancellation and generation tokens must prevent old-account or old-screen results from updating current state. Unknown readings use optionals. Keep server-contract DTOs separate from display models.

Storage selection (SQLite/Core Data/SwiftData), minimum iOS version, map SDK and package versions must be decided at kickoff after inspecting toolchain and device requirements. No package versions or Apple policies are certified by this document.

## 10. Implementation sequence and acceptance gates

1. **Environment and contracts:** reproduce web audit; provision dev backend; verify all active schemas/RLS/RPC; settle bike.name and maintenance schema; obtain signing access.
2. **Native foundation:** environment separation, auth/token refresh, sign-out isolation, Garage/Service/History reading and writing compatible records.
3. **Durable Ride:** actor lifecycle, transactional queue, UUID retry protocol and completion RPC. Test failure/restart before building gauges.
4. **Instruments:** fixed dashboard, measured/unknown sensor states, experimental lean calibration and road context.
5. **Map and GPX:** fullscreen safe-area layout, search/layers, import/preview/reverse/convert/export; preserve attribution and geometry.
6. **Device/background:** long physical rides and interrupted lifecycle tests; battery/thermal/storage measurements; accessibility and rotation.
7. **Coexistence and release:** both clients read/write the same dev records; concurrent completion increments mileage once; TestFlight acceptance; reviewed production release.

Acceptance checklist:
- Two verified users cannot access each other's rows, journals, exports, or pending uploads.
- Anonymous/unverified users cannot execute completion or privileged RPCs.
- Garage cancel makes no write; service edits retain existing fields; null data stays null.
- 0° latitude/longitude, invalid/future/stale fixes and unavailable speed are handled explicitly.
- Crash/relaunch recovers pending capture; storage exhaustion stops visibly; reconnect retries.
- Lost sample and completion receipts do not duplicate samples or mileage.
- Account change during every await cannot mix records.
- GPX multi-segment/namespaced/waypoint-only/invalid/oversized files tested; XML entity expansion rejected; conversion/export round-trip geometry checked.
- No false posted limit from an estimate; stale/missing matches become unavailable.
- Phone portrait/landscape, small display, keyboard, notch/home indicator, Dynamic Type and VoiceOver usable.
- Background GPS tested on physical iPhone, not just Simulator.
- Web remains usable; pending browser journals are not cleared by updates.
- Privacy disclosure covers precise location, motion and provider searches; developer reviews retention, account-deletion support and App Store submissions before release.

## 11. Evidence and unresolved blockers

The accompanying cleanup keeps active capture/storage/provider behavior intact, removes unreachable frontend modules/assets and obsolete test drivers, and updates CI references to current suites. Database migrations, stored records, published API handlers and the service worker remain intact.

Cleanup validation: 17 offline tests, eight recording static checks, syntax/interactions, build and diff checks passed. The updated browser suite could not launch because Chromium is missing. Automated tests are not a substitute for hardware and provider tests. Current known gaps:
- Full current maintenance/storage/auth schema export is still required.
- Bike form omits name despite the inspected NOT NULL contract; integration validation must resolve it.
- Active web auth lacks recovery/MFA UI; existing backend requirements still apply.
- Map and Ride now share bounded last-known display behavior; physical-device/provider latency verification remains required.
- GPX parser browser success paths need richer fixture/browser coverage; current offline unit tests cover export/math and early input rejection.
- Current phone lean is not validated motorcycle lean; not persisted.
- Preview “READY” confirms a deployment build, not sensor accuracy or user workflow acceptance.
- Historical release notes describe older commits. Do not treat their browser or schema receipts as fresh evidence for this build.

Backend migration receipt is recorded in DEPLOYMENT_RELEASE.md; it is historical evidence, not a fresh live check. Preserve additive sync columns/RPC during rollback while clients can retry. Revert the cleanup commit to recover deleted source from Git; do not restore deprecated runtime layers by default.

## 12. What to give the next developer

Provide this document, the full repository at the reviewed commit (including package lock, migrations and tests), development environment access, a test iPhone, a representative non-sensitive GPX file, and agreed native scope. Never hand over production secrets in a ZIP or prompt.

Suggested starting brief:

> Build Moto Mission as an additional native SwiftUI client for this repository's simplified rider app. Read docs/SWIFT_PORT_HANDOFF.md and the owning source modules first. Keep the web app and backend compatible. Implement durable GPS capture and idempotent completion before visual parity. Do not recreate deleted engineering/theme screens or claim navigation/hardware capability. Identify schema/access blockers early and prove account isolation, offline recovery and device behavior before production use.
