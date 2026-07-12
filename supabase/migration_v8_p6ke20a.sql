-- Moto Engineering Cloud v8: P6KE20A K-line transient protection
-- Run after supabase/migration_v7.sql.
-- Adds the selected 600 W, 20 V unidirectional TVS diode to existing PCB projects.

insert into public.pcb_components (
  user_id,
  pcb_project_id,
  reference,
  value,
  category,
  manufacturer_part,
  footprint,
  quantity,
  status,
  notes
)
select
  p.user_id,
  p.id,
  'D2',
  'P6KE20A',
  'K-line protection',
  'P6KE20A',
  'DO-15 axial',
  1,
  'Selected',
  '600 W unidirectional TVS for the motorcycle-side K-line transient clamp. Install across K-line and ground: cathode/striped end to K-line, anode/non-striped end to ground. Do not place in series and do not use as ESP32 3.3 V pin protection.'
from public.pcb_projects p
where not exists (
  select 1
  from public.pcb_components c
  where c.pcb_project_id = p.id
    and (
      upper(coalesce(c.manufacturer_part, '')) = 'P6KE20A'
      or upper(coalesce(c.value, '')) = 'P6KE20A'
    )
);

insert into public.pcb_revisions (
  user_id,
  pcb_project_id,
  revision,
  status,
  summary
)
select
  p.user_id,
  p.id,
  'Rev A1',
  'Planning',
  'Selected P6KE20A 600 W unidirectional TVS diode for motorcycle-side K-line transient suppression. Cathode to K-line; anode to ground.'
from public.pcb_projects p
where not exists (
  select 1
  from public.pcb_revisions r
  where r.pcb_project_id = p.id
    and r.summary ilike '%P6KE20A%'
);

notify pgrst, 'reload schema';
