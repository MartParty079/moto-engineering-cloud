# Moto Engineering Cloud

A mobile-first cloud application for:
- Multiple motorcycles
- Maintenance history and due mileage
- Engineering roadmap and capstone tracking
- Parts/BOM and budget
- Engineering notebook
- Ride records
- Photos and videos
- Firmware and hardware revisions
- Multi-device synchronization

## Architecture

- Front end: Vite + vanilla JavaScript
- Authentication: Supabase Auth
- Database: Supabase Postgres
- Media: private Supabase Storage bucket
- Hosting: Vercel, Netlify, Cloudflare Pages, or any static host

## 1. Create the Supabase backend

1. Create a free Supabase project.
2. Open **SQL Editor**.
3. Paste and run `supabase/schema.sql`.
4. In **Authentication > Providers**, keep Email enabled.
5. In **Project Settings > API**, copy:
   - Project URL
   - Publishable/anon key

The SQL enables Row Level Security so each signed-in user can only access their own rows. The storage bucket is private and media paths are restricted to each user's user ID.

## 2. Configure the application

Copy:

`.env.example`

to:

`.env.local`

Fill in:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

The anon/publishable key is intended for browser use when RLS policies are enabled. Never put the Supabase service-role key in this app.

## 3. Run locally

Install Node.js 20 or newer, then:

```
npm install
npm run dev
```

Open the local address shown by Vite.

## 4. Build

```
npm run build
```

The deployable files will be in `dist/`.

## 5. Deploy to Vercel

1. Put this project in a GitHub repository.
2. Import that repository into Vercel.
3. Add the two environment variables in Vercel project settings.
4. Deploy.
5. In Supabase **Authentication > URL Configuration**, add your Vercel URL as a Site URL and Redirect URL.

Vite static applications are directly supported by Vercel. The included `vercel.json` makes client-side navigation fall back to `index.html`.

## 6. Install on iPhone

1. Open the deployed HTTPS URL in Safari.
2. Tap Share.
3. Tap **Add to Home Screen**.
4. Launch it from the new icon.

Camera uploads require HTTPS, which Vercel supplies automatically.

## Current limitations

- Media uploads are stored in the cloud but are not yet associated with a specific bike or ride in the database.
- No automatic ESP32 telemetry upload yet.
- No maintenance reminder notifications yet.
- No team/project sharing yet.
- The PWA manifest is included, but custom app icons are not yet included.

## Recommended next cloud milestones

1. Seed button that imports the CRF450RL/F800GS roadmap and BOM.
2. Maintenance reminder dashboard and email/push alerts.
3. Media metadata table linking files to bikes, tasks, rides, and notes.
4. ESP32 authenticated upload endpoint for ride logs.
5. Ride analytics file processing and plots.
6. Capstone team roles and shared projects.
