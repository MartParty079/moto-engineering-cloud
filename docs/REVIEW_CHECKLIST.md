# Review Checklist

## Requirement
- Linked issue exists and is agent-ready or otherwise explicitly authorized.
- Acceptance criteria are measurable.
- Diff matches the stated scope.

## Software
- Clean dependency installation succeeds.
- Audit/build/tests succeed or failures are explicitly documented.
- Error, loading, empty, offline, and permission states are considered.
- No unrelated refactor or generated artifact is included.

## Security and data
- No secret or production credential is exposed.
- Authentication and authorization assumptions are reviewed.
- Schema, policy, migration, sync, deletion, and rollback effects are documented.

## Hardware and vehicle interface
- Ratings, units, pins, protections, and failure behavior are explicit.
- Physical claims include measured evidence or remain marked unverified.
- Vehicle testing is separately authorized.

## Release
- Deployment requirement is explicit.
- Smoke checks and monitoring are defined.
- Rollback is practical.
- Human merge authorization remains required.
