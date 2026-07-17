# Requirement

Link the issue and summarize the requirement.

# Implementation

Describe the bounded implementation and important design decisions.

# Validation

- [ ] `npm ci` completed in a clean environment when dependencies are relevant.
- [ ] `npm run audit` passed.
- [ ] Complete diff reviewed.
- [ ] Acceptance criteria verified.
- [ ] Human testing documented where required.

# Scope control

- [ ] Only issue-scoped files are changed.
- [ ] No unrelated refactor is included.
- [ ] No secrets, credentials, production data, or generated local artifacts are committed.

# Risk

Describe safety, security, authentication, data integrity, hardware, and regression risk.

# Deployment checks

State whether deployment is required, the environment, checks, monitoring, and explicit authorization needed.

# Rollback

Describe how to reverse the change and restore affected data or configuration.

# Agent declaration

- [ ] This PR was opened as a draft by an agent or has received human review.
- [ ] The author did not merge, deploy, or approve unsupported safety-critical assumptions.
