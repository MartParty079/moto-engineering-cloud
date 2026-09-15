-- Additive compatibility migration reconciled against the live schema on 2026-09-14.
-- Preserve bigint sample IDs, legacy clients, ownership RLS and verified-user policies.
-- It deliberately fails when existing tables/columns or RLS are missing.
begin;
do $$
declare item record;
begin
  for item in select * from (values
    ('bikes','id'),('bikes','user_id'),('bikes','odometer'),('bikes','gps_odometer_miles'),('bikes','rides_since_odometer_confirm'),('bikes','updated_at'),
    ('ride_sessions','id'),('ride_sessions','user_id'),('ride_sessions','bike_id'),('ride_sessions','started_at'),('ride_sessions','ended_at'),
    ('ride_sessions','status'),('ride_sessions','duration_seconds'),('ride_sessions','distance_miles'),('ride_sessions','max_speed_mph'),
    ('ride_sessions','average_speed_mph'),('ride_sessions','end_lat'),('ride_sessions','end_lng'),('ride_sessions','updated_at'),
    ('ride_samples','id'),('ride_samples','session_id'),('ride_samples','user_id')
  ) as needed(table_name,column_name)
  loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=item.table_name and c.column_name=item.column_name) then
      raise exception 'Missing %.%; recover the authoritative development schema first',item.table_name,item.column_name;
    end if;
  end loop;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('bikes','ride_sessions','ride_samples') and not c.relrowsecurity) then
    raise exception 'Ride tables and bikes must already have reviewed RLS';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='ride_sessions' and column_name='id' and udt_name<>'uuid') then
    raise exception 'Durable synchronization requires UUID ride primary keys';
  end if;
  if (select count(distinct c.conrelid) from pg_constraint c
    join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=t.oid and a.attnum=c.conkey[1]
    where n.nspname='public' and t.relname in ('ride_sessions','ride_samples')
      and c.contype in ('p','u') and cardinality(c.conkey)=1 and a.attname='id')<>2 then
    raise exception 'Ride and sample IDs require single-column uniqueness for idempotent uploads';
  end if;
end $$;

alter table public.ride_sessions add column if not exists client_sync_version integer;
alter table public.ride_sessions add column if not exists completion_applied_at timestamptz;
alter table public.ride_samples add column if not exists client_sample_id uuid;
create unique index if not exists ride_samples_client_sample_id_key on public.ride_samples(client_sample_id);
-- Browser roles never need TRUNCATE (which bypasses row-level policies).
revoke truncate on public.bikes,public.ride_sessions,public.ride_samples from anon,authenticated;

create or replace function public.complete_ride_v1(
  p_session_id uuid, p_ended_at timestamptz, p_duration_seconds integer,
  p_distance_miles numeric, p_max_speed_mph numeric, p_average_speed_mph numeric,
  p_end_lat double precision, p_end_lng double precision, p_sample_count integer
) returns jsonb
language plpgsql security invoker set search_path = '' set lock_timeout = '5s'
as $$
declare
  caller uuid := auth.uid();
  ride public.ride_sessions%rowtype;
  updated_bike uuid;
  actual_samples bigint;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_ended_at is null or not isfinite(p_ended_at) or p_ended_at>now()+interval '5 minutes'
    or p_duration_seconds is null or p_duration_seconds not between 0 and 2678400
    or p_distance_miles is null or p_distance_miles not between 0 and 100000
    or p_max_speed_mph is null or p_max_speed_mph not between 0 and 250
    or p_average_speed_mph is null or p_average_speed_mph not between 0 and p_max_speed_mph
    or p_sample_count is null or p_sample_count<0
    or (p_end_lat is null)<>(p_end_lng is null)
    or (p_end_lat is not null and p_end_lat not between -90 and 90)
    or (p_end_lng is not null and p_end_lng not between -180 and 180)
  then raise exception 'Invalid ride summary' using errcode='22023'; end if;
  select * into ride from public.ride_sessions where id=p_session_id and user_id=caller for update;
  if not found then raise exception 'Ride unavailable for this account' using errcode='42501'; end if;
  if ride.client_sync_version is distinct from 1 then raise exception 'Unsupported ride synchronization version' using errcode='22023'; end if;
  if ride.completion_applied_at is not null then
    return jsonb_build_object('session_id',ride.id,'status','complete');
  end if;
  if ride.status<>'recording' then raise exception 'Ride is not eligible for completion' using errcode='22023'; end if;
  if p_ended_at<ride.started_at or abs(extract(epoch from (p_ended_at-ride.started_at))-p_duration_seconds)>2 then
    raise exception 'Ride duration does not match timestamps' using errcode='22023';
  end if;
  select count(*) into actual_samples from public.ride_samples where session_id=ride.id and user_id=caller;
  if actual_samples<>p_sample_count then raise exception 'Ride samples are incomplete' using errcode='22023'; end if;
  -- UPDATE locks the bike row and increments current values, preserving other rides.
  update public.bikes set odometer=coalesce(odometer,0)+p_distance_miles,
    gps_odometer_miles=coalesce(gps_odometer_miles,0)+p_distance_miles,
    rides_since_odometer_confirm=coalesce(rides_since_odometer_confirm,0)+1,updated_at=now()
    where id=ride.bike_id and user_id=caller returning id into updated_bike;
  if updated_bike is null then raise exception 'Motorcycle unavailable for this account' using errcode='42501'; end if;
  update public.ride_sessions set ended_at=p_ended_at,duration_seconds=p_duration_seconds,
    distance_miles=p_distance_miles,max_speed_mph=p_max_speed_mph,average_speed_mph=p_average_speed_mph,
    end_lat=p_end_lat,end_lng=p_end_lng,status='complete',updated_at=now(),completion_applied_at=now()
    where id=ride.id and user_id=caller;
  if not found then raise exception 'Ride update denied' using errcode='42501'; end if;
  return jsonb_build_object('session_id',ride.id,'status','complete');
end $$;
revoke all on function public.complete_ride_v1(uuid,timestamptz,integer,numeric,numeric,numeric,double precision,double precision,integer) from public,anon;
grant execute on function public.complete_ride_v1(uuid,timestamptz,integer,numeric,numeric,numeric,double precision,double precision,integer) to authenticated;
commit;
