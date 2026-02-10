-- Add fiscal-year and organization hierarchy

create table if not exists public.fiscal_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date,
  end_date date,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid references public.fiscal_years (id) on delete set null,
  name text not null,
  org_code text not null,
  created_at timestamptz not null default now(),
  unique (fiscal_year_id, org_code)
);

alter table public.projects
add column if not exists organization_id uuid references public.organizations (id) on delete set null;

create index if not exists idx_projects_organization_id on public.projects (organization_id);
create index if not exists idx_orgs_fiscal_year_id on public.organizations (fiscal_year_id);

create or replace view public.v_organization_totals as
select
  o.id as organization_id,
  o.name as organization_name,
  o.org_code,
  o.fiscal_year_id,
  fy.name as fiscal_year_name,
  coalesce(sum(vpt.allocated_total), 0)::numeric(12, 2) as allocated_total,
  coalesce(sum(vpt.requested_open_total), 0)::numeric(12, 2) as requested_open_total,
  coalesce(sum(vpt.enc_total), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(vpt.pending_cc_total), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(vpt.ytd_total), 0)::numeric(12, 2) as ytd_total,
  coalesce(sum(vpt.obligated_total), 0)::numeric(12, 2) as obligated_total,
  coalesce(sum(vpt.remaining_true), 0)::numeric(12, 2) as remaining_true,
  coalesce(sum(vpt.remaining_if_requested_approved), 0)::numeric(12, 2) as remaining_if_requested_approved,
  coalesce(sum(il.amount), 0)::numeric(12, 2) as income_total
from public.organizations o
left join public.fiscal_years fy on fy.id = o.fiscal_year_id
left join public.projects p on p.organization_id = o.id
left join public.v_project_totals vpt on vpt.project_id = p.id
left join public.income_lines il on il.project_id = p.id
group by o.id, o.name, o.org_code, o.fiscal_year_id, fy.name;

alter table public.fiscal_years enable row level security;
alter table public.organizations enable row level security;
alter view public.v_organization_totals set (security_invoker = true);

drop policy if exists "members can read fiscal years" on public.fiscal_years;
create policy "members can read fiscal years"
on public.fiscal_years
for select
using (
  exists (
    select 1
    from public.organizations o
    join public.projects p on p.organization_id = o.id
    join public.project_memberships pm on pm.project_id = p.id
    where o.fiscal_year_id = fiscal_years.id
      and pm.user_id = auth.uid()
  )
);

drop policy if exists "admins can manage fiscal years" on public.fiscal_years;
create policy "admins can manage fiscal years"
on public.fiscal_years
for all
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
);

drop policy if exists "members can read organizations" on public.organizations;
create policy "members can read organizations"
on public.organizations
for select
using (
  exists (
    select 1
    from public.projects p
    join public.project_memberships pm on pm.project_id = p.id
    where p.organization_id = organizations.id
      and pm.user_id = auth.uid()
  )
);

drop policy if exists "admins can manage organizations" on public.organizations;
create policy "admins can manage organizations"
on public.organizations
for all
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
);

grant select on public.v_organization_totals to authenticated;
