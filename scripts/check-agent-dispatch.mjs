import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatGitHubIssueBody, validateWorkPackage } from '../lib/agent-dispatch.js';

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

const protectedAction = validateWorkPackage({
  ...valid.workPackage,
  goal: 'Merge and deploy the change to production.'
});
assert.equal(protectedAction.ok, false);
assert.match(protectedAction.errors.join(' '), /protected action/i);

const highRisk = validateWorkPackage({
  ...valid.workPackage,
  risk: 'high'
});
assert.equal(highRisk.ok, false);
assert.match(highRisk.errors.join(' '), /high-risk/i);

const invalidWorker = validateWorkPackage({
  ...valid.workPackage,
  worker: 'unbounded-general-agent'
});
assert.equal(invalidWorker.ok, false);

const issueBody = formatGitHubIssueBody(valid.workPackage, 'test-user');
assert.match(issueBody, /no merge, deployment, production access/i);
assert.match(issueBody, /Add deterministic tests/);

const dispatchSource = await readFile(new URL('../api/agents/dispatch.js', import.meta.url), 'utf8');
assert.match(dispatchSource, /idempotency-key/i);
assert.match(dispatchSource, /reserve_agent_dispatch_task/);
assert.match(dispatchSource, /finalize_agent_dispatch_task/);
assert.match(dispatchSource, /rate_limit_exceeded/);
assert.doesNotMatch(dispatchSource, /SUPABASE_SERVICE_ROLE/i);

const migrationSource = await readFile(
  new URL('../supabase/migrations/20260717144500_agent_dispatch_tasks.sql', import.meta.url),
  'utf8'
);
assert.match(migrationSource, /enable row level security/i);
assert.match(migrationSource, /unique \(user_id, idempotency_key\)/i);
assert.match(migrationSource, /pg_advisory_xact_lock/i);
assert.match(migrationSource, />= 10/);
assert.match(migrationSource, /revoke insert, update, delete/i);
assert.match(migrationSource, /security definer/i);
assert.match(migrationSource, /status = 'reserved'/i);

console.log('Agent dispatch validation checks passed.');
