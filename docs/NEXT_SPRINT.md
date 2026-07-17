# Initial Execution Sprint

## Goal

Move from repository setup into a verified telemetry architecture and bench-ready hardware plan.

## Sprint items

1. **R003 telemetry contract v0.1**
   - Resolve sampling cadence, batching, identifiers, quality flags, and sync retry behavior.
   - Deliver a versioned contract with example payloads.

2. **R001 hardware BOM and pinout**
   - Finalize ESP32-S3, GPS, IMU, storage, power protection, and K-Line interface selections.
   - Deliver a reviewed BOM, pin map, connector plan, and unresolved-risk list.

3. **Ride Mode defect triage**
   - Reproduce the current Ride Mode error.
   - Capture exact failure state and create a bounded repair issue.

4. **Frontend information architecture cleanup**
   - Define primary navigation and reduce dashboard clutter without changing data behavior.
   - Produce acceptance criteria from current screenshots.

5. **Bench verification plan**
   - Define instruments, test points, expected limits, evidence, and stop conditions for R002.

## Sprint constraint

Only items 1–2 should become agent implementation tasks immediately. Items involving physical hardware or visual acceptance remain `needs-human-test` until evidence is supplied.
