alter table public.agent_dispatch_tasks
  add column if not exists reconciliation_note text,
  add column if not exists reconciled_at timestamptz;

create or replace function public.reconcile_cancelled_agent_task(
  requested_task_id uuid,
  requested_provider_state text,
  requested_provider_reason text
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

  if requested_provider_state <> 'closed'
    or requested_provider_reason <> 'not_planned' then
    raise exception 'provider state does not prove cancellation' using errcode = '22023';
  end if;

  update public.agent_dispatch_tasks
  set
    status = 'cancelled',
    error_message = null,
    reconciliation_note = 'Reconciled from GitHub issue closed as not_planned',
    reconciled_at = now(),
    updated_at = now()
  where id = requested_task_id
    and user_id = caller_id
    and provider = 'github-issue'
    and external_id is not null
    and status in ('reserved', 'dispatched')
  returning * into updated_task;

  if not found then
    raise exception 'task is not eligible for cancellation reconciliation' using errcode = 'P0002';
  end if;

  return updated_task;
end;
$$;

revoke all on function public.reconcile_cancelled_agent_task(uuid, text, text) from public, anon;
grant execute on function public.reconcile_cancelled_agent_task(uuid, text, text) to authenticated;

comment on function public.reconcile_cancelled_agent_task(uuid, text, text) is
  'Repairs an owned active task only when GitHub proves the linked issue was closed with state_reason not_planned.';