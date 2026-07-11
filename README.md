# Moto Engineering Cloud v3

## New in v3

- Polished command-center dashboard
- Dedicated bike cards with maintenance, ride, and part counts
- Ordered roadmap with easy setup first
- Roadmap card view and timeline/Gantt view
- Task progress bars
- Task owner and target dates
- Task checklists
- Photos and videos attached to roadmap tasks
- Global search across tasks, parts, notes, maintenance, rides, firmware, and engineering records
- Parts lifecycle: owned, installed, tested
- Notebook timeline
- Better mobile layout

## Upgrade an existing deployment

1. Run `supabase/migration_v3.sql` in Supabase SQL Editor.
2. Replace the GitHub repository files with this package.
3. Commit to `main`; Vercel redeploys automatically.
4. Open the app and click **Apply recommended order**.
5. Click **Load/refresh workbook** to update imported records while preserving existing checklist/progress data where possible.

## Recommended roadmap order

1. Definition and project setup
2. Bench controller, power, storage, IMU, ADC, and display
3. Read-only Honda K-line and BMW CAN
4. Suspension installation and calibration
5. GNSS, synchronized logging, jumps, lap timing, and wheel speed
6. Display, phone app, log transfer, and analysis
7. Quickshifter experiment
8. Wideband and tuning
9. PCB, enclosure, validation, documentation, and capstone report
