
-- Moto Engineering Cloud v4: Engineering Work Packages and proof gates
-- Run after migration_v3.sql.

alter table public.tasks
  add column if not exists work_type text default 'General',
  add column if not exists objective text,
  add column if not exists background text,
  add column if not exists prerequisites text,
  add column if not exists safety_notes text,
  add column if not exists procedure text,
  add column if not exists acceptance_criteria text,
  add column if not exists deliverables text,
  add column if not exists test_procedure text,
  add column if not exists results text,
  add column if not exists lessons_learned text,
  add column if not exists estimated_hours numeric,
  add column if not exists difficulty text default 'Medium',
  add column if not exists risk_level text default 'Medium',
  add column if not exists proof_rules jsonb default '[]'::jsonb,
  add column if not exists gate_status text default 'Locked',
  add column if not exists gate_message text;

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(task_id, depends_on_task_id),
  check(task_id <> depends_on_task_id)
);

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  extension text,
  mime_type text,
  file_size bigint,
  attachment_kind text default 'other',
  proof_category text,
  version_label text default 'v1',
  description text,
  created_at timestamptz not null default now()
);

alter table public.task_dependencies enable row level security;
alter table public.task_attachments enable row level security;

drop policy if exists "Users manage own task dependencies" on public.task_dependencies;
create policy "Users manage own task dependencies"
on public.task_dependencies for all
using(auth.uid()=user_id)
with check(auth.uid()=user_id);

drop policy if exists "Users manage own task attachments" on public.task_attachments;
create policy "Users manage own task attachments"
on public.task_attachments for all
using(auth.uid()=user_id)
with check(auth.uid()=user_id);

create index if not exists task_dependencies_task_idx
  on public.task_dependencies(user_id, task_id);

create index if not exists task_attachments_task_idx
  on public.task_attachments(user_id, task_id);

notify pgrst, 'reload schema';
