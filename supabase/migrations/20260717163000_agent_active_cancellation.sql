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
    lease_token_hash = null,
    lease_expires_at = null,
    finished_at = now(),
    error_message = null,
    updated_at = now()
  where id = requested_task_id
    and user_id = caller_id
    and status in ('reserved', 'dispatched', 'claimed', 'running')
  returning * into cancelled_task;

  if not found then
    raise exception 'task is not cancellable by the caller' using errcode = 'P0002';
  end if;

  return cancelled_task;
end;
$$;

revoke all on function public.cancel_agent_dispatch_task(uuid) from public, anon;
grant execute on function public.cancel_agent_dispatch_task(uuid) to authenticated;

comment on function public.cancel_agent_dispatch_task(uuid) is
  'Allows the owning authenticated user to cancel queued or leased agent work and invalidate its lease.';
