create table if not exists private.password_attempt_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0,
  daily_started_at date not null default current_date,
  daily_failed_attempts integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists private.mfa_attempt_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  factor_id uuid not null,
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key(user_id,factor_id)
);
create or replace function private.hook_password_verification_attempt(event jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private as $$
declare uid uuid:=(event->>'user_id')::uuid; is_valid boolean:=coalesce((event->>'valid')::boolean,false); r private.password_attempt_state%rowtype; now_ts timestamptz:=now();
begin
 insert into private.password_attempt_state(user_id) values(uid) on conflict do nothing;
 select * into r from private.password_attempt_state where user_id=uid for update;
 if r.daily_started_at<>current_date then r.daily_started_at:=current_date;r.daily_failed_attempts:=0; end if;
 if r.window_started_at<now_ts-interval '15 minutes' then r.window_started_at:=now_ts;r.failed_attempts:=0; end if;
 if r.blocked_until is not null and r.blocked_until>now_ts then return jsonb_build_object('decision','reject','message','Sign-in is temporarily unavailable. Try again later.','should_logout_user',false); end if;
 if is_valid then update private.password_attempt_state set window_started_at=now_ts,failed_attempts=0,blocked_until=null,updated_at=now_ts where user_id=uid;return jsonb_build_object('decision','continue');end if;
 r.failed_attempts:=r.failed_attempts+1;r.daily_failed_attempts:=r.daily_failed_attempts+1;
 if r.daily_failed_attempts>=10 then r.blocked_until:=now_ts+interval '24 hours';elsif r.failed_attempts>=5 then r.blocked_until:=now_ts+interval '30 minutes';end if;
 update private.password_attempt_state set window_started_at=r.window_started_at,failed_attempts=r.failed_attempts,daily_started_at=r.daily_started_at,daily_failed_attempts=r.daily_failed_attempts,blocked_until=r.blocked_until,updated_at=now_ts where user_id=uid;
 return jsonb_build_object('decision','continue');
end $$;
grant usage on schema private to supabase_auth_admin;
grant select,insert,update,delete on private.password_attempt_state to supabase_auth_admin;
grant execute on function private.hook_password_verification_attempt(jsonb) to supabase_auth_admin;
revoke all on function private.hook_password_verification_attempt(jsonb) from public,anon,authenticated;

create or replace function private.hook_mfa_verification_attempt(event jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private as $$
declare uid uuid:=(event->>'user_id')::uuid; fid uuid:=(event->>'factor_id')::uuid; is_valid boolean:=coalesce((event->>'valid')::boolean,false); r private.mfa_attempt_state%rowtype; now_ts timestamptz:=now();
begin
 insert into private.mfa_attempt_state(user_id,factor_id) values(uid,fid) on conflict do nothing;
 select * into r from private.mfa_attempt_state where user_id=uid and factor_id=fid for update;
 if r.window_started_at<now_ts-interval '15 minutes' then r.window_started_at:=now_ts;r.failed_attempts:=0;end if;
 if r.blocked_until is not null and r.blocked_until>now_ts then return jsonb_build_object('decision','reject','message','MFA verification is temporarily locked.');end if;
 if is_valid then update private.mfa_attempt_state set failed_attempts=0,blocked_until=null,updated_at=now_ts where user_id=uid and factor_id=fid;return jsonb_build_object('decision','continue');end if;
 r.failed_attempts:=r.failed_attempts+1;if r.failed_attempts>=5 then r.blocked_until:=now_ts+interval '30 minutes';end if;
 update private.mfa_attempt_state set window_started_at=r.window_started_at,failed_attempts=r.failed_attempts,blocked_until=r.blocked_until,updated_at=now_ts where user_id=uid and factor_id=fid;
 return jsonb_build_object('decision','continue');
end $$;
grant select,insert,update,delete on private.mfa_attempt_state to supabase_auth_admin;
grant execute on function private.hook_mfa_verification_attempt(jsonb) to supabase_auth_admin;
revoke all on function private.hook_mfa_verification_attempt(jsonb) from public,anon,authenticated;

create or replace function public.get_admin_user_metrics()
returns table(user_id uuid,display_name text,role text,app_opens bigint,website_opens bigint,total_opens bigint,bikes bigint,rides bigint,total_miles numeric,total_hours numeric,maintenance_records bigint,parts bigint,last_activity timestamptz)
language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
 if not private.is_admin_aal2(900) then raise exception 'Recent MFA verification required';end if;
 return query select p.user_id,coalesce(p.display_name,p.user_id::text),coalesce(a.role,p.role)::text,count(e.id) filter(where e.event_type='app_open'),count(e.id) filter(where e.event_type='website_open'),count(e.id),(select count(*) from public.bikes b where b.user_id=p.user_id),(select count(*) from public.ride_sessions r where r.user_id=p.user_id and coalesce(r.status,'complete')='complete'),coalesce((select sum(r.distance_miles) from public.ride_sessions r where r.user_id=p.user_id and coalesce(r.status,'complete')='complete'),0),round(coalesce((select sum(r.duration_seconds)::numeric/3600 from public.ride_sessions r where r.user_id=p.user_id and coalesce(r.status,'complete')='complete'),0),2),(select count(*) from public.maintenance m where m.user_id=p.user_id),(select count(*) from public.parts pt where pt.user_id=p.user_id),max(e.created_at)
 from public.user_profiles p left join private.admin_principals a on a.user_id=p.user_id and a.active left join public.user_activity_events e on e.user_id=p.user_id
 group by p.user_id,p.display_name,p.role,a.role,p.created_at order by max(e.created_at) desc nulls last,p.created_at;
end $$;
revoke all on function public.get_admin_user_metrics() from public,anon;
grant execute on function public.get_admin_user_metrics() to authenticated;
