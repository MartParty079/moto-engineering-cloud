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
- Edits code and documentation when explicitly authorized
- Runs local checks
- Reviews diffs
- Prepares pull requests when explicitly authorized
- Investigates CI or deployment failures using available evidence

Codex must not independently approve safety-critical assumptions or represent unverified hardware as functional.

## Initial Codex setup

1. Sign into Codex with the same ChatGPT account used for this project.
2. Grant least-privilege, repository-scoped access. Do not grant broader product, organization, or account access when repository-scoped access is sufficient.
3. Create a Codex cloud environment for the repository.
4. Use the repository root as the working directory.
5. Use restrictive permission and sandbox settings by default.
6. Use `npm ci` in clean environments for reproducible installs from `package-lock.json`.
7. Use `npm install` only when intentionally changing dependencies or refreshing the lockfile.
8. Use `npm run audit` as the validation command for normal software changes.
9. Production secrets and production access are prohibited by default.
10. Production credentials require explicit human authorization for the specific task, least privilege, environment scoping, and an approved secret store.
11. Keep development and production credentials separate.
12. Secrets must never enter source files, browser bundles, prompts, logs, screenshots, command output, commits, pull requests, or documentation.
13. Supabase service-role credentials are prohibited unless explicitly authorized for a narrowly defined server-side operation.

## Task authorization boundaries

- Audits, investigations, reviews, and status checks are read-only unless edits are explicitly authorized.
- Read-only tasks must not create branches, edit files, commit, push, open pull requests, merge, deploy, or alter external resources.
- Read-only work does not require a task branch. Editing work requires a task branch.
- External writes require explicit human approval for the specific task.
- Never merge or deploy without explicit human authorization.

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

## Authorization
State whether the task is read-only or explicitly authorizes edits. List any separately authorized external writes.

## Constraints
List safety rules, compatibility needs, files that must not change, and scope limits.

## Acceptance criteria
Use observable pass/fail statements.

## Validation
List commands and manual checks.

## Deliverable
For implementation work, ask for a task branch, focused commits, summary, diff review, and draft PR when those actions are explicitly authorized. For read-only work, ask for an evidence-based report and prohibit repository and external writes.
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

Run git status --short and stop if unrelated changes would overlap the task or cannot be preserved safely. Confirm that editing is occurring on a task branch.

Then make the smallest coherent fix. Run npm run audit. Review the final diff for regressions, duplicate patch logic, secret exposure, stale-cache risk, dishonest connected/success states, and unrelated or pre-existing changes. Do not commit unrelated or pre-existing changes. Do not merge or deploy without explicit human authorization. Prepare a draft PR only when explicitly authorized, with implementation, validation, remaining risk, deployment checks, and rollback notes.
```

## Standard bug-investigation prompt

```text
Read AGENTS.md and the engineering baseline. Reproduce or trace this bug without changing code first:
[BUG AND EVIDENCE]

Identify the owning module and determine whether the failure comes from state, lifecycle, routing, caching, API behavior, or database permissions. Avoid adding another global observer or compatibility patch unless no cleaner owning-module fix exists.

Report the root cause and proposed fix. Include exact evidence for what was and was not reproduced.

This investigation is read-only unless edits are explicitly authorized. If implementation is explicitly authorized, run git status --short, use a task branch, implement the smallest change, run npm run audit, and prepare a draft PR only when explicitly authorized. Never merge or deploy without explicit human authorization.
```

## Standard architecture prompt

```text
Analyze this proposed change against docs/ENGINEERING_BASELINE.md:
[PROPOSAL]

This is a read-only task. Do not create a branch, edit files, commit, push, open a pull request, merge, deploy, or alter external resources. Produce:
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

This review is read-only unless edits are explicitly authorized. Never merge or deploy without explicit human authorization.
```

## First recommended Codex tasks

1. Inventory `src/` modules as core, active feature, compatibility patch, or obsolete.
2. Map all global DOM observers and identify recursion or lifecycle risks.
3. Design a minimal automated smoke-test suite for shell load, authentication boundary, and API input validation.
4. Consolidate ride behavior behind a single documented ride-state service.
5. Define the ESP32 telemetry protocol and offline synchronization contract before firmware implementation.

Run these as separate tasks or agents. The inventory and architecture tasks should precede broad refactors.

## Definition of done for implementation work

Implementation work is complete only when:

- The authorized change is complete on a task branch without unrelated scope expansion.
- Required validation passes, or exact failures and limitations are reported.
- `git status --short` was checked before edits and before preparing a commit or pull request.
- The final diff was reviewed for regressions, secret exposure, and unrelated or pre-existing changes.
- No unrelated or pre-existing change is included in a commit or pull request.
- The summary lists changed files, validation, remaining risk, deployment checks, rollback notes when applicable, and manual follow-up.
- No merge or deployment occurred without explicit human authorization.

## Definition of done for read-only work

Read-only work is complete only when:

- Repository and external state remain unchanged.
- No task branch was required or created.
- The report separates verified evidence, unresolved questions, recommendations, validation limits, and remaining risk.
- Relevant checks were non-mutating and within the task authorization.
- No edit, commit, push, pull request, merge, deployment, or external-resource change occurred.

## Review and release policy

- Codex may create branches and edit files only for explicitly authorized implementation work.
- Commits, pushes, pull requests, and other external writes require explicit human authorization for the specific task.
- Check `git status --short` before edits and before preparing any commit.
- Never include unrelated or pre-existing changes in a commit or pull request.
- A human reviews every diff before merge.
- Never merge or deploy without explicit human authorization.
- High-risk changes require explicit post-deployment validation.
- Production readiness requires the release gates in `docs/ENGINEERING_BASELINE.md` and the procedures in `docs/OPERATIONS.md`.
- Hardware or vehicle-interface claims require physical test evidence, not code completion alone.
