# Moto Mission Agent Orchestration

**Status:** Phase 1 foundation plus persistent Phase 2 dispatcher  
**Owner:** Project owner with chief-engineer review  
**Scope:** Repository work, research, validation, and documentation

## Purpose

Moto Mission uses a chief-engineer orchestrator to convert a project goal into bounded tasks for specialized workers. The orchestrator does not grant workers unrestricted production or vehicle access. It creates an auditable work package, dispatches the smallest suitable worker, evaluates evidence, and returns a recommendation to the project owner.

## Control model

```text
Project owner
     |
     v
Chief-engineer orchestrator
     |
     +-- software worker
     +-- firmware worker
     +-- test worker
     +-- research worker
     +-- documentation worker
     +-- security reviewer
     |
     v
Branch / pull request / evidence
     |
     v
Human approval for merge, deployment, migrations, or vehicle outputs
```

## Initial implementation

The first implementation uses GitHub as the task bus and audit trail:

1. A structured GitHub issue defines the work package.
2. The issue title identifies the requested worker and risk class.
3. The worker performs only the authorized scope on a task branch.
4. The worker opens a pull request containing implementation and evidence.
5. The chief-engineer review checks architecture, safety, tests, and scope.
6. The project owner explicitly authorizes merge or deployment.

The authenticated endpoint `POST /api/agents/dispatch` creates these bounded GitHub work packages. It does not execute arbitrary prompts, run shell commands, create branches, merge pull requests, deploy, access production secrets, change production data, or actuate motorcycle hardware.

Each request is first reserved in Supabase. The reservation supplies a durable audit record, per-user duplicate suppression, and a rate limit before the GitHub provider is called.

## Dispatcher configuration

The Vercel runtime requires:

- `SUPABASE_URL`: Supabase project URL used to verify the caller session and access guarded task RPCs.
- `SUPABASE_ANON_KEY`: publishable Supabase key used with the caller's bearer session.
- `GITHUB_AGENT_TOKEN`: repository-scoped server-side token permitted to create issues in `MartParty079/moto-engineering-cloud`.

`GITHUB_AGENT_TOKEN` must remain server-side and should have only the minimum issue permission needed. It must not have deployment, administration, secret-management, or broad organization access.

The request must include:

- The current Supabase access token as `Authorization: Bearer <token>`.
- A unique `Idempotency-Key` header between 8 and 128 characters.
- A JSON work package:

```json
{
  "worker": "software",
  "risk": "medium",
  "title": "Add telemetry schema tests",
  "goal": "Add deterministic tests for the telemetry parser.",
  "scope": "Inspect the parser and add isolated tests on a task branch.",
  "acceptanceCriteria": "Tests cover valid, malformed, and partial packets.",
  "constraints": "Follow AGENTS.md and do not change deployment configuration.",
  "exclusions": "No dependency upgrade.",
  "evidence": "Report exact commands and results.",
  "rollback": "Revert the task branch."
}
```

The dispatcher rejects unknown worker types, high-risk packages, missing required fields, oversized input, protected actions, missing idempotency keys, and requests above ten reservations per user per hour.

Repeated requests with the same user and idempotency key return the existing task instead of creating a second GitHub issue. A reserved task may transition only to `dispatched`, `failed`, or `cancelled` through the guarded finalization function.

## Worker types

| Worker | Primary scope | Prohibited by default |
|---|---|---|
| Software | PWA, Vercel APIs, Supabase client integration | Production secrets, deployment, unapproved migrations |
| Firmware | ESP32-S3 modules, telemetry, sensor drivers | Energizing vehicle outputs, ECU writes, unreviewed flashing |
| Test | Tests, repro cases, CI checks, validation reports | Changing product behavior outside testability fixes |
| Research | Datasheets, standards, compatible parts, comparisons | Purchasing, vendor commitments, unsupported claims |
| Documentation | BOM, roadmap, baseline, procedures, release notes | Marking experimental features as complete |
| Security | Auth, RLS, API boundaries, threats, secret exposure | Broadening permissions without explicit approval |

## Work-package schema

Every dispatched task must include:

- `goal`: one measurable outcome
- `worker`: one primary worker type
- `scope`: files, subsystem, or research boundary
- `acceptanceCriteria`: objective completion checks
- `constraints`: compatibility, safety, and architecture rules
- `exclusions`: actions the worker must not perform
- `risk`: low or medium
- `evidence`: commands, screenshots, logs, citations, or measurements
- `rollback`: how to abandon or reverse the task safely

## Dispatch policy

The orchestrator should use one worker when possible. Parallel workers are appropriate only when their write scopes do not overlap. Research and test work may run alongside implementation, but no worker may silently redefine the requirement.

A task must stop for project-owner approval before:

- merging or deploying
- applying a Supabase migration to production
- reading or changing production secrets
- deleting data or resources
- enabling motorcycle ECU writes
- commanding a brake light, relay, starter, throttle, ignition, or other physical output
- changing a safety threshold without documented validation

## Review gates

### Scope gate

- The implementation matches the issue.
- Unrelated refactors are excluded.
- Deferred features remain clearly deferred.

### Engineering gate

- The owning module is changed instead of adding another patch layer.
- Interfaces and failure states are explicit.
- Rollback is practical.

### Evidence gate

- Tests list exact commands and outcomes.
- Research identifies sources and uncertainty.
- Hardware work includes bench-test conditions and measured results.

### Safety gate

- OEM motorcycle functions remain independent where required.
- Reset, sensor failure, and communication loss produce a safe state.
- Vehicle-facing outputs remain disabled until explicit approval and bench validation.

## Agent result contract

Every worker returns:

```json
{
  "status": "completed | blocked | failed",
  "summary": "Concise result",
  "filesChanged": [],
  "checksPerformed": [],
  "evidence": [],
  "decisions": [],
  "remainingRisks": [],
  "approvalNeeded": [],
  "rollback": "How to undo the change"
}
```

## Planned runtime phases

### Phase 1 — GitHub-native control

- Structured agent-task issue template
- Worker and risk encoded in each issue
- Branch and PR workflow
- Chief-engineer review checklist

### Phase 2 — Dispatcher service

Implemented now:

- Authenticated Vercel API endpoint for creating work packages
- Server-side Supabase session verification
- Strict worker, risk, size, and protected-action validation
- GitHub issue provider with bounded repository target
- Persistent user-owned task records
- Per-user idempotency and duplicate suppression
- Atomic limit of ten reservations per user per hour
- Guarded task transitions from `reserved` to terminal dispatch states
- Validation checks included in `npm run audit`

Still required before broader use:

- Task-list and task-detail API endpoints
- Cancellation endpoint and cancellation policy
- Automatic reconciliation for a GitHub issue created before task finalization succeeds
- Evidence and worker-result records
- GitHub App authentication instead of a manually managed token
- A worker adapter that can claim a task and return the result contract

### Phase 3 — Tool orchestration

- MCP or API adapters for GitHub, Vercel, Supabase, and approved research tools
- Worker-specific credentials with least privilege
- Human approval tokens for protected actions
- Policy checks before every external write

## First operational boundary

The first version may persist a task reservation and create a GitHub issue only after an authenticated user submits a valid low- or medium-risk package. It must not automatically execute code, create branches, open pull requests, merge, deploy, modify production data, expose secrets, or actuate motorcycle hardware.
