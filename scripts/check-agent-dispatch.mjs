import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatGitHubIssueBody, validateWorkPackage } from '../lib/agent-dispatch.js';
import { isUuid } from '../lib/agent-api.js';

const valid = validateWorkPackage({
  worker: 'software',
  risk: 'medium',
  title: 'Add telemetry schema tests',
  goal: 'Add deterministic tests for the telemetry schema parser.',
  scope: 'Inspect the parser and add isolated tests on a task branch.',
  acceptanceCriteria: 'Tests cover valid, malformed, and partial telemetry packets.',
  constraints: 'Do not alter production data or deployment configuration.',
  exclusions: 'No dependency upgrade.',
  evidence: 'Report commands and results.',
  rollback: 'Revert the task branch.'
});

assert.equal(valid.ok, true, valid.errors.join('; '));
assert.equal(valid.workPackage.worker, 'software');
assert.equal(isUuid('939b205a-d289-4e03-a42e-6e7c753cb73f'), true);
assert.equal(isUuid('not-a-task-id'), false);

const protectedAction = validateWorkPackage({ ...valid.workPackage, goal: 'Merge and deploy the change to production.' });
assert.equal(protectedAction.ok, false);
assert.match(protectedAction.errors.join(' '), /protected action/i);

const highRisk = validateWorkPackage({ ...valid.workPackage, risk: 'high' });
assert.equal(highRisk.ok, false);
assert.match(highRisk.errors.join(' '), /high-risk/i);

const invalidWorker = validateWorkPackage({ ...valid.workPackage, worker: 'unbounded-general-agent' });
assert.equal(invalidWorker.ok, false);

const issueBody = formatGitHubIssueBody(valid.workPackage, 'test-user');
assert.match(issueBody, /no merge, deployment, production access/i);

const dispatchSource = await readFile(new URL('../api/agents/dispatch.js', import.meta.url), 'utf8');
assert.match(dispatchSource, /idempotency-key/i);
assert.match(dispatchSource, /reserve_agent_dispatch_task/);
assert.doesNotMatch(dispatchSource, /SUPABASE_SERVICE_ROLE/i);

const listSource = await readFile(new URL('../api/agents/tasks/index.js', import.meta.url), 'utf8');
assert.match(listSource, /reconcile_stale_agent_dispatch_tasks/);
assert.match(listSource, /Math\.min\(Math\.max\(requestedLimit, 1\), 50\)/);

const detailSource = await readFile(new URL('../api/agents/tasks/[id].js', import.meta.url), 'utf8');
assert.match(detailSource, /reconcile_cancelled_agent_task/);
assert.match(detailSource, /stateReason !== 'not_planned'/);
assert.match(detailSource, /task_reconciliation_failed/);
assert.match(detailSource, /\['cancel', 'reconcile'\]/);

const migrationSource = await readFile(new URL('../supabase/migrations/20260717144500_agent_dispatch_tasks.sql', import.meta.url), 'utf8');
assert.match(migrationSource, /enable row level security/i);
assert.match(migrationSource, /unique \(user_id, idempotency_key\)/i);
assert.match(migrationSource, /pg_advisory_xact_lock/i);
assert.match(migrationSource, />= 10/);
assert.match(migrationSource, /revoke insert, update, delete/i);

const controlMigration = await readFile(new URL('../supabase/migrations/20260717152000_agent_task_control.sql', import.meta.url), 'utf8');
assert.match(controlMigration, /interval '15 minutes'/i);
assert.match(controlMigration, /user_id = caller_id/i);

const reconciliationMigration = await readFile(new URL('../supabase/migrations/20260717161000_agent_task_reconciliation.sql', import.meta.url), 'utf8');
assert.match(reconciliationMigration, /requested_provider_state <> 'closed'/i);
assert.match(reconciliationMigration, /requested_provider_reason <> 'not_planned'/i);
assert.match(reconciliationMigration, /reconciliation_note/i);
assert.match(reconciliationMigration, /status in \('reserved', 'dispatched'\)/i);
assert.match(reconciliationMigration, /user_id = caller_id/i);

console.log('Agent dispatch, task control, and reconciliation validation checks passed.');