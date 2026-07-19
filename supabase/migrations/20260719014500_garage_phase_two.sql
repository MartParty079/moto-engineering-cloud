create table if not exists public.bike_mods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bike_id uuid not null references public.bikes(id) on delete cascade,
  part_name text not null,
  brand text,
  part_number text,
  category text not null default 'Other',
  status text not null default 'Planned',
  cost numeric not null default 0,
  installed_at date,
  removed_at date,
  installed_odometer_miles numeric,
  vendor text,
  source_url text,
  image_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bike_mods_status_check check (status in ('Planned','Ordered','Installed','Removed')),
  constraint bike_mods_cost_check check (cost >= 0)
);

alter table public.bike_mods enable row level security;

drop policy if exists "Users manage own bike mods" on public.bike_mods;
create policy "Users manage own bike mods"
on public.bike_mods
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists bike_mods_user_id_idx on public.bike_mods(user_id);
create index if not exists bike_mods_bike_id_idx on public.bike_mods(bike_id);
create index if not exists bike_mods_status_idx on public.bike_mods(status);
create index if not exists bike_mods_installed_at_idx on public.bike_mods(installed_at desc);

alter table public.maintenance add column if not exists bike_id uuid references public.bikes(id) on delete cascade;
alter table public.maintenance add column if not exists service_hours numeric;
alter table public.maintenance add column if not exists performed_by text;
alter table public.maintenance add column if not exists parts_used text;
alter table public.maintenance add column if not exists receipt_url text;
alter table public.maintenance add column if not exists interval_id uuid references public.maintenance_intervals(id) on delete set null;
alter table public.maintenance add column if not exists next_due_hours numeric;

create index if not exists maintenance_bike_id_idx on public.maintenance(bike_id);
create index if not exists maintenance_interval_id_idx on public.maintenance(interval_id);
create index if not exists maintenance_service_date_idx on public.maintenance(service_date desc);

update public.maintenance m
set bike_id = b.id
from public.bikes b
where m.bike_id is null
  and m.user_id = b.user_id
  and (
    lower(trim(coalesce(m.bike, ''))) = lower(trim(coalesce(b.name, '')))
    or lower(trim(coalesce(m.bike, ''))) = lower(trim(concat_ws(' ', b.year, b.make, b.model)))
  );
