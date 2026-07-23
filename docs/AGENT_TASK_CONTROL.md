# Agent Task Control API

All routes require `Authorization: Bearer <Supabase access token>`. Row-level security limits task records to their owner.

## List tasks

`GET /api/agents/tasks?limit=25`

Returns the caller's newest tasks. The limit is clamped to 1–50. Before listing, the API marks caller-owned `reserved` tasks older than fifteen minutes as `failed`.

## Read one task

`GET /api/agents/tasks/{taskId}`

Returns the full owned task, including its work package, provider reference, reconciliation note, and timestamps. Unknown or unowned task IDs return `404`.

## Cancel a task

`POST /api/agents/tasks/{taskId}`

```json
{ "action": "cancel" }
```

Only `reserved` or `dispatched` tasks are cancellable. When linked to GitHub, the issue is closed with `state_reason: not_planned` before the local task is finalized as `cancelled`.

If the GitHub close succeeds but normal Supabase cancellation persistence fails, the endpoint immediately attempts guarded reconciliation using the returned provider state.

## Reconcile a cancellation

```json
{ "action": "reconcile" }
```

The API reads the linked GitHub issue and repairs local state only when GitHub proves the issue is both:

- `closed`
- `state_reason: not_planned`

The database RPC also verifies task ownership, provider type, external issue presence, and an active local status. Successful repair records `reconciliation_note` and `reconciled_at`. Completed or ambiguously closed issues are not automatically reclassified.

## Boundary

These routes manage the control record only. They do not execute a worker, merge, deploy, delete code, change production resources, access secrets, or actuate motorcycle hardware.