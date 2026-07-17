# Project Operating System

Moto Mission uses issues as executable requirements, isolated branches for implementation, draft pull requests for review, automated validation, and explicit human gates for merge, deployment, production access, and physical testing.

## Core documents
- `ROADMAP.md` — project direction and phases.
- `NEXT_SPRINT.md` — current bounded priorities.
- `ARCHITECTURE.md` — system boundaries.
- `DATA_CONTRACTS.md` — telemetry and synchronization baseline.
- `HARDWARE_INTERFACE.md` — electrical and vehicle-interface baseline.
- `SAFETY_BOUNDARIES.md` — mandatory stop and authorization conditions.
- `AGENT_OPERATIONS.md` — agent roles and permissions.
- `AUTOMATION_RUNBOOK.md` — recurring agent prompts.
- `RELEASE_PROCESS.md` — merge, deployment, validation, and rollback.

## Execution loop

Roadmap → issue → agent-ready gate → isolated implementation → audit → draft PR → independent review → human test where required → human merge → separately authorized deployment.
