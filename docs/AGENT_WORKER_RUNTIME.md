# Agent Worker Runtime

The worker runtime provides a controlled execution contract. It does not implement a worker, run shell commands, create branches, or modify repository files.

## Worker gateway

`POST /api/agents/workers/{worker}`

Every request requires `X-Agent-Worker-Token`. Tokens are configured server-side in `AGENT_WORKER_TOKENS_JSON` and are restricted by worker type.

The gateway uses `SUPABASE_AGENT_WORKER_JWT`, a custom JWT with database role `agent_worker`. That role has no table privileges and may execute only the claim, heartbeat, and result RPCs.

## Claim

```json
{
  "action": "claim",
  "taskId": "task UUID",
  "claimedBy": "documentation-worker-01"
}
```

A claim succeeds only when the task worker matches and the task is dispatched or has an expired prior lease. The response returns a random lease token exactly once. Only its SHA-256 hash is stored.

## Heartbeat

```json
{
  "action": "heartbeat",
  "taskId": "task UUID",
  "leaseToken": "returned claim token",
  "status": "running"
}
```

A valid heartbeat renews the lease for ten minutes. Expired or mismatched leases fail closed.

## Result

```json
{
  "action": "result",
  "taskId": "task UUID",
  "leaseToken": "returned claim token",
  "status": "awaiting_review",
  "result": {
    "summary": "Prepared the requested documentation update.",
    "filesChanged": ["docs/example.md"],
    "checksPerformed": ["npm run audit"],
    "evidence": [],
    "decisions": [],
    "remainingRisks": [],
    "approvalNeeded": ["merge"],
    "rollback": "Close the draft pull request."
  }
}
```

Submitting a result stores the structured result, transitions the task, and invalidates the lease. Users can read the result through `GET /api/agents/tasks/{taskId}`.

## Lifecycle

```text
dispatched -> claimed -> running -> awaiting_review -> completed
                          |                |
                          +-> blocked      +-> cancelled by owner
                          +-> failed
```

An owner may cancel a queued or leased task. Cancellation clears the lease so a late worker heartbeat or result cannot be accepted.

## Required configuration

- `AGENT_WORKER_TOKENS_JSON`: JSON object mapping worker type to a long random gateway token.
- `SUPABASE_AGENT_WORKER_JWT`: server-only custom JWT with role claim `agent_worker`.
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The custom JWT must not use `service_role`. Its mapped database role has only the three explicit RPC grants defined by migration.
