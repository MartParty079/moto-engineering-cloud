create or replace function public.cancel_agent_dispatch_task(requested_task_id uuid)
returns public.agent_dispatch_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  cancelled_task public.agent_dispatch_tasks%rowtype;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  update public.agent_dispatch_tasks
  set
    status = 'cancelled',
    error_message = null,
    updated_at = now()
  where id = requested_task_id
    and user_id = caller_id
    and status in ('reserved', 'dispatched')
  returning * into cancelled_task;

  if not found then
    raise exception 'task is not cancellable by the caller' using errcode = 'P0002';
  end if;

  return cancelled_task;
end;
$$;

create or replace function public.reconcile_stale_agent_dispatch_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  reconciled_count integer;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  update public.agent_dispatch_tasks
  set
    status = 'failed',
    error_message = 'Dispatch reservation expired before provider confirmation.',
    updated_at = now()
  where user_id = caller_id
    and status = 'reserved'
    and created_at < now() - interval '15 minutes';

  get diagnostics reconciled_count = row_count;
  return reconciled_count;
end;
$$;

revoke all on function public.cancel_agent_dispatch_task(uuid) from public, anon;
grant execute on function public.cancel_agent_dispatch_task(uuid) to authenticated;

revoke all on function public.reconcile_stale_agent_dispatch_tasks() from public, anon;
grant execute on function public.reconcile_stale_agent_dispatch_tasks() to authenticated;

comment on function public.cancel_agent_dispatch_task(uuid) is
  'Allows the owning authenticated user to cancel only reserved or dispatched agent tasks.';

comment on function public.reconcile_stale_agent_dispatch_tasks() is
  'Marks only the caller''s reservations older than fifteen minutes as failed.';
