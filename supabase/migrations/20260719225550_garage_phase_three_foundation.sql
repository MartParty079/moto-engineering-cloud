create table if not exists public.bike_ownership_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bike_id uuid not null references public.bikes(id) on delete cascade,
  vin text,
  license_plate text,
  purchase_date date,
  purchase_price numeric(12,2) not null default 0 check (purchase_price>=0),
  purchase_odometer_miles numeric(12,2) check (purchase_odometer_miles>=0),
  seller text,
  title_status text,
  registration_expires_on date,
  inspection_expires_on date,
  insurance_provider text,
  insurance_policy_number text,
  insurance_expires_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,bike_id)
);
create table if not exists public.bike_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bike_id uuid not null references public.bikes(id) on delete cascade,
  document_type text not null default 'other' check (document_type in ('registration','insurance','title','purchase','receipt','service_manual','owners_manual','dyno','tune','suspension','inspection','warranty','other')),
  title text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes>=0),
  issued_on date,
  expires_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,storage_path)
);
create table if not exists public.bike_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bike_id uuid not null references public.bikes(id) on delete cascade,
  category text not null default 'other' check (category in ('insurance','registration','inspection','transport','storage','tools','parking','tolls','accessories','other')),
  description text not null,
  amount numeric(12,2) not null check (amount>=0),
  occurred_on date not null default current_date,
  odometer_miles numeric(12,2) check (odometer_miles is null or odometer_miles>=0),
  vendor text,
  receipt_document_id uuid references public.bike_documents(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.bike_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bike_id uuid not null references public.bikes(id) on delete cascade,
  title text not null,
  category text not null default 'general' check (category in ('maintenance','registration','insurance','inspection','warranty','document','part','general')),
  due_on date,
  due_odometer_miles numeric(12,2) check (due_odometer_miles is null or due_odometer_miles>=0),
  due_hours numeric(12,2) check (due_hours is null or due_hours>=0),
  status text not null default 'active' check (status in ('active','completed','dismissed')),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_on is not null or due_odometer_miles is not null or due_hours is not null)
);
create index if not exists bike_ownership_user_bike_idx on public.bike_ownership_details(user_id,bike_id);
create index if not exists bike_documents_bike_date_idx on public.bike_documents(bike_id,coalesce(expires_on,issued_on) desc);
create index if not exists bike_documents_expiry_idx on public.bike_documents(user_id,expires_on) where expires_on is not null;
create index if not exists bike_expenses_bike_date_idx on public.bike_expenses(bike_id,occurred_on desc);
create index if not exists bike_reminders_active_idx on public.bike_reminders(user_id,bike_id,due_on) where status='active';
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin new.updated_at=now(); return new; end $$;
do $do$ declare tbl text; begin
 foreach tbl in array array['bike_ownership_details','bike_documents','bike_expenses','bike_reminders'] loop
  execute format('drop trigger if exists %I on public.%I','touch_'||tbl||'_updated_at',tbl);
  execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()','touch_'||tbl||'_updated_at',tbl);
  execute format('alter table public.%I enable row level security',tbl);
  execute format('alter table public.%I force row level security',tbl);
  execute format('create policy %I on public.%I for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id)','Users manage own '||replace(tbl,'_',' '),tbl);
  execute format('create policy %I on public.%I as restrictive for all to authenticated using(private.is_verified_permanent_user()) with check(private.is_verified_permanent_user())','verified_permanent_accounts_only',tbl);
 end loop;
end $do$;
create or replace view public.bike_cost_summary with (security_invoker=true) as
select b.user_id,b.id as bike_id,
 coalesce(o.purchase_price,0)::numeric(12,2) as purchase_cost,
 coalesce((select sum(m.cost) from public.maintenance m where m.user_id=b.user_id and m.bike_id=b.id),0)::numeric(12,2) as maintenance_cost,
 coalesce((select sum(md.cost) from public.bike_mods md where md.user_id=b.user_id and md.bike_id=b.id and md.status<>'Removed'),0)::numeric(12,2) as current_mod_cost,
 coalesce((select sum(f.total_cost) from public.fuel_entries f where f.user_id=b.user_id and f.bike_id=b.id),0)::numeric(12,2) as fuel_cost,
 coalesce((select sum(e.amount) from public.bike_expenses e where e.user_id=b.user_id and e.bike_id=b.id),0)::numeric(12,2) as other_cost,
 (coalesce(o.purchase_price,0)+coalesce((select sum(m.cost) from public.maintenance m where m.user_id=b.user_id and m.bike_id=b.id),0)+coalesce((select sum(md.cost) from public.bike_mods md where md.user_id=b.user_id and md.bike_id=b.id and md.status<>'Removed'),0)+coalesce((select sum(f.total_cost) from public.fuel_entries f where f.user_id=b.user_id and f.bike_id=b.id),0)+coalesce((select sum(e.amount) from public.bike_expenses e where e.user_id=b.user_id and e.bike_id=b.id),0))::numeric(12,2) as total_ownership_cost
from public.bikes b left join public.bike_ownership_details o on o.user_id=b.user_id and o.bike_id=b.id;
create or replace view public.bike_timeline with (security_invoker=true) as
select user_id,bike_id,'purchase'::text event_type,id::text event_id,coalesce(purchase_date::timestamptz,created_at) event_at,'Motorcycle purchased'::text title,seller::text subtitle,purchase_price::numeric amount,jsonb_build_object('odometer_miles',purchase_odometer_miles) metadata from public.bike_ownership_details
union all select user_id,bike_id,'ride',id::text,started_at,'Ride',concat(round(coalesce(distance_miles,0)::numeric,1),' mi'),null::numeric,jsonb_build_object('duration_seconds',duration_seconds,'max_speed_mph',max_speed_mph,'max_lean_deg',max_lean_deg) from public.ride_sessions where status='complete'
union all select user_id,bike_id,'maintenance',id::text,coalesce(service_date::timestamptz,created_at),service,performed_by,cost,jsonb_build_object('odometer_miles',odometer,'service_hours',service_hours,'parts_used',parts_used) from public.maintenance where bike_id is not null
union all select user_id,bike_id,'mod',id::text,coalesce(installed_at::timestamptz,created_at),concat(coalesce(brand||' ',''),part_name),status,cost,jsonb_build_object('category',category,'installed_odometer_miles',installed_odometer_miles,'image_url',image_url) from public.bike_mods
union all select user_id,bike_id,'fuel',id::text,filled_at,'Fuel fill',station,total_cost,jsonb_build_object('gallons',gallons,'odometer_miles',odometer_miles) from public.fuel_entries where bike_id is not null
union all select user_id,bike_id,'expense',id::text,occurred_on::timestamptz,description,category,amount,jsonb_build_object('vendor',vendor,'odometer_miles',odometer_miles) from public.bike_expenses
union all select user_id,bike_id,'document',id::text,coalesce(issued_on::timestamptz,created_at),title,document_type,null::numeric,jsonb_build_object('expires_on',expires_on,'file_name',file_name,'storage_path',storage_path) from public.bike_documents;
grant select on public.bike_cost_summary,public.bike_timeline to authenticated;
revoke all on public.bike_cost_summary,public.bike_timeline from anon;
