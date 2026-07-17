# Moto Mission Engineering Baseline

**Baseline:** V1 stabilization  
**Owner:** Chief Engineer  
**Last reviewed:** 2026-07-16

## Mission

Build a safe, reliable motorcycle engineering platform that records rides, organizes vehicle development, and supports future ESP32-S3 telemetry hardware without overstating unfinished capability.

## V1 system boundary

### Included

- User authentication and per-user data separation
- Motorcycle profiles and garage records
- Maintenance, parts, notes, and engineering work packages
- GPS ride sessions and ride summaries
- IMU-ready telemetry data model
- Route and road-information provider integration
- PCB and connector planning
- PWA installation and mobile-first field use
- Supabase-backed storage and synchronization

### Deferred or experimental

- Production ESP32 live telemetry upload
- BMW CAN integration
- Suspension-position sensing
- Independent wheel-speed sensing
- CarPlay integration
- Automated emergency dispatch
- Any diagnostic write operation to a motorcycle ECU

Experimental features must display an explicit unavailable, disconnected, or beta state. They must not fabricate successful data.

## Architecture

```text
Motorcycle / ESP32-S3
        |
        | future authenticated telemetry transport
        v
Vercel API routes -------- External road/fuel providers
        |
        v
Supabase Auth / Postgres / Storage
        ^
        |
Browser PWA deployed by Vercel
```

## Safety principles

1. **Fail closed:** missing authentication, invalid coordinates, provider failures, or malformed telemetry must not create trusted records.
2. **No direct secret exposure:** paid-provider keys and service-role credentials remain server-side.
3. **Vehicle isolation:** future K-Line/CAN hardware must use automotive-rated protection and must never allow an ESP32 fault to drive a vehicle bus.
4. **Data provenance:** derived values must identify their source and confidence.
5. **Recoverability:** interrupted rides and failed uploads must preserve local data where feasible.
6. **Honest states:** disconnected hardware is shown as disconnected.

## Data domains

- Identity and access
- Motorcycles and configuration
- Maintenance and parts
- Engineering tasks and evidence
- PCB projects, revisions, pins, connectors, and components
- Ride sessions, samples, notes, and alerts
- Provider settings and usage accounting
- Telemetry sources and samples

## Current technical risks

| ID | Risk | Severity | Control |
|---|---|---:|---|
| R-001 | Large number of independently loaded browser patch modules | High | Consolidate by domain and remove obsolete modules after regression tests |
| R-002 | Runtime dependency emits deprecated `url.parse()` warning | Medium | Identify dependency/runtime source and migrate to WHATWG URL API |
| R-003 | PWA cache can preserve stale shells | High | Revalidate `index.html` and service worker; version assets deliberately |
| R-004 | Privileged database functions callable too broadly | High | Restrict grants; run Supabase security advisors after migrations |
| R-005 | Public storage listing can expose object inventory | Medium | Remove broad listing policy; use object URLs or scoped policies |
| R-006 | Provider APIs can fail or return uncertain data | Medium | Timeouts, fallback providers, confidence labels, bounded usage |
| R-007 | Live telemetry backend is incomplete | High | Keep feature gated and report disconnected state |

## Release gates

### Gate A — Application shell

- Loads without recursive observers or blocking overlays
- Navigation works on iOS and desktop
- No module throws during initial load
- Offline or stale cache does not mask a deployment

### Gate B — Data and access

- User data is isolated by RLS
- Anonymous users cannot call privileged RPC functions
- Trigger-only functions are not client executable
- Storage access is intentionally scoped

### Gate C — API

- Invalid input returns 4xx
- Upstream failure returns bounded 5xx response
- Requests have timeouts
- Paid providers require an authenticated user and usage accounting
- API routes remain outside SPA rewrites

### Gate D — Deployment

- Vercel deployment state is `READY`
- Runtime errors are reviewed
- Supabase project is `ACTIVE_HEALTHY`
- Security and performance advisors are reviewed

## Next architecture work

1. Inventory every `src/` module and classify it as core, active feature, compatibility patch, or obsolete.
2. Replace global DOM observers with explicit lifecycle hooks.
3. Consolidate ride modules behind one ride-state service.
4. Introduce a small automated smoke-test suite for shell load, auth, and API validation.
5. Define the ESP32 telemetry protocol and offline synchronization contract before firmware implementation.
