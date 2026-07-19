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
