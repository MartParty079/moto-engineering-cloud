-- Moto Engineering Cloud v5: server-side OpenAI assistant and approval workflow

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_change_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  action_type text not null,
  title text not null,
  explanation text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','applied','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  applied_at timestamptz
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  request_kind text,
  created_at timestamptz not null default now()
);

alter table public.ai_messages enable row level security;
alter table public.ai_change_proposals enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "Users manage own AI messages" on public.ai_messages;
create policy "Users manage own AI messages" on public.ai_messages for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own AI proposals" on public.ai_change_proposals;
create policy "Users manage own AI proposals" on public.ai_change_proposals for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users read own AI usage" on public.ai_usage;
create policy "Users read own AI usage" on public.ai_usage for select
using (auth.uid() = user_id);

create index if not exists ai_messages_user_created_idx on public.ai_messages(user_id, created_at desc);
create index if not exists ai_proposals_user_status_idx on public.ai_change_proposals(user_id, status, created_at desc);

notify pgrst, 'reload schema';
