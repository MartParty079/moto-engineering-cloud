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
