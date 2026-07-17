# Security Policy

## Supported version

Moto Mission is an active pre-release project. Only the current production deployment and the current `main` branch receive security fixes.

## Reporting a vulnerability

Do not open a public issue containing exploit details, secrets, personal data, access tokens, precise user locations, or reproduction data that could harm users.

Report suspected vulnerabilities privately to the project owner through a verified private channel. Include:

- affected component and deployment
- impact and prerequisites
- minimal reproduction steps
- whether credentials or personal data may be exposed
- suggested mitigation, if known

Do not access, alter, download, retain, or disclose data belonging to another user. Stop testing once a vulnerability is demonstrated.

## Response targets

- Critical: acknowledge and contain as soon as practical; production promotion is blocked
- High: prioritize before feature work
- Medium: schedule into the current release cycle
- Low: record and address with maintenance work

These are engineering targets, not guarantees.

## Security principles

- Deny by default
- Least privilege for users, services, database roles, and storage
- Server-side authorization for all protected operations
- No service-role keys, provider secrets, signing keys, or private tokens in browser or mobile bundles
- Row Level Security on user-owned Supabase data
- Short-lived sessions and revocable credentials
- Input validation, output encoding, request limits, and bounded payload sizes
- Feature flags and rapid rollback for risky functionality
- Audit events for sensitive administrative actions
- Separate preview validation from production

## Production release blockers

A release must not be promoted when any of the following is known:

- exposed secret or unrestricted privileged endpoint
- authentication or authorization bypass
- cross-user data access
- uncontrolled precise-location disclosure
- destructive migration without a tested recovery path
- unreviewed third-party SDK collecting user data
- unresolved critical or high-severity vulnerability

## Dependency and secret handling

Dependencies must be pinned through the lockfile and reviewed before upgrades. Secrets belong only in approved Vercel, Supabase, Apple, or local development secret stores. Secrets found in source control must be revoked and rotated; deleting the line is not sufficient.

## Safe-harbor intent

Good-faith research that follows this policy, avoids privacy violations and service disruption, and is reported privately will be treated as authorized for purposes of coordinating a fix. This statement does not waive third-party rights or applicable law.