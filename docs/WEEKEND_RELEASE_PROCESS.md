# Weekend iPhone Readiness Release Process

## Objective

Ship rapid GUI, iPhone, backend, and security improvements without using production as the development environment.

## Branch model

- `main`: production only; always releasable
- `release/weekend-iphone-readiness`: integration and demonstration candidate
- `feature/<domain>-<change>`: isolated work for GUI, iOS, backend, database, or security
- `hotfix/<issue>`: minimal production correction based on `main`

Feature branches merge into the release branch through small pull requests. The release branch merges into `main` only after the release gate passes.

## Change domains

Keep changes separated by domain so failures can be isolated and reverted:

1. `ui-shell`: navigation, layout, typography, responsive behavior
2. `ride-experience`: ride controls, HUD, Live Activity, CarPlay-facing information
3. `ios-native`: Swift wrapper, permissions, background behavior, signing configuration
4. `data-api`: serverless functions, schemas, synchronization, provider integrations
5. `auth-security`: identity, authorization, RLS, secrets, abuse controls, audit events
6. `legal-privacy`: notices, consent, privacy choices, export, deletion, safety warnings
7. `observability`: structured logs, health checks, error reporting, release markers

Do not combine database migrations, major GUI redesigns, and authentication changes in one pull request.

## Feature flags

Every incomplete or high-risk feature must be disabled by default and independently reversible. Flags must be evaluated server-side for protected behavior; browser-only hiding is not authorization.

Minimum fields:

- stable identifier
- owner
- enabled environments
- allowed roles/users
- kill-switch state
- expected removal date
- fallback behavior

## Pull-request size

Prefer changes that can be reviewed in one sitting. A PR should have one purpose, clear screenshots or behavior notes, rollback instructions, and a bounded test list.

## Preview workflow

Every PR receives a Vercel preview deployment. Validate against test accounts and non-production data where possible. Never place production service-role secrets in preview environments.

Required preview checks:

- clean build and syntax checks
- sign-in, sign-out, session restore, and denied access
- mobile portrait and landscape navigation
- iPhone safe areas, keyboard, screen lock, background, and relaunch
- slow network, offline behavior, and provider timeout
- no cross-user data visibility
- no secrets in HTML, JS bundles, logs, or network responses
- destructive operations require confirmation and ownership verification

## Database workflow

- Prefer additive migrations.
- Apply schema changes through versioned migrations, never manual undocumented edits.
- Add nullable columns before requiring them.
- Deploy readers before writers when formats change.
- Backfill separately and in bounded batches.
- Add constraints only after existing data passes validation.
- Every destructive migration requires a backup and tested recovery plan.

## Release gate

Promotion to `main` requires:

- Vercel preview is `READY`
- automated checks pass
- no unresolved critical or high security findings
- Supabase security advisors reviewed
- RLS verified for each new user-owned table
- production secrets and provider limits verified
- legal/privacy inventory updated for new collection or sharing
- ride-mode safety review completed
- rollback commit or feature kill switch identified
- smoke-test owner named

## Production promotion

Use a squash merge from the release branch into `main` with a release summary. Watch Vercel build and runtime errors. Perform the production smoke test immediately after deployment. If a release gate fails, disable the feature or roll back rather than patching repeatedly in production.

## Demonstration mode

For friends-and-family demonstrations:

- use invited test accounts
- label the product as pre-release
- avoid real emergency contacts and sensitive routes where practical
- disable unfinished admin, sharing, AI, and destructive tools
- seed demonstration data instead of exposing private ride history
- ensure the presenter can disable location recording and delete the demonstration session