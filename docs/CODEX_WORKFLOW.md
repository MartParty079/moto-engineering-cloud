# Codex Workflow for Moto Mission

## Purpose

Use Codex as the repository execution agent while keeping engineering authority, safety decisions, and acceptance criteria under human review.

## Recommended operating model

### Chief engineer

- Defines system requirements and constraints
- Decides hardware and vehicle-safety assumptions
- Approves architecture and risk acceptance
- Reviews evidence and authorizes release

### Codex

- Inspects the repository
- Creates implementation plans
- Edits code and documentation
- Runs local checks
- Reviews diffs
- Prepares pull requests
- Investigates CI or deployment failures using available evidence

Codex must not independently approve safety-critical assumptions or represent unverified hardware as functional.

## Initial Codex setup

1. Sign into Codex with the same ChatGPT account used for this project.
2. Connect GitHub and grant access only to `MartParty079/moto-engineering-cloud` initially.
3. Create a Codex cloud environment for the repository.
4. Use the repository root as the working directory.
5. Use the default permission and sandbox settings initially.
6. Configure these setup commands when the environment requires them:

```bash
npm install
```

7. Use this validation command for normal software changes:

```bash
npm run audit
```

8. Do not add production secrets to the environment unless a specific server-side task requires them. Prefer test or development credentials with limited scope.

## Recommended surfaces

- **Codex IDE extension:** focused local edits, debugging, and review beside the code
- **Codex cloud:** longer tasks, isolated branches, parallel investigation, and pull-request preparation
- **Codex desktop app:** supervising multiple agents and worktrees

Use one agent per clearly bounded task. Avoid assigning two agents overlapping ownership of the same files unless they are explicitly exploring alternatives.

## Task packet format

Every task should include:

```markdown
## Outcome
Describe the user-visible or engineering result.

## Current evidence
List the error, screenshot, log, issue, or affected workflow.

## Constraints
List safety rules, compatibility needs, files that must not change, and scope limits.

## Acceptance criteria
Use observable pass/fail statements.

## Validation
List commands and manual checks.

## Deliverable
Ask for a branch, focused commits, summary, diff review, and draft PR.
```

## Standard implementation prompt

```text
Read AGENTS.md, README.md, docs/ENGINEERING_BASELINE.md, and docs/OPERATIONS.md first.

Investigate and implement the following bounded change:
[REQUIREMENT]

Before editing, report:
1. likely root cause,
2. affected files,
3. risk level,
4. validation plan.

Then make the smallest coherent fix. Run npm run audit. Review the final diff for regressions, duplicate patch logic, secret exposure, stale-cache risk, and dishonest connected/success states. Do not merge. Prepare a draft PR with implementation, validation, remaining risk, deployment checks, and rollback notes.
```

## Standard bug-investigation prompt

```text
Read AGENTS.md and the engineering baseline. Reproduce or trace this bug without changing code first:
[BUG AND EVIDENCE]

Identify the owning module and determine whether the failure comes from state, lifecycle, routing, caching, API behavior, or database permissions. Avoid adding another global observer or compatibility patch unless no cleaner owning-module fix exists.

After reporting the root cause and proposed fix, implement the smallest change, run npm run audit, and prepare a draft PR. Include exact evidence for what was and was not reproduced.
```

## Standard architecture prompt

```text
Analyze this proposed change against docs/ENGINEERING_BASELINE.md:
[PROPOSAL]

Do not implement yet. Produce:
- current architecture and affected boundaries,
- alternatives,
- safety and security risks,
- data-model impact,
- migration and rollback implications,
- recommended decision,
- a staged implementation plan with release gates.

Flag every assumption that requires chief-engineer approval.
```

## Pull-request review prompt

```text
Review this pull request against AGENTS.md and docs/ENGINEERING_BASELINE.md. Prioritize correctness, authentication/RLS, secret exposure, API timeout behavior, routing, PWA caching, recursive DOM observers, duplicate patch modules, data loss, and false connected/success states.

Run or inspect relevant checks. Report findings by severity with file and line references. Do not approve or merge if a high-risk issue remains.
```

## First recommended Codex tasks

1. Inventory `src/` modules as core, active feature, compatibility patch, or obsolete.
2. Map all global DOM observers and identify recursion or lifecycle risks.
3. Design a minimal automated smoke-test suite for shell load, authentication boundary, and API input validation.
4. Consolidate ride behavior behind a single documented ride-state service.
5. Define the ESP32 telemetry protocol and offline synchronization contract before firmware implementation.

Run these as separate tasks or agents. The inventory and architecture tasks should precede broad refactors.

## Review and release policy

- Codex may create branches, commits, and draft pull requests.
- A human reviews every diff before merge.
- High-risk changes require explicit post-deployment validation.
- Production readiness requires the release gates in `docs/ENGINEERING_BASELINE.md` and the procedures in `docs/OPERATIONS.md`.
- Hardware or vehicle-interface claims require physical test evidence, not code completion alone.