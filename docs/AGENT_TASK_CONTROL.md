# Agent Task Control API

The task-control API is authenticated with the caller's current Supabase bearer session. Row-level security limits task records to their owner.

## List tasks

`GET /api/agents/tasks?limit=25`

Returns up to 50 newest tasks. Before reading, the endpoint marks the caller's `reserved` tasks older than fifteen minutes as `failed`.

## Read one task

`GET /api/agents/tasks/{taskId}`

Returns the full owned task, including its validated work package and provider state. Unknown or unowned task IDs return `404`.

## Cancel a task

`POST /api/agents/tasks/{taskId}`

```json
{
  "action": "cancel"
}
```

Only `reserved` or `dispatched` tasks may be cancelled. When a dispatched task is linked to a GitHub issue, the API closes that issue with a `not_planned` state reason before marking the Supabase task `cancelled`.

Cancellation does not merge, deploy, delete code, alter production data, or run a worker. It prevents the current queued task from continuing through the dispatcher workflow.

## Known reconciliation limit

If GitHub closes successfully but the database cancellation RPC subsequently fails, provider and local state can temporarily disagree. A future provider-reconciliation job must detect and repair this case before autonomous workers are enabled.
