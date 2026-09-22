# Moto Mission

A focused motorcycle app: Garage, Service, Ride history, a fixed live Ride Center, fullscreen Map, and GPX tools. The current simplified build is on `feat/slim-rider-app`; `main` remains the production source.

## Current features

- Email/password sign-in and owner-scoped motorcycle/service records.
- GPS ride recording with durable local recovery and retry-safe cloud completion.
- Dark Ride instruments: GPS speed beside mapped speed limit, distance/time, heading, altitude, accuracy and road data.
- Opt-in experimental phone lean with upright calibration and session peaks. Lean is not saved to ride history.
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

## Map and iOS

The map fills the viewport with safe-area-aware controls. The manifest requests fullscreen with standalone fallback, and iOS uses black-translucent status-bar metadata. Safari chrome is OS-controlled; use the Home Screen installation. Reload online and relaunch after an update; existing installs may retain older metadata. Physical iPhone verification remains required.

## Release and compatibility

Push reviewed changes to a task branch and verify the matching Vercel preview reaches READY. Production requires a reviewed main release. Check authentication, CRUD, ride recovery, GPX, provider errors, API routing, and mobile layout before promotion.

Do not clear IndexedDB or pending rides during updates. Retain additive sync schema/RPC during rollback. The Swift app must remain compatible with the web client. No database migration is introduced by this cleanup.
