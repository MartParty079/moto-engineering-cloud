# Moto Mission Architecture

## System boundaries

### Web application
- Presents motorcycle profiles, maintenance data, ride records, engineering tools, and telemetry review.
- Must remain usable when device telemetry is unavailable.
- Must not embed service-role credentials or privileged production secrets.

### Data platform
- Stores user, motorcycle, maintenance, ride, and telemetry records.
- Enforces access through reviewed policies and versioned migrations.
- Treats schema and synchronization changes as compatibility-sensitive.

### ESP32 telemetry device
- Collects GPS and IMU data and later approved vehicle-interface data.
- Buffers records locally when connectivity is unavailable.
- Uses a versioned protocol and explicit units.
- Must fail safely without affecting motorcycle control.

### Vehicle interface
- K-Line and any future bus interfaces are observational by default.
- Transmit behavior requires a separately reviewed requirement and physical test plan.
- Electrical isolation, protection, grounding, and connector assumptions require measured verification.

## Core principles
- Offline-first collection; eventual synchronization.
- Versioned data contracts.
- Least-privilege access.
- No direct agent changes to production.
- Human authorization for merge, deployment, migrations, and vehicle testing.
- Physical evidence for hardware claims.

## Change ownership
- Frontend changes must identify user-visible states and regression checks.
- Data changes must include migration, policy, compatibility, and rollback analysis.
- Firmware changes must include protocol version, resource limits, and bench validation.
- Hardware changes must include ratings, protections, pinout, and physical validation.
