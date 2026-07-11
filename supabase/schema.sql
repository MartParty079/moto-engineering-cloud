-- Moto Engineering Cloud schema
-- Run this entire file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.bikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  year text,
  make text,
  model text,
  odometer numeric default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  stage text,
  bike text default 'Universal',
  priority text default 'Medium',
  status text default 'Not Started',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  part text not null,
  system text,
  bike text default 'Universal',
  qty numeric default 1,
  unit_cost numeric default 0,
  status text default 'Not Started',
  owned boolean default false,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text default 'General',
  bike text default 'Universal',
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null,
  bike text,
  service_date date default current_date,
  odometer numeric default 0,
  cost numeric default 0,
  next_due_miles numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  bike text,
  ride_date date default current_date,
  distance_miles numeric default 0,
  duration text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.firmware (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  version text,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.bikes enable row level security;
alter table public.tasks enable row level security;
alter table public.parts enable row level security;
alter table public.notes enable row level security;
alter table public.maintenance enable row level security;
alter table public.rides enable row level security;
alter table public.firmware enable row level security;

-- User-owned row policies
do $$
declare t text;
begin
  foreach t in array array['bikes','tasks','parts','notes','maintenance','rides','firmware']
  loop
    execute format('drop policy if exists "Users manage own %I" on public.%I', t, t);
    execute format(
      'create policy "Users manage own %I" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
  end loop;
end $$;

-- Private storage bucket
insert into storage.buckets (id, name, public)
values ('project-media','project-media',false)
on conflict (id) do update set public=false;

drop policy if exists "Users read own project media" on storage.objects;
create policy "Users read own project media"
on storage.objects for select
using (bucket_id='project-media' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Users upload own project media" on storage.objects;
create policy "Users upload own project media"
on storage.objects for insert
with check (bucket_id='project-media' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Users delete own project media" on storage.objects;
create policy "Users delete own project media"
on storage.objects for delete
using (bucket_id='project-media' and (storage.foldername(name))[1]=auth.uid()::text);

-- Optional starter rows for each new user can be inserted manually from the app.
