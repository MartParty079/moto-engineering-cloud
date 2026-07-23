create table if not exists public.agent_dispatch_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  worker text not null check (worker in ('software', 'firmware', 'test', 'research', 'documentation', 'security')),
  risk text not null check (risk in ('low', 'medium')),
  title text not null,
  work_package jsonb not null,
  status text not null default 'reserved' check (status in ('reserved', 'dispatched', 'failed', 'cancelled')),
  provider text,
  external_id text,
  external_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.agent_dispatch_tasks enable row level security;

create policy "Users can read their own agent tasks"
on public.agent_dispatch_tasks
for select
to authenticated
using (auth.uid() = user_id);

revoke insert, update, delete on public.agent_dispatch_tasks from anon, authenticated;
grant select on public.agent_dispatch_tasks to authenticated;

create or replace function public.reserve_agent_dispatch_task(
  requested_idempotency_key text,
  requested_worker text,
  requested_risk text,
  requested_title text,
  requested_work_package jsonb
)
returns table (
  task_id uuid,
  task_status text,
  provider text,
  external_id text,
  external_url text,
  is_duplicate boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  existing_task public.agent_dispatch_tasks%rowtype;
  new_task public.agent_dispatch_tasks%rowtype;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if requested_worker not in ('software', 'firmware', 'test', 'research', 'documentation', 'security')
    or requested_risk not in ('low', 'medium') then
    raise exception 'invalid worker or risk' using errcode = '22023';
  end if;

  if requested_idempotency_key is null
    or length(trim(requested_idempotency_key)) < 8
    or length(requested_idempotency_key) > 128 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller_id::text, 0));

  select * into existing_task
  from public.agent_dispatch_tasks
  where user_id = caller_id
    and idempotency_key = trim(requested_idempotency_key);

  if found then
    return query select
      existing_task.id,
      existing_task.status,
      existing_task.provider,
      existing_task.external_id,
      existing_task.external_url,
      true;
    return;
  end if;

  if (
    select count(*)
    from public.agent_dispatch_tasks
    where user_id = caller_id
      and created_at >= now() - interval '1 hour'
  ) >= 10 then
    raise exception 'agent dispatch rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.agent_dispatch_tasks (
    user_id,
    idempotency_key,
    worker,
    risk,
    title,
    work_package
  ) values (
    caller_id,
    trim(requested_idempotency_key),
    requested_worker,
    requested_risk,
    requested_title,
    requested_work_package
  )
  returning * into new_task;

  return query select
    new_task.id,
    new_task.status,
    new_task.provider,
    new_task.external_id,
    new_task.external_url,
    false;
end;
$$;

create or replace function public.finalize_agent_dispatch_task(
  requested_task_id uuid,
  requested_status text,
  requested_provider text,
  requested_external_id text default null,
  requested_external_url text default null,
  requested_error_message text default null
)
returns public.agent_dispatch_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  updated_task public.agent_dispatch_tasks%rowtype;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if requested_status not in ('dispatched', 'failed', 'cancelled') then
    raise exception 'invalid task transition' using errcode = '22023';
  end if;

  update public.agent_dispatch_tasks
  set
    status = requested_status,
    provider = nullif(trim(requested_provider), ''),
    external_id = nullif(trim(requested_external_id), ''),
    external_url = nullif(trim(requested_external_url), ''),
    error_message = nullif(left(requested_error_message, 1000), ''),
    updated_at = now()
  where id = requested_task_id
    and user_id = caller_id
    and status = 'reserved'
  returning * into updated_task;

  if not found then
    raise exception 'task is not reserved by the caller' using errcode = 'P0002';
  end if;

  return updated_task;
end;
$$;

revoke all on function public.reserve_agent_dispatch_task(text, text, text, text, jsonb) from public, anon;
grant execute on function public.reserve_agent_dispatch_task(text, text, text, text, jsonb) to authenticated;

revoke all on function public.finalize_agent_dispatch_task(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.finalize_agent_dispatch_task(uuid, text, text, text, text, text) to authenticated;

comment on table public.agent_dispatch_tasks is
  'Auditable, user-owned reservations and provider results for bounded engineering-agent work packages.';

comment on function public.reserve_agent_dispatch_task(text, text, text, text, jsonb) is
  'Atomically applies per-user idempotency and a limit of ten dispatch reservations per hour.';

comment on function public.finalize_agent_dispatch_task(uuid, text, text, text, text, text) is
  'Allows only the owning authenticated user to move a reserved task into a terminal dispatch state.';
