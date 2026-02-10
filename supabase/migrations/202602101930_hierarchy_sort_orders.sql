-- Add persistent sort order for fiscal years, organizations, and projects.

alter table public.fiscal_years
add column if not exists sort_order int not null default 0;

alter table public.organizations
add column if not exists sort_order int not null default 0;

alter table public.projects
add column if not exists sort_order int not null default 0;

with ordered as (
  select id, row_number() over (order by coalesce(created_at, now()), name) - 1 as rn
  from public.fiscal_years
)
update public.fiscal_years fy
set sort_order = ordered.rn
from ordered
where fy.id = ordered.id
  and coalesce(fy.sort_order, 0) = 0;

with ordered as (
  select id, row_number() over (partition by fiscal_year_id order by coalesce(created_at, now()), name) - 1 as rn
  from public.organizations
)
update public.organizations o
set sort_order = ordered.rn
from ordered
where o.id = ordered.id
  and coalesce(o.sort_order, 0) = 0;

with ordered as (
  select id, row_number() over (partition by organization_id order by coalesce(created_at, now()), name) - 1 as rn
  from public.projects
)
update public.projects p
set sort_order = ordered.rn
from ordered
where p.id = ordered.id
  and coalesce(p.sort_order, 0) = 0;

create index if not exists idx_fiscal_years_sort_order on public.fiscal_years (sort_order);
create index if not exists idx_organizations_fy_sort_order on public.organizations (fiscal_year_id, sort_order);
create index if not exists idx_projects_org_sort_order on public.projects (organization_id, sort_order);
