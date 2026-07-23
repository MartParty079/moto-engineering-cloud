import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatGitHubIssueBody, validateWorkPackage } from '../lib/agent-dispatch.js';
import { isUuid } from '../lib/agent-api.js';
import { hashLeaseToken, validateResultPayload } from '../lib/agent-worker-api.js';

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
assert.equal(hashLeaseToken('lease-token').length, 64);

const validResult = validateResultPayload({
  status: 'awaiting_review',
  result: {
    summary: 'Prepared documentation changes.',
    filesChanged: ['docs/example.md'],
    checksPerformed: ['npm run audit'],
    evidence: [],
    decisions: [],
    remainingRisks: [],
    approvalNeeded: ['merge'],
    rollback: 'Close the draft pull request.'
  }
});
assert.equal(validResult.ok, true, validResult.errors.join('; '));
assert.equal(validateResultPayload({ status: 'completed', result: {} }).ok, false);

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

const detailSource = await readFile(new URL('../api/agents/tasks/[id].js', import.meta.url), 'utf8');
assert.match(detailSource, /agent_task_results/);
assert.match(detailSource, /\['reserved', 'dispatched', 'claimed', 'running'\]/);

const workerGateway = await readFile(new URL('../api/agents/workers/[worker].js', import.meta.url), 'utf8');
assert.match(workerGateway, /claim_agent_dispatch_task/);
assert.match(workerGateway, /heartbeat_agent_dispatch_task/);
assert.match(workerGateway, /submit_agent_task_result/);
assert.match(workerGateway, /x-agent-worker-token/i);

const workerHelpers = await readFile(new URL('../lib/agent-worker-api.js', import.meta.url), 'utf8');
assert.match(workerHelpers, /AGENT_WORKER_TOKENS_JSON/);
assert.match(workerHelpers, /SUPABASE_AGENT_WORKER_JWT/);
assert.doesNotMatch(workerHelpers, /SUPABASE_SERVICE_ROLE/i);

const executionMigration = await readFile(new URL('../supabase/migrations/20260717161000_agent_worker_execution.sql', import.meta.url), 'utf8');
assert.match(executionMigration, /lease_expires_at/);
assert.match(executionMigration, /interval '10 minutes'/i);
assert.match(executionMigration, /agent_task_results/);
assert.match(executionMigration, /status in \('claimed', 'running'\)/i);

const roleMigration = await readFile(new URL('../supabase/migrations/20260717162000_agent_worker_role.sql', import.meta.url), 'utf8');
assert.match(roleMigration, /create role agent_worker nologin/i);
assert.match(roleMigration, /grant execute on function public\.claim_agent_dispatch_task/i);
assert.match(roleMigration, /revoke all on public\.agent_dispatch_tasks from agent_worker/i);

const cancellationMigration = await readFile(new URL('../supabase/migrations/20260717163000_agent_active_cancellation.sql', import.meta.url), 'utf8');
assert.match(cancellationMigration, /status in \('reserved', 'dispatched', 'claimed', 'running'\)/i);
assert.match(cancellationMigration, /lease_token_hash = null/i);

console.log('Agent dispatch, task control, reconciliation, and worker lifecycle checks passed.');
