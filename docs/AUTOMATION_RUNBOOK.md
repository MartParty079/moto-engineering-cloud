# Codex Automation Runbook

## Daily project brief

Run read-only each morning.

```text
Review MartParty079/moto-engineering-cloud.
Inspect open issues, open pull requests, failed checks, recently merged work, and blocked tasks.
Return: what changed, what is blocked, the three highest-value tasks, and safety/data/deployment concerns.
Do not modify code, merge, deploy, or access production credentials.
```

## Agent-ready issue worker

Run on demand or on a controlled schedule.

```text
Inspect open issues labeled agent-ready.
Choose the highest-priority issue with complete acceptance criteria and no unresolved dependency.
Create an isolated branch, implement only that issue, run repository validation, review the complete diff, and open a draft pull request.
Do not merge, deploy, access production credentials, or expand scope.
```

## Pull request review agent

Run for newly opened or updated pull requests.

```text
Review the pull request against its linked issue and acceptance criteria.
Check scope, validation, secrets, authentication, data integrity, hardware assumptions, documentation, deployment risk, and rollback.
Leave a review summary and precise comments.
Do not modify the branch, merge, deploy, or approve unsupported safety-critical assumptions.
```

## CI failure investigator

```text
Inspect the failed workflow, logs, triggering commit, and related pull request.
Summarize the first causal failure, likely root cause, affected scope, and a bounded correction.
Do not change code unless a separate task explicitly authorizes implementation.
```

## Weekly roadmap review

```text
Review ROADMAP.md, open issues, merged pull requests, blocked work, and hardware dependencies.
Report milestone progress, stale issues, unresolved decisions, and a proposed next sprint of no more than five items.
Do not modify the repository.
```

## Scheduling guidance

- Daily brief: weekday mornings.
- PR review: event-driven where available; otherwise hourly during active development.
- CI investigator: event-driven or hourly while a check is failing.
- Roadmap review: weekly.
- Issue worker: one task at a time until the team has demonstrated stable review capacity.

All automations must retain human merge and deployment approval.
