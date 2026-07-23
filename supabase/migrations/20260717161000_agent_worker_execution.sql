alter table public.agent_dispatch_tasks
  drop constraint if exists agent_dispatch_tasks_status_check;

alter table public.agent_dispatch_tasks
  add constraint agent_dispatch_tasks_status_check check (
    status in (
      'reserved', 'dispatched', 'claimed', 'running', 'awaiting_review',
      'completed', 'blocked', 'failed', 'cancelled', 'expired'
    )
  );

alter table public.agent_dispatch_tasks
  add column if not exists claimed_by text,
  add column if not exists lease_token_hash text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz;

create table if not exists public.agent_task_results (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.agent_dispatch_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  worker text not null,
  result_status text not null check (result_status in ('awaiting_review', 'completed', 'blocked', 'failed')),
  summary text not null check (length(summary) between 1 and 5000),
  files_changed jsonb not null default '[]'::jsonb,
  checks_performed jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  remaining_risks jsonb not null default '[]'::jsonb,
  approval_needed jsonb not null default '[]'::jsonb,
  rollback text not null check (length(rollback) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_task_results enable row level security;

create policy "Users can read results for their own agent tasks"
on public.agent_task_results
for select
to authenticated
using (auth.uid() = user_id);

revoke insert, update, delete on public.agent_task_results from anon, authenticated;
grant select on public.agent_task_results to authenticated;

create or replace function public.claim_agent_dispatch_task(
  requested_task_id uuid,
  requested_worker text,
  requested_claimed_by text,
  requested_lease_token_hash text
)
returns public.agent_dispatch_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_task public.agent_dispatch_tasks%rowtype;
begin
  if requested_worker not in ('software', 'firmware', 'test', 'research', 'documentation', 'security') then
    raise exception 'invalid worker' using errcode = '22023';
  end if;

  if length(trim(requested_claimed_by)) < 3 or length(requested_claimed_by) > 200
    or length(trim(requested_lease_token_hash)) < 32 then
    raise exception 'invalid claim identity or lease token' using errcode = '22023';
  end if;

  update public.agent_dispatch_tasks
  set
    status = 'claimed',
    claimed_by = trim(requested_claimed_by),
    lease_token_hash = requested_lease_token_hash,
    lease_expires_at = now() + interval '10 minutes',
    started_at = coalesce(started_at, now()),
    updated_at = now()
  where id = requested_task_id
    and worker = requested_worker
    and status in ('dispatched', 'claimed', 'running')
    and (
      status = 'dispatched'
      or lease_expires_at is null
      or lease_expires_at < now()
    )
  returning * into claimed_task;

  if not found then
    raise exception 'task is unavailable for this worker' using errcode = 'P0002';
  end if;

  return claimed_task;
end;
$$;

create or replace function public.heartbeat_agent_dispatch_task(
  requested_task_id uuid,
  requested_worker text,
  requested_lease_token_hash text,
  requested_status text default 'running'
)
returns public.agent_dispatch_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  active_task public.agent_dispatch_tasks%rowtype;
begin
  if requested_status not in ('claimed', 'running') then
    raise exception 'invalid heartbeat status' using errcode = '22023';
  end if;

  update public.agent_dispatch_tasks
  set
    status = requested_status,
    lease_expires_at = now() + interval '10 minutes',
    updated_at = now()
  where id = requested_task_id
    and worker = requested_worker
    and lease_token_hash = requested_lease_token_hash
    and status in ('claimed', 'running')
    and lease_expires_at >= now()
  returning * into active_task;

  if not found then
    raise exception 'worker lease is invalid or expired' using errcode = 'P0002';
  end if;

  return active_task;
end;
$$;

create or replace function public.submit_agent_task_result(
  requested_task_id uuid,
  requested_worker text,
  requested_lease_token_hash text,
  requested_result_status text,
  requested_result jsonb
)
returns public.agent_dispatch_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  task_record public.agent_dispatch_tasks%rowtype;
  final_status text;
begin
  if requested_result_status not in ('awaiting_review', 'completed', 'blocked', 'failed') then
    raise exception 'invalid result status' using errcode = '22023';
  end if;

  select * into task_record
  from public.agent_dispatch_tasks
  where id = requested_task_id
    and worker = requested_worker
    and lease_token_hash = requested_lease_token_hash
    and status in ('claimed', 'running')
    and lease_expires_at >= now()
  for update;

  if not found then
    raise exception 'worker lease is invalid or expired' using errcode = 'P0002';
  end if;

  if nullif(trim(requested_result->>'summary'), '') is null
    or nullif(trim(requested_result->>'rollback'), '') is null then
    raise exception 'summary and rollback are required' using errcode = '22023';
  end if;

  insert into public.agent_task_results (
    task_id, user_id, worker, result_status, summary,
    files_changed, checks_performed, evidence, decisions,
    remaining_risks, approval_needed, rollback
  ) values (
    task_record.id, task_record.user_id, requested_worker, requested_result_status,
    left(requested_result->>'summary', 5000),
    coalesce(requested_result->'filesChanged', '[]'::jsonb),
    coalesce(requested_result->'checksPerformed', '[]'::jsonb),
    coalesce(requested_result->'evidence', '[]'::jsonb),
    coalesce(requested_result->'decisions', '[]'::jsonb),
    coalesce(requested_result->'remainingRisks', '[]'::jsonb),
    coalesce(requested_result->'approvalNeeded', '[]'::jsonb),
    left(requested_result->>'rollback', 5000)
  )
  on conflict (task_id) do update set
    result_status = excluded.result_status,
    summary = excluded.summary,
    files_changed = excluded.files_changed,
    checks_performed = excluded.checks_performed,
    evidence = excluded.evidence,
    decisions = excluded.decisions,
    remaining_risks = excluded.remaining_risks,
    approval_needed = excluded.approval_needed,
    rollback = excluded.rollback,
    updated_at = now();

  final_status := requested_result_status;

  update public.agent_dispatch_tasks
  set
    status = final_status,
    lease_token_hash = null,
    lease_expires_at = null,
    finished_at = case when final_status in ('completed', 'blocked', 'failed') then now() else finished_at end,
    updated_at = now()
  where id = task_record.id
  returning * into task_record;

  return task_record;
end;
$$;

revoke all on function public.claim_agent_dispatch_task(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.heartbeat_agent_dispatch_task(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.submit_agent_task_result(uuid, text, text, text, jsonb) from public, anon, authenticated;

comment on function public.claim_agent_dispatch_task(uuid, text, text, text) is
  'Server-only worker claim with worker matching and a ten-minute renewable lease.';
comment on function public.heartbeat_agent_dispatch_task(uuid, text, text, text) is
  'Server-only lease renewal for the current matching worker and lease token.';
comment on function public.submit_agent_task_result(uuid, text, text, text, jsonb) is
  'Server-only structured result submission that releases the worker lease.';
