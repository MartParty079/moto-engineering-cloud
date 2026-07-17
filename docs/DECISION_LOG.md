# Decision Log

Use this file for durable project decisions that materially affect architecture, safety, data compatibility, hardware, or release behavior.

## Entry template

### YYYY-MM-DD — Decision title
- **Status:** proposed | accepted | superseded
- **Context:**
- **Decision:**
- **Alternatives considered:**
- **Consequences:**
- **Evidence required:**
- **Related issues/PRs:**

## Current decisions

### 2026-07-17 — Human-controlled merge and deployment
- **Status:** accepted
- **Context:** Agents are being introduced for planning, implementation, review, and triage.
- **Decision:** Agents may create branches and draft pull requests, but a human must authorize merge and deployment.
- **Consequences:** Automation remains productive without silently changing production or safety-sensitive behavior.

### 2026-07-17 — Data contract precedes telemetry implementation
- **Status:** accepted
- **Context:** Firmware and web synchronization must agree on identity, units, versioning, timestamps, and retries.
- **Decision:** R003 is completed before broad telemetry coding.
- **Consequences:** Initial implementation is delayed slightly to reduce incompatible firmware and application rework.
