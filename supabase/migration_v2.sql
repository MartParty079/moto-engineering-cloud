
-- Run after the original schema.sql. Safe to run repeatedly.
create table if not exists public.engineering_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 item_type text not null,
 source_id text,
 title text,
 category text,
 stage text,
 bike text default 'Universal',
 status text,
 priority text,
 data jsonb not null default '{}'::jsonb,
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.engineering_items enable row level security;
drop policy if exists "Users manage own engineering items" on public.engineering_items;
create policy "Users manage own engineering items" on public.engineering_items for all
using(auth.uid()=user_id) with check(auth.uid()=user_id);

create table if not exists public.task_media (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null references public.tasks(id) on delete cascade,
 storage_path text not null,
 file_name text not null,
 media_type text,
 caption text,
 created_at timestamptz not null default now()
);
alter table public.task_media enable row level security;
drop policy if exists "Users manage own task media" on public.task_media;
create policy "Users manage own task media" on public.task_media for all
using(auth.uid()=user_id) with check(auth.uid()=user_id);

drop policy if exists "Users update own project media" on storage.objects;
create policy "Users update own project media" on storage.objects for update
using(bucket_id='project-media' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='project-media' and (storage.foldername(name))[1]=auth.uid()::text);
