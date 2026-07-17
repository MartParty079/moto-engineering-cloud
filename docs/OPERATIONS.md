# Production Operations

## Services

- GitHub: source of truth
- Vercel: frontend and serverless API deployment
- Supabase: authentication, Postgres, storage, and RPC functions

## Deployment

1. Merge or commit a coherent change to `main`.
2. Confirm Vercel creates a production deployment.
3. Confirm deployment state is `READY`.
4. Review runtime error clusters for the deployment.
5. Test the application shell, authentication, Garage, Ride Center, and one API endpoint.
6. Run Supabase security and performance advisors after schema or permission changes.

## Smoke tests

### Application shell

- Open the root URL in a private browser session.
- Confirm the sign-in boundary renders.
- Confirm no page is permanently blocked by an invisible overlay.
- Confirm navigation remains usable after install as a PWA.

### Authenticated application

- Sign in.
- Load motorcycles, parts, maintenance, tasks, and PCB projects.
- Refresh the page and confirm the selected state does not reference deleted records.
- Confirm experimental telemetry reports disconnected rather than connected.

### API validation

- Call road and fuel endpoints with missing coordinates; expect HTTP 400.
- Call authenticated paid-provider flow without a token; expect denial.
- Confirm an upstream timeout returns a bounded error rather than hanging.

### Database validation

- Anonymous clients cannot execute privileged RPC functions.
- Authenticated users can execute only intended user-scoped RPC functions.
- Trigger functions cannot be invoked through the REST API.
- Public storage URLs work only where intended; bucket-wide object listing is not exposed.

## Incident response

1. Identify whether the fault is browser, Vercel API, Supabase, or external provider.
2. Preserve the failing deployment ID and commit SHA.
3. Review Vercel runtime error clusters and logs.
4. Review Supabase logs for the relevant service.
5. Roll back only when the current production build is materially unsafe or unusable.
6. Record the root cause and permanent corrective action.

## Secret handling

- Store paid-provider keys in Vercel environment variables.
- Store service credentials only in server-side environments.
- Browser code may use only the Supabase publishable key.
- Never place a Supabase service-role key in `src/`, `index.html`, or public API responses.

## Change classification

- **Low risk:** documentation, visual copy, nonfunctional styling
- **Medium risk:** client module behavior, caching, routing, provider selection
- **High risk:** authentication, RLS, database functions, storage policies, service worker, telemetry ingestion

High-risk changes require explicit post-deployment validation.
