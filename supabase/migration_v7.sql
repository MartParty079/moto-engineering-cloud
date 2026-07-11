
-- Moto Engineering Cloud v7: Rev A PCB Designer
-- Run after migration_v4.sql / v5-v6 app updates.

create table if not exists public.pcb_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  revision text default 'Rev A',
  status text default 'Planning',
  description text,
  board_width_mm numeric,
  board_height_mm numeric,
  layer_count integer default 4,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pcb_components (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pcb_project_id uuid not null references public.pcb_projects(id) on delete cascade,
  reference text,
  value text,
  category text,
  manufacturer_part text,
  footprint text,
  quantity numeric default 1,
  bom_part_id uuid references public.parts(id) on delete set null,
  status text default 'Planned',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pcb_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pcb_project_id uuid not null references public.pcb_projects(id) on delete cascade,
  device text default 'ESP32-S3',
  pin_name text not null,
  gpio text,
  function text,
  peripheral text,
  voltage text,
  connector text,
  direction text,
  required boolean default true,
  conflict_status text default 'Open',
  notes text,
  sort_order integer,
  created_at timestamptz not null default now()
);

create table if not exists public.pcb_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pcb_project_id uuid not null references public.pcb_projects(id) on delete cascade,
  connector_name text not null,
  connector_type text,
  pin_count integer,
  purpose text,
  bike text default 'Universal',
  pinout jsonb default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pcb_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pcb_project_id uuid not null references public.pcb_projects(id) on delete cascade,
  revision text not null,
  summary text,
  status text default 'Draft',
  released_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.pcb_projects enable row level security;
alter table public.pcb_components enable row level security;
alter table public.pcb_pins enable row level security;
alter table public.pcb_connectors enable row level security;
alter table public.pcb_revisions enable row level security;

drop policy if exists "Users manage own pcb projects" on public.pcb_projects;
create policy "Users manage own pcb projects" on public.pcb_projects for all
using(auth.uid()=user_id) with check(auth.uid()=user_id);

drop policy if exists "Users manage own pcb components" on public.pcb_components;
create policy "Users manage own pcb components" on public.pcb_components for all
using(auth.uid()=user_id) with check(auth.uid()=user_id);

drop policy if exists "Users manage own pcb pins" on public.pcb_pins;
create policy "Users manage own pcb pins" on public.pcb_pins for all
using(auth.uid()=user_id) with check(auth.uid()=user_id);

drop policy if exists "Users manage own pcb connectors" on public.pcb_connectors;
create policy "Users manage own pcb connectors" on public.pcb_connectors for all
using(auth.uid()=user_id) with check(auth.uid()=user_id);

drop policy if exists "Users manage own pcb revisions" on public.pcb_revisions;
create policy "Users manage own pcb revisions" on public.pcb_revisions for all
using(auth.uid()=user_id) with check(auth.uid()=user_id);

create index if not exists pcb_components_project_idx on public.pcb_components(user_id, pcb_project_id);
create index if not exists pcb_pins_project_idx on public.pcb_pins(user_id, pcb_project_id, sort_order);
create index if not exists pcb_connectors_project_idx on public.pcb_connectors(user_id, pcb_project_id);
create index if not exists pcb_revisions_project_idx on public.pcb_revisions(user_id, pcb_project_id);

notify pgrst, 'reload schema';
