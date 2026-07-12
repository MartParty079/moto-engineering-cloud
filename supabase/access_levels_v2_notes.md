# Access Levels v2

- Roles: rider, technician, engineer, admin, owner
- Rollout stages: development, testing, beta, production, deprecated, hidden
- New users default to rider
- Oldest existing account is bootstrapped as owner
- Per-user feature grants override base role and rollout stage
- UI observer watches only direct app-root renders to avoid recursive mutation loops
