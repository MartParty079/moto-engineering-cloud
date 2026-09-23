# Moto Mission

A focused motorcycle app: Garage, Service, Ride history, a fixed live Ride Center, fullscreen Map, and GPX tools. The current simplified build is on `feat/slim-rider-app`; `main` remains the production source.

## Current features

- Email/password sign-in and owner-scoped motorcycle/service records.
- GPS ride recording with durable local recovery and retry-safe cloud completion.
- Dark Ride instruments: GPS speed beside mapped speed limit, distance/time, heading, altitude, accuracy and road data.
- Opt-in experimental phone lean with upright calibration and session peaks. Lean estimates are sampled into the local post-ride review when enabled.
- Fullscreen map with Street/Terrain/Satellite layers, speed/limit, location follow, search, and simple settings.
- GPX import, segment selection, rename, reverse, track-to-route conversion and export. Files are session-only until exported. Conversion preserves geometry; it does not provide directions or road snapping.

No engineering screens, AI, theme selector, editable dashboard pages, OBD telemetry, offline map packs or turn-by-turn navigation are active.

## Developer handoff

Start with [Project definition and Swift port handoff](docs/SWIFT_PORT_HANDOFF.md). It covers screen scope, source ownership, data/API contracts, recording/sync rules, native architecture, access requirements, implementation order and acceptance criteria.

- [Source inventory](docs/APP_INVENTORY.txt)
- [Cleanup record](docs/CLEANUP_REVIEW.md)
- [Durable ride protocol](docs/RIDE_SYNC.md)
- [Web/Swift coexistence](docs/WEB_SWIFT_COEXISTENCE.md)
- [Repository policy](docs/REPOSITORY_POLICY.md)

## Development

Plain JavaScript ES modules + Vite; Supabase Auth/Postgres; Vercel serverless APIs. CI uses Node 22.

```sh
npm ci
# Copy .env.example to .env.local and configure an authorized development project.
npm run dev
npm run audit
node scripts/recording-static-audit.mjs
npm run docs:inventory
```

Override BOTH Supabase URL and public key: existing fallback configuration points to production. Vite does not run api/ handlers. Keep paid-provider secrets server-side. Do not modify production data for testing.

Browser suites require Playwright plus browser binaries, a localhost Vite server at port 5173, and localhost Supabase test configuration at port 54321. They intercept backend traffic; no real account is needed. Run `npm run test:browser` and `npm run test:browser:rides`. Set `E2E_BROWSER=webkit` for WebKit.

## Ride review and GPX export

Stopping a ride opens a review and asks whether to save a GPX track. Ride history includes local pending rides and a Review action for saved rides. Summary cards show distance, duration, average/max GPS MPH, experimental left/right lean, altitude range and above-mapped-limit observations; a paginated table exposes individual measurements and limit sources.

Detailed reviews are local to this browser/device and account. Cloud ride summaries and GPS sync retain their existing contract; lean/limit review metadata is not uploaded. Speeding comparisons require recorded limits, valid speed and GPS accuracy ≤40 m. Last-known/missing limits are excluded; duration counts consecutive valid samples no more than five seconds apart. Coverage is shown. Lean requires enabled/calibrated sensors; gaps are unavailable, not zero. GPX includes coordinates, elevation and UTC times, with separate segments across interruptions or gaps over ten seconds. Export can be repeated from history.

The local journal upgrades additively to IndexedDB version 2, preserving pending rides/samples and copying remaining upload samples into the review store. Already-uploaded older samples cannot be reconstructed locally, so old reviews can be incomplete or summary-only. Review rows survive upload acknowledgement and remain until local data is removed; browser storage quota/eviction still applies. Close old app tabs if an upgrade is blocked. Do not roll back to a version-1-only journal client or clear pending rides to resolve an upgrade.

## Road display refresh

Map and Ride share an account/backend-scoped local OpenStreetMap segment cache (400 segments, 100 observed change markers, 30-day expiry). GPS updates match within a 25 m road corridor with heading within 35 degrees; poor accuracy or ambiguous nearby roads declines the cached match. Opposite travel directions are cached separately. Cached values are labeled and the provider is displayed beside the limit. Nothing is uploaded from this cache; clear it in Map → Settings → Clear saved roads.

Live lookups run every 15 seconds without a cached match, 60 seconds on cached roads, or 5 seconds after a heading change / within 250 m of a heading-compatible observed change marker. Only one request per screen is in flight. These are map-data observations, not surveyed traffic-sign locations. Markers show the new-limit observation point for successive same-named-road matches; they do not predict exact sign boundaries or provide navigation. The cache learns only segments the provider has actually matched, not an entire road corridor in advance.

Last successful details remain visible during failures/lookups. Unmatched last-known values still expire after two minutes or 3 km; current cached segment matches remain explicitly Cached and expire after 30 days. Fresh road matches replace fields together, and unknown limits invalidate previous values for that directed segment. Both screens use OSM with heading/speed and withhold estimated road-class limits.

## Map and iOS

The map fills the viewport with safe-area-aware controls. The manifest requests fullscreen with standalone fallback, and iOS uses black-translucent status-bar metadata. Safari chrome is OS-controlled; use the Home Screen installation. Reload online and relaunch after an update; existing installs may retain older metadata. Physical iPhone verification remains required.

## Release and compatibility

Push reviewed changes to a task branch and verify the matching Vercel preview reaches READY. Production requires a reviewed main release. Check authentication, CRUD, ride recovery, GPX, provider errors, API routing, and mobile layout before promotion.

Do not clear IndexedDB or pending rides during updates. Retain additive sync schema/RPC during rollback. The Swift app must remain compatible with the web client. No database migration is introduced by this cleanup.
