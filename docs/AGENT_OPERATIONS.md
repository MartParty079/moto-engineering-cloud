# Agent Operations

## Roles

### Chief Engineer
Converts goals into requirements, identifies dependencies and safety constraints, maintains architecture, and decomposes work into issues.

### Frontend Agent
Owns interface behavior, mobile usability, accessibility, PWA behavior, and visual consistency.

### Data Agent
Owns schemas, migrations, access policies, synchronization contracts, and data integrity. Production access is prohibited unless explicitly authorized for one task.

### Firmware and Telemetry Agent
Owns ESP32 firmware structure, sensor drivers, buffering, protocol implementation, and bench-test tooling.

### QA and Review Agent
Reproduces defects, validates acceptance criteria, inspects diffs and checks, and flags regressions or unsupported hardware claims.

### Project Manager Agent
Triages issues, identifies blockers, reports progress, and proposes priorities. It does not merge or deploy.

## Standard workflow

1. Create or refine an issue.
2. State acceptance criteria, dependencies, risks, and validation evidence.
3. Apply `agent-ready` only when the issue is bounded and executable.
4. Work on an isolated branch or worktree.
5. Run `npm ci` in a clean environment and `npm run audit` before review.
6. Review the complete diff and confirm scope.
7. Open a draft pull request.
8. Use an independent review pass for safety-sensitive work.
9. Require human approval before merge or deployment.

## Agent-ready definition

An issue is agent-ready only when it contains:
- a clear problem statement;
- in-scope and out-of-scope boundaries;
- measurable acceptance criteria;
- known dependencies;
- validation instructions;
- safety, security, data, and deployment constraints;
- no unresolved product decision that would materially change implementation.

## Automation policies

### Daily project brief
Read-only. Summarize recent merges, open PRs, failed checks, blocked issues, and the three highest-value next tasks.

### Issue worker
May select only an open `agent-ready` issue, create an isolated branch, implement within scope, run validation, and open a draft PR. It may not merge, deploy, or access production credentials.

### PR reviewer
Read-only except for review comments. Check issue alignment, scope, tests, secrets, authentication, data changes, hardware assumptions, documentation, and rollback.

### CI investigator
Read-only by default. Summarize the failure and propose a bounded correction. A code change requires a separate authorized task.

## Prohibited autonomous actions
- pushing directly to `main`;
- merging or deploying;
- changing production data or credentials;
- approving safety-critical assumptions without physical evidence;
- expanding issue scope without human approval;
- treating generated output as validation evidence when the relevant test did not run.
