-- Moto Engineering Cloud v9
-- Role-based product/engineering separation and controlled feature rollout.

create type public.app_role as enum ('rider','technician','engineer','admin','owner');
create type public.release_stage as enum ('development','testing','beta','production','deprecated','hidden');

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.app_role not null default 'rider',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  name text not null,
  description text,
  area text not null default 'garage' check (area in ('garage','engineering','administration')),
  minimum_role public.app_role not null default 'rider',
  release_stage public.release_stage not null default 'development',
  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_feature_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_id uuid not null references public.feature_flags(id) on delete cascade,
  enabled boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, feature_id)
);

create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  bike_id uuid references public.bikes(id) on delete set null,
  name text not null,
  version text not null default '0.1.0',
  release_stage public.release_stage not null default 'development',
  status text not null default 'Draft',
  hardware_revision text,
  firmware_version text,
  notes text,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deployment_features (
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  feature_id uuid not null references public.feature_flags(id) on delete cascade,
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  primary key (deployment_id, feature_id)
);

-- Bootstrap the oldest account as owner; all other existing accounts become riders.
insert into public.user_profiles(user_id, display_name, role)
select id, coalesce(raw_user_meta_data->>'name', split_part(email,'@',1)),
       case when id=(select id from auth.users order by created_at asc limit 1)
            then 'owner'::public.app_role else 'rider'::public.app_role end
from auth.users
on conflict (user_id) do nothing;

insert into public.feature_flags(feature_key,name,description,area,minimum_role,release_stage,sort_order)
values
 ('dashboard','Overview','Operational garage overview.','garage','rider','production',10),
 ('garage_mode','Garage Mode','Mobile workshop companion.','garage','technician','beta',20),
 ('motorcycles','Motorcycles','Motorcycle ownership and configuration.','garage','rider','production',30),
 ('maintenance','Maintenance','Service history and maintenance tracking.','garage','rider','production',40),
 ('live_data','Live Data','Connected motorcycle telemetry.','garage','rider','testing',50),
 ('ride_log','Ride Log','Ride history and notes.','garage','rider','beta',60),
 ('parts','Installed Parts','Operational installed-part records.','garage','technician','testing',70),
 ('work_packages','Work Packages','Gated engineering development workflow.','engineering','engineer','development',110),
 ('engineering','Engineering Workbook','Requirements, interfaces, tests, and design records.','engineering','engineer','development',120),
 ('pcb','PCB Designer','Board architecture, pin planning, and revision control.','engineering','engineer','development',130),
 ('firmware','Firmware','Firmware revision tracking.','engineering','engineer','development',140),
 ('notebook','Engineering Notebook','Research and engineering notes.','engineering','engineer','development',150),
 ('project_files','Project Files','Internal engineering evidence and files.','engineering','engineer','development',160),
 ('ai_assistant','AI Assistant','Project-aware engineering assistant.','engineering','engineer','testing',170),
 ('release_manager','Release Manager','Promote validated features through rollout stages.','administration','admin','development',210),
 ('user_access','Users & Access','Manage roles and per-user feature access.','administration','owner','development',220)
on conflict (feature_key) do update set
 name=excluded.name, description=excluded.description, area=excluded.area,
 minimum_role=excluded.minimum_role, sort_order=excluded.sort_order;

alter table public.user_profiles enable row level security;
alter table public.feature_flags enable row level security;
alter table public.user_feature_access enable row level security;
alter table public.deployments enable row level security;
alter table public.deployment_features enable row level security;

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path=public
as $$ select coalesce((select role from public.user_profiles where user_id=auth.uid()), 'rider'::public.app_role) $$;

create or replace function public.role_rank(r public.app_role)
returns integer language sql immutable as $$
 select case r when 'rider' then 1 when 'technician' then 2 when 'engineer' then 3 when 'admin' then 4 when 'owner' then 5 end
$$;

create or replace function public.can_access_feature(feature_key_input text)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(
   select 1 from public.feature_flags f
   where f.feature_key=feature_key_input and f.enabled
     and public.role_rank(public.current_app_role()) >= public.role_rank(f.minimum_role)
     and (
       f.release_stage='production'
       or public.current_app_role() in ('owner','admin')
       or (f.release_stage='beta' and public.current_app_role() in ('engineer','technician'))
       or (f.release_stage='testing' and public.current_app_role() in ('engineer'))
       or exists(select 1 from public.user_feature_access ufa where ufa.user_id=auth.uid() and ufa.feature_id=f.id and ufa.enabled and (ufa.expires_at is null or ufa.expires_at>now()))
     )
 )
$$;

drop policy if exists "Profiles readable by self or admins" on public.user_profiles;
create policy "Profiles readable by self or admins" on public.user_profiles for select
using (user_id=auth.uid() or public.current_app_role() in ('admin','owner'));
drop policy if exists "Owners manage profiles" on public.user_profiles;
create policy "Owners manage profiles" on public.user_profiles for all
using (public.current_app_role()='owner') with check (public.current_app_role()='owner');

drop policy if exists "Authenticated users read feature flags" on public.feature_flags;
create policy "Authenticated users read feature flags" on public.feature_flags for select to authenticated using (true);
drop policy if exists "Admins manage feature flags" on public.feature_flags;
create policy "Admins manage feature flags" on public.feature_flags for all
using (public.current_app_role() in ('admin','owner')) with check (public.current_app_role() in ('admin','owner'));

drop policy if exists "Users read own feature grants" on public.user_feature_access;
create policy "Users read own feature grants" on public.user_feature_access for select
using (user_id=auth.uid() or public.current_app_role() in ('admin','owner'));
drop policy if exists "Admins manage feature grants" on public.user_feature_access;
create policy "Admins manage feature grants" on public.user_feature_access for all
using (public.current_app_role() in ('admin','owner')) with check (public.current_app_role() in ('admin','owner'));

drop policy if exists "Owners manage own deployments" on public.deployments;
create policy "Owners manage own deployments" on public.deployments for all
using (owner_user_id=auth.uid() or public.current_app_role() in ('admin','owner'))
with check (owner_user_id=auth.uid() or public.current_app_role() in ('admin','owner'));

drop policy if exists "Deployment features follow deployment" on public.deployment_features;
create policy "Deployment features follow deployment" on public.deployment_features for all
using (exists(select 1 from public.deployments d where d.id=deployment_id and (d.owner_user_id=auth.uid() or public.current_app_role() in ('admin','owner'))))
with check (exists(select 1 from public.deployments d where d.id=deployment_id and (d.owner_user_id=auth.uid() or public.current_app_role() in ('admin','owner'))));

create index if not exists feature_flags_area_stage_idx on public.feature_flags(area, release_stage, sort_order);
create index if not exists user_feature_access_user_idx on public.user_feature_access(user_id, enabled);
create index if not exists deployments_owner_stage_idx on public.deployments(owner_user_id, release_stage);

notify pgrst, 'reload schema';