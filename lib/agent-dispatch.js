const WORKERS = new Set([
  'software',
  'firmware',
  'test',
  'research',
  'documentation',
  'security'
]);

const RISKS = new Set(['low', 'medium', 'high']);

const PROTECTED_PATTERNS = [
  /\bmerge\b/i,
  /\bdeploy(?:ment)?\b/i,
  /\bproduction\b/i,
  /\bservice[- ]?role\b/i,
  /\bsecret(?:s)?\b/i,
  /\bcredential(?:s)?\b/i,
  /\bdelete\b/i,
  /\bdrop\s+(?:table|schema|database)\b/i,
  /\bforce[- ]?push\b/i,
  /\bflash\s+(?:the\s+)?(?:ecu|motorcycle|bike)\b/i,
  /\bactuat(?:e|ion)\b/i,
  /\bwrite\s+(?:to\s+)?(?:can|k[- ]?line|ecu)\b/i
];

const MAX_LENGTHS = Object.freeze({
  title: 120,
  goal: 2000,
  scope: 3000,
  acceptanceCriteria: 3000,
  constraints: 3000,
  exclusions: 3000,
  evidence: 2000,
  rollback: 2000
});

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function collectText(workPackage) {
  return [
    workPackage.title,
    workPackage.goal,
    workPackage.scope,
    workPackage.acceptanceCriteria,
    workPackage.constraints,
    workPackage.exclusions,
    workPackage.evidence,
    workPackage.rollback
  ].join('\n');
}

export function validateWorkPackage(input) {
  const source = input && typeof input === 'object' ? input : {};
  const workPackage = {
    worker: cleanString(source.worker).toLowerCase(),
    risk: cleanString(source.risk).toLowerCase(),
    title: cleanString(source.title),
    goal: cleanString(source.goal),
    scope: cleanString(source.scope),
    acceptanceCriteria: cleanString(source.acceptanceCriteria),
    constraints: cleanString(source.constraints),
    exclusions: cleanString(source.exclusions),
    evidence: cleanString(source.evidence),
    rollback: cleanString(source.rollback)
  };

  const errors = [];

  if (!WORKERS.has(workPackage.worker)) {
    errors.push(`worker must be one of: ${[...WORKERS].join(', ')}`);
  }

  if (!RISKS.has(workPackage.risk)) {
    errors.push(`risk must be one of: ${[...RISKS].join(', ')}`);
  }

  for (const field of ['title', 'goal', 'scope', 'acceptanceCriteria']) {
    if (!workPackage[field]) errors.push(`${field} is required`);
  }

  for (const [field, max] of Object.entries(MAX_LENGTHS)) {
    if (workPackage[field].length > max) {
      errors.push(`${field} must be ${max} characters or fewer`);
    }
  }

  const protectedMatch = PROTECTED_PATTERNS.find((pattern) => pattern.test(collectText(workPackage)));
  if (protectedMatch) {
    errors.push('work package requests or references a protected action that requires separate human authorization');
  }

  if (workPackage.risk === 'high') {
    errors.push('high-risk work packages require direct chief-engineer review and cannot be dispatched automatically');
  }

  return {
    ok: errors.length === 0,
    errors,
    workPackage
  };
}

export function formatGitHubIssueBody(workPackage, requestedBy) {
  return [
    '## Agent assignment',
    '',
    `- **Worker:** ${workPackage.worker}`,
    `- **Risk:** ${workPackage.risk}`,
    `- **Requested by:** ${requestedBy}`,
    '- **Authorization:** analysis and implementation within this issue only; no merge, deployment, production access, secret access, destructive operation, or vehicle actuation',
    '',
    '## Goal',
    workPackage.goal,
    '',
    '## Scope',
    workPackage.scope,
    '',
    '## Acceptance criteria',
    workPackage.acceptanceCriteria,
    '',
    '## Constraints',
    workPackage.constraints || 'Follow AGENTS.md and the engineering baseline.',
    '',
    '## Explicit exclusions',
    workPackage.exclusions || 'No protected actions.',
    '',
    '## Required evidence',
    workPackage.evidence || 'List files inspected or changed, validation performed, exact failures, and remaining risk.',
    '',
    '## Rollback',
    workPackage.rollback || 'Close the issue or revert the task branch without merging.',
    '',
    '## Completion contract',
    '- Return a concise result summary.',
    '- Distinguish verified facts from assumptions.',
    '- Do not expand scope without a new authorization.',
    '- Stop and escalate if the task reaches a protected action or conflicts with the engineering baseline.'
  ].join('\n');
}
