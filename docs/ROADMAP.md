# Moto Mission Roadmap

## Mission

Build a reliable motorcycle engineering platform that combines ride logging, motorcycle records, diagnostics, hardware telemetry, and engineering tools without compromising rider safety or data integrity.

## Current phase — Foundation

### R001: Hardware selection and pinout
- Finalize ESP32-S3 board, GPS, IMU, power, storage, and K-Line interface hardware.
- Publish a reviewed pinout and wiring diagram.
- Exclude wheel-speed and suspension sensing until a later phase.

### R002: Prototype wiring and verification
- Assemble the bench prototype.
- Verify power rails, signal levels, GPS reception, IMU communication, storage, and K-Line electrical behavior.
- Record measured evidence before firmware integration.

### R003: Data contract before implementation
- Define telemetry records, units, timestamps, identifiers, quality flags, and offline synchronization behavior.
- Version the protocol before app and firmware implementation.

## Next phase — Minimum useful system
- Stable ride logging with GPS and IMU data.
- Offline-first buffering and safe retry behavior.
- Ride review in the web application.
- Motorcycle profile and maintenance records.
- Clear failure states and exportable data.

## Later phases
- K-Line vehicle data integration.
- Automatic mileage synchronization.
- iOS companion application.
- CarPlay support.
- Additional validated sensors.

## Delivery rules
- Every roadmap item must have an issue with acceptance criteria.
- Work begins only when dependencies and safety assumptions are explicit.
- Software completion does not prove hardware behavior.
- Production changes require explicit human authorization.
- Agents may open draft pull requests but may not merge or deploy without approval.
