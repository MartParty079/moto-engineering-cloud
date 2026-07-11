# Moto Engineering Cloud v7.3 — PCB Data Load Fix

This patch adds the five PCB tables to the application data-loading list. Previous builds saved the Rev A starter records successfully but did not reload them into the page state.

## Upgrade

1. Replace the GitHub repository files with this package.
2. Commit and allow Vercel to redeploy.
3. Hard-refresh the app.
4. Open PCB Designer. Existing Rev A records should appear immediately.

No new Supabase migration is required if migration_v7.sql already ran.

# Moto Engineering Cloud v7.2 — PCB Starter Display Fix

Fixes stale selected-board IDs, automatically selects the first valid PCB project, and reports any failed starter insert instead of displaying a false success message.

## Deploy

No new migration is required if migration_v7.sql was already run. Replace the repository files and redeploy.

# Moto Engineering Cloud v7.1 — PCB Loading Fix

Fixes the PCB Designer crash caused by rendering before the new Supabase tables finish loading. All PCB collections now default safely to empty arrays.

Deployment:
1. Confirm `supabase/migration_v7.sql` has been run.
2. Replace the GitHub files with this package.
3. Commit and wait for Vercel to redeploy.
4. Hard-refresh the website.

# Moto Engineering Cloud v7 — Rev A PCB Designer

## New PCB Designer module

- Multiple PCB projects and revisions
- Rev A starter architecture
- Interactive ESP32-S3 pin map
- Pin conflict status
- Connector and harness planning
- Component list linked to the main BOM
- Board dimensions and layer count
- Revision history
- Architecture and safety checklist
- Starter records for:
  - ESP32-S3
  - L9637D K-line
  - MCP2562 CAN
  - ICM-42688-P IMU
  - External ADC
  - Automotive power and protection
  - microSD
  - GNSS
  - Nextion/display
  - Suspension and wheel-speed connectors

## Upgrade

1. Run `supabase/migration_v7.sql`.
2. Replace the repository files with this package.
3. Commit and let Vercel redeploy.
4. Open **PCB Designer**.
5. Click **Load Rev A starter**.

The starter intentionally leaves ESP32 GPIO assignments as TBD. Pin selection should be completed after confirming the exact ESP32-S3 module, flash/PSRAM configuration, USB usage, boot-strapping pins, ADC requirements, and peripheral timing.

# Moto Engineering Cloud v6 — Garage Mode

## New Garage Mode

A mobile-first, glove-friendly workspace for use beside the motorcycle:

- Select one active work package
- Take progress photos directly from the iPhone camera
- Record test videos
- Dictate or type an engineering note
- Complete checklist items with large controls
- See required proof and recent files
- Ask the AI about the active task with one button
- Open a live telemetry connection panel
- Refresh project state without leaving Garage Mode

Notes are stored in the Engineering Notebook and linked in their text to the active work package.
Photos and videos are stored as proof attachments on the active package.

The telemetry panel currently reports an honest disconnected state until the ESP32 live-upload backend is built.

## Upgrade

No new database migration is required if v5 is already installed.

1. Replace the existing GitHub repository files with this package.
2. Commit to main.
3. Let Vercel redeploy.
4. Sign in and open **Garage Mode**.
5. Choose an active work package before capturing media or notes.

# Moto Engineering Cloud v4 — Gated Work Packages

## Main change

Roadmap tasks are now Engineering Work Packages with mandatory proof gates.

A work package cannot be marked complete until:

1. Every prerequisite work package is complete.
2. Every checklist item is complete.
3. Acceptance criteria are documented.
4. Results are documented.
5. Every required proof category has enough uploaded files.

## Proof rules

Templates automatically require appropriate evidence:

- Software: source code, design/readme, test evidence
- Electronics: code, physical build photos, test evidence
- Mechanical: CAD, installed photos, validation evidence
- CAD: CAD file, drawing/document, screenshot or physical proof
- Suspension: mount CAD, installed photos, calibration file, dynamic test evidence
- Research: written summary and source material
- Maintenance: before/after photos and service record
- General: at least one completion document

## File support

Task attachments can include:

- Word: DOC/DOCX
- Excel: XLS/XLSX/CSV
- PDF, Markdown, text
- CAD: STEP, SLDPRT, SLDASM, STL, DXF, DWG, IGES, F3D
- Code: INO, CPP, C, H, PY, JS, TS, JSON
- Photos: JPG, PNG, HEIC, WEBP, TIFF
- Video: MP4, MOV, WEBM
- ZIP and other project files

## Upgrade

1. Run `supabase/migration_v4.sql`.
2. Replace the GitHub repository files with this package.
3. Commit to main and let Vercel redeploy.
4. Sign in and click **Refresh workbook**.
5. Existing roadmap items receive structured templates and proof rules.
