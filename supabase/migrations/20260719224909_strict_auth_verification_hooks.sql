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
