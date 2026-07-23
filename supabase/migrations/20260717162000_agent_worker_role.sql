do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'agent_worker') then
    create role agent_worker nologin;
  end if;
end
$$;

revoke all on public.agent_dispatch_tasks from agent_worker;
revoke all on public.agent_task_results from agent_worker;

grant usage on schema public to agent_worker;
grant execute on function public.claim_agent_dispatch_task(uuid, text, text, text) to agent_worker;
grant execute on function public.heartbeat_agent_dispatch_task(uuid, text, text, text) to agent_worker;
grant execute on function public.submit_agent_task_result(uuid, text, text, text, jsonb) to agent_worker;

comment on role agent_worker is
  'Least-privilege PostgREST role for Moto Mission worker claim, heartbeat, and result RPCs only.';
