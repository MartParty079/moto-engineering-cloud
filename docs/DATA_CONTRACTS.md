# Data Contracts

## Status

This document defines the baseline contract that must be refined before firmware and application telemetry implementation.

## Record envelope

Every synchronized record should include:
- `schema_version`;
- stable record identifier;
- device identifier;
- motorcycle identifier when assigned;
- source timestamp in UTC;
- receipt timestamp in UTC;
- source type;
- quality or validity state.

## Units
- Position: decimal degrees.
- Altitude and distance: meters.
- Speed: meters per second.
- Acceleration: meters per second squared.
- Angular rate: radians per second unless a field explicitly declares otherwise.
- Temperature: degrees Celsius.
- Voltage: volts.
- Engine speed: revolutions per minute.

Field names must not rely on an undocumented unit convention.

## Offline synchronization
- Device records are immutable after capture except for synchronization metadata.
- Retries must be idempotent.
- Duplicate record identifiers must not create duplicate measurements.
- Partial upload failure must preserve unsent records.
- Clock uncertainty and invalid sensor states must be represented, not silently discarded.

## Compatibility
- Breaking changes require a new schema version.
- Readers should reject or quarantine unsupported versions rather than guessing.
- Migration and rollback behavior must be documented before production use.

## Open decisions
- Final record grouping and sampling cadence.
- Compression and batch limits.
- Device identity provisioning.
- Retention of raw versus derived IMU data.
- K-Line parameter naming and diagnostic provenance.
