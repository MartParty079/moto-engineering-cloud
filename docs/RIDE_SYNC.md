# Durable ride synchronization

The recorder stores samples locally before uploading. The migration is reconciled with the inspected recording schema; see DEPLOYMENT_RELEASE.md for remote application receipts.

## Ownership and lifecycle

ride-journal.js owns strict IndexedDB transactions, version 1, database moto-ride-journal-v1:<backend origin>. Ride keys are [owner,id], sample keys [owner,rideId,sequence]. ride-recorder.js serializes GPS/motion writes. ride-runtime.js coordinates Web Locks and uploads stopped rides only. ride-center.js preserves the unified Ride OS API/events; active means capture is running.

State: idle -> recording -> pending -> synced. A persisted recording without capture is interrupted. Resume records a gap and clears the previous fix. GPS samples are limited to one per second; sample and summary commit atomically before acknowledgement. Storage failure pauses capture visibly. Account changes stop capture; pending data retains its owner. iPhone motion remains disabled by the existing stability policy.

## Upload protocol

1. Upsert a stable UUID session with client_sync_version=1, conflict target id, ignore duplicates.
2. Send batches <=100. The server sample id remains bigint identity. Map local UUID row.id to nullable client_sample_id, OMIT server id, and upsert onConflict client_sample_id. Legacy inserts remain compatible.
3. Remove local samples only after acknowledgement. Persist completionRequested before calling complete_ride_v1.
4. The invoker RPC validates owner, version, values, times and sample count; locks the session; increments current bike mileage and finalizes in one transaction. Repetition does not repeat mileage.
5. Only a matching session_id and status complete receipt permits synced state.

Failures retain pending data. There is no separate mileage-write fallback. Discard persists cleanup intent and is prohibited after a completion request: a lost receipt may hide committed mileage. Retry first. Saved-ride deletion still does not reverse mileage.

## Schema and security

tests/fixtures/ride-schema.sql reproduces the three inspected tables and restrictive verified-permanent-user policy. Its auth claim source is a LOCAL TEST stub. No user data was exported. There were no user triggers on these tables. The additive migration preserves RLS and numeric IDs, adds nullable client/session markers and an invoker RPC with PUBLIC/anon execution revoked. Browser TRUNCATE grants are revoked because TRUNCATE bypasses RLS.

Broad owner update privileges remain: this is cooperative retry accounting, not certified odometer accounting. Old clients use separate mileage writes; update them before relying on coordinated concurrent completion. Other historical SQL and storage contracts still need a full reviewed export.

## Validation, retention and rollback

PGlite tests execute the copied schema: repeated migration, legacy rows/inserts, UUID retry deduplication, anonymous/unverified denial, owner isolation, count validation, repeated completion and late-failure rollback. Browser tests use actual Chromium IndexedDB with intercepted localhost-only requests, not real accounts.

Recovery export includes metadata and unacknowledged samples; acknowledged samples are on the server. No import UI exists. Synced metadata remains local. Browser storage can be cleared/evicted and cannot ensure iOS background capture. Physical device/PWA testing remains necessary.

Keep pending journals and additive backend fields during updates. Prefer rolling forward. Never drop version/completion markers or RPC while clients can retry; export/reconcile pending data before a frontend downgrade.
