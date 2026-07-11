
alter table public.tasks
  add column if not exists sort_order integer,
  add column if not exists progress integer default 0,
  add column if not exists target_date date,
  add column if not exists owner_name text,
  add column if not exists checklist jsonb default '[]'::jsonb;

alter table public.parts
  add column if not exists installed boolean default false,
  add column if not exists tested boolean default false;

create index if not exists tasks_user_sort_order_idx
  on public.tasks(user_id, sort_order);

notify pgrst, 'reload schema';
