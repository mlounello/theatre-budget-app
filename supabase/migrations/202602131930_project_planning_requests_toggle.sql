-- Per-project planning requests toggle.

alter table public.projects
add column if not exists planning_requests_enabled boolean not null default true;

-- External Procurement should not use planning requests.
update public.projects
set planning_requests_enabled = false
where lower(trim(name)) = 'external procurement';
