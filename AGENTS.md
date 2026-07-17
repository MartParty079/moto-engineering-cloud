# Moto Mission Agent Instructions

## Mission

Build and stabilize Moto Engineering Cloud as a safe, honest motorcycle engineering platform. Preserve the system boundary and release gates in `docs/ENGINEERING_BASELINE.md`.

## Read before changing code

1. `README.md`
2. `docs/ENGINEERING_BASELINE.md`
3. `docs/OPERATIONS.md`
4. Any nearby documentation or migration notes relevant to the task

## Repository map

- `index.html`: application shell and browser-module loading
- `src/`: browser JavaScript modules and styles
- `api/`: Vercel serverless API routes
- `supabase/`: database migrations, policies, and functions
- `docs/`: architecture, operations, decisions, risks, and validation guidance
- `manifest.webmanifest` and service worker files: PWA installation and caching
- `vercel.json`: routing, caching, and security headers

## Working method

- Start by restating the requested outcome, affected files, risks, and validation plan.
- Inspect the current implementation before proposing replacements.
- Run `git status --short` before editing. Stop if unrelated changes would overlap the task or cannot be preserved safely.
- Make the smallest coherent change that satisfies the requirement.
- Prefer fixing the owning module over adding another global patch or DOM observer.
- Preserve compatibility unless the task explicitly authorizes a breaking change.
- Do not silently remove features, records, migrations, or user-visible behavior.
- Keep comments focused on non-obvious engineering reasons, not line-by-line narration.
- Update documentation when behavior, architecture, risk, setup, or release requirements change.

## Safety and truthfulness rules

- Production secrets and production access are prohibited by default.
- Production credentials require explicit human authorization for the specific task, least privilege, environment scoping, and an approved secret store.
- Secrets must never enter source files, browser bundles, prompts, logs, screenshots, command output, commits, pull requests, or documentation.
- Supabase service-role credentials are prohibited unless explicitly authorized for a narrowly defined server-side operation.
- Browser code may use only publishable client credentials intended for public use.
- Authentication, authorization, malformed telemetry, invalid coordinates, and provider failures must fail closed.
- Experimental or disconnected hardware must remain visibly experimental or disconnected.
- Never fabricate telemetry, provider success, deployment status, test results, or hardware capability.
- Never implement motorcycle ECU write operations unless a task explicitly authorizes them and includes a reviewed safety design.
- Future K-Line or CAN work must preserve electrical isolation and must not allow an ESP32 fault to drive the vehicle bus.
- Treat authentication, RLS, database functions, storage policies, service workers, telemetry ingestion, and secret handling as high-risk areas.

## Development commands

```bash
npm install
npm run dev
npm run check:syntax
npm run check:providers
npm run build
npm run audit
```

Use `npm ci` in clean environments for reproducible installs from `package-lock.json`. Use `npm install` only when intentionally changing dependencies or refreshing the lockfile. If dependencies are already installed, do not reinstall them unnecessarily.

Use `npm run audit` as the default local completion check.

## Task authorization boundaries

- Audits, investigations, reviews, and status checks are read-only unless edits are explicitly authorized.
- Read-only tasks must not create branches, edit files, commit, push, open pull requests, merge, deploy, or alter external resources.
- Read-only work does not require a task branch. Editing work requires a task branch.
- External writes require explicit human approval for the specific task.
- Use least-privilege, repository-scoped access. Do not grant broader product, organization, or account access when repository-scoped access is sufficient.
- Production access is prohibited by default, and development and production credentials must remain separate.
- Never merge or deploy without explicit human authorization.

## Validation by change type

### Browser or UI changes

- Run `npm run audit`.
- Confirm the application shell loads without recursive observers, invisible overlays, or uncaught module errors.
- Check the affected workflow at desktop and narrow mobile widths.
- Confirm unfinished features do not appear operational.

### API changes

- Run `npm run audit`.
- Validate malformed or missing input returns a bounded 4xx response.
- Validate upstream failures and timeouts return bounded errors rather than hanging.
- Keep paid-provider secrets server-side and require authentication where specified.
- Confirm API routes are not intercepted by SPA fallback rules.

### Supabase changes

- Review migration order, idempotency expectations, grants, RLS, trigger functions, and rollback risk.
- Anonymous users must not execute privileged RPC functions.
- Trigger-only functions must not be callable through the client API.
- User records must remain isolated by ownership policy.
- Describe required security-advisor checks in the PR.

### PWA, service worker, or routing changes

- Treat as high risk.
- Verify `index.html` and the service worker are not cached as stale immutable assets.
- Verify `/api/*` remains outside SPA rewrites.
- Include explicit hard-refresh, update, and rollback validation steps.

## Definition of done for implementation work

Implementation work is complete only when:

- The requested behavior is implemented without unrelated scope expansion.
- Relevant validation commands pass, or failures are reported with exact evidence.
- The diff is reviewed for regressions, duplicate logic, stale compatibility patches, and secret exposure.
- `git status --short` is reviewed before edits and before preparing a commit or pull request.
- No unrelated or pre-existing change is included in a commit or pull request.
- High-risk changes include explicit post-deployment checks.
- Material architecture or risk changes update `docs/ENGINEERING_BASELINE.md` or another appropriate document.
- The final summary lists changed files, validation performed, remaining risk, and any manual follow-up.
- No merge or deployment occurs without explicit human authorization.

## Definition of done for read-only work

Read-only work is complete only when:

- The requested evidence was inspected without changing repository or external state.
- Findings distinguish verified facts, unresolved questions, and recommendations.
- Relevant checks were run only when they were non-mutating and authorized.
- No branch, edit, commit, push, pull request, merge, deployment, or external-resource change occurred.
- The final summary lists evidence inspected, findings, validation limits, and remaining risk.

## Git and pull requests

- Read-only work does not require a task branch. Editing work must use a task branch; do not push unreviewed work directly to `main`.
- Check `git status --short` before edits and before preparing any commit.
- Never commit unrelated or pre-existing changes.
- Use focused commits with imperative messages.
- Keep pull requests small enough to review.
- PR descriptions must include: requirement, implementation, validation, risk level, deployment checks, and rollback notes when applicable.
- Do not merge a high-risk change solely because automated checks pass.
- Never merge or deploy without explicit human authorization.

## Chief-engineer escalation

Stop and request an explicit engineering decision when requirements conflict with the baseline, when a safety assumption is missing, when production data could be destroyed, or when a vehicle-interface change could affect physical hardware.
