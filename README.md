# Moto Engineering Cloud v2

This update imports the complete engineering workbook and adds photo/video attachments to roadmap tasks.

## Update an existing deployment

1. In Supabase SQL Editor, run `supabase/migration_v2.sql`.
2. Replace the files in your GitHub repository with this package's files.
3. Commit the changes. Vercel redeploys automatically.
4. Sign in and click **Load/refresh starter project** on the Dashboard.
5. Open Roadmap. Every task has **Add photos/videos**.

The importer is repeatable: it updates matching workbook source IDs rather than intentionally creating duplicates.

## Included workbook sections

- Roadmap
- BOM
- Feature Matrix
- Interfaces
- Power Budget
- Pin Plan
- Data Dictionary
- Test Plan
- Calibration
- Risk Register
- Bike Profiles
- Software Backlog
- Decision Log

## Storage

Task media uses the existing private `project-media` bucket with paths:
`<user-id>/tasks/<task-id>/<file>`

Row-level security keeps task records and attachment metadata isolated per user.
