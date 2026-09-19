-- Phase 4 Gate 2: additive fiscal-year organization foundation.
-- This migration does not repoint or delete any organization record.

alter table app_theatre_budget.organizations
  add column if not exists active boolean not null default true,
  add column if not exists superseded_by_organization_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'organizations_superseded_by_organization_id_fkey'
  ) then
    alter table app_theatre_budget.organizations
      add constraint organizations_superseded_by_organization_id_fkey
      foreign key (superseded_by_organization_id)
      references app_theatre_budget.organizations(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'organizations_not_self_superseded'
  ) then
    alter table app_theatre_budget.organizations
      add constraint organizations_not_self_superseded
      check (superseded_by_organization_id is null or superseded_by_organization_id <> id);
  end if;
end;
$$;

create index if not exists idx_organizations_superseded_by
  on app_theatre_budget.organizations (superseded_by_organization_id)
  where superseded_by_organization_id is not null;

create table if not exists app_theatre_budget.fiscal_year_organizations (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null
    references app_theatre_budget.fiscal_years(id) on delete cascade,
  organization_id uuid not null
    references app_theatre_budget.organizations(id) on delete restrict,
  active boolean not null default true,
  sort_order integer not null default 0,
  project_tracking_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fiscal_year_id, organization_id)
);

create index if not exists idx_fiscal_year_organizations_fy_active_sort
  on app_theatre_budget.fiscal_year_organizations
    (fiscal_year_id, active, sort_order, organization_id);

create index if not exists idx_fiscal_year_organizations_org
  on app_theatre_budget.fiscal_year_organizations (organization_id, fiscal_year_id);

create table if not exists app_theatre_budget.fiscal_year_assignment_conflicts (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null,
  entity_id uuid not null,
  conflict_type text not null check (
    conflict_type in (
      'project_organization_mismatch',
      'explicit_fiscal_year_mismatch',
      'unresolved',
      'date_review_required'
    )
  ),
  project_fiscal_year_id uuid null
    references app_theatre_budget.fiscal_years(id) on delete restrict,
  organization_fiscal_year_id uuid null
    references app_theatre_budget.fiscal_years(id) on delete restrict,
  explicit_fiscal_year_id uuid null
    references app_theatre_budget.fiscal_years(id) on delete restrict,
  proposed_fiscal_year_id uuid null
    references app_theatre_budget.fiscal_years(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'auto_resolved', 'dismissed')),
  resolution_note text null,
  resolved_fiscal_year_id uuid null
    references app_theatre_budget.fiscal_years(id) on delete restrict,
  resolved_by_user_id uuid null
    references app_theatre_budget.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_fiscal_year_assignment_conflicts_open_entity
  on app_theatre_budget.fiscal_year_assignment_conflicts (entity_table, entity_id)
  where status = 'open';

create index if not exists idx_fiscal_year_assignment_conflicts_status
  on app_theatre_budget.fiscal_year_assignment_conflicts
    (status, entity_table, conflict_type, created_at);

alter table app_theatre_budget.fiscal_year_organizations enable row level security;
alter table app_theatre_budget.fiscal_year_assignment_conflicts enable row level security;

drop policy if exists fiscal_year_organizations_select_member
  on app_theatre_budget.fiscal_year_organizations;
create policy fiscal_year_organizations_select_member
on app_theatre_budget.fiscal_year_organizations
for select to authenticated
using (core.is_member('theatre_budget'));

drop policy if exists fiscal_year_organizations_manage_admin
  on app_theatre_budget.fiscal_year_organizations;
create policy fiscal_year_organizations_manage_admin
on app_theatre_budget.fiscal_year_organizations
for all to authenticated
using (app_theatre_budget.is_admin_user())
with check (app_theatre_budget.is_admin_user());

drop policy if exists fiscal_year_assignment_conflicts_select_admin
  on app_theatre_budget.fiscal_year_assignment_conflicts;
create policy fiscal_year_assignment_conflicts_select_admin
on app_theatre_budget.fiscal_year_assignment_conflicts
for select to authenticated
using (app_theatre_budget.is_admin_user());

grant select on app_theatre_budget.fiscal_year_organizations to authenticated;
grant select on app_theatre_budget.fiscal_year_assignment_conflicts to authenticated;

with desired_memberships as (
  select fiscal_year_id, org_code
  from app_theatre_budget.organizations
  where fiscal_year_id is not null

  union
  select project.fiscal_year_id, organization.org_code
  from app_theatre_budget.projects project
  join app_theatre_budget.organizations organization on organization.id = project.organization_id

  union
  select plan.fiscal_year_id, organization.org_code
  from app_theatre_budget.budget_plans plan
  join app_theatre_budget.organizations organization on organization.id = plan.organization_id

  union
  select contract.fiscal_year_id, organization.org_code
  from app_theatre_budget.contracts contract
  join app_theatre_budget.organizations organization on organization.id = contract.organization_id

  union
  select commitment.fiscal_year_id, organization.org_code
  from app_theatre_budget.institutional_budget_commitments commitment
  join app_theatre_budget.organizations organization on organization.id = commitment.organization_id

  union
  select scope.fiscal_year_id, organization.org_code
  from app_theatre_budget.user_access_scopes scope
  join app_theatre_budget.organizations organization on organization.id = scope.organization_id
  where scope.fiscal_year_id is not null

  union
  select request.fiscal_year_id, organization.org_code
  from app_theatre_budget.variance_request_targets target
  join app_theatre_budget.variance_requests request on request.id = target.variance_request_id
  join app_theatre_budget.organizations organization on organization.id = target.organization_id

  union
  select request.fiscal_year_id, organization.org_code
  from app_theatre_budget.variance_request_lines line
  join app_theatre_budget.variance_requests request on request.id = line.variance_request_id
  join app_theatre_budget.organizations organization on organization.id = line.from_organization_id

  union
  select request.fiscal_year_id, organization.org_code
  from app_theatre_budget.variance_request_lines line
  join app_theatre_budget.variance_requests request on request.id = line.variance_request_id
  join app_theatre_budget.organizations organization on organization.id = line.to_organization_id
), resolved_memberships as (
  select
    desired.fiscal_year_id,
    coalesce(exact_organization.id, global_organization.id) as organization_id,
    coalesce(exact_organization.sort_order, global_organization.sort_order, 0) as sort_order,
    coalesce(
      exact_organization.project_tracking_required,
      global_organization.project_tracking_required,
      true
    ) as project_tracking_required
  from desired_memberships desired
  left join lateral (
    select organization.*
    from app_theatre_budget.organizations organization
    where organization.org_code = desired.org_code
      and organization.fiscal_year_id = desired.fiscal_year_id
    order by organization.created_at, organization.id
    limit 1
  ) exact_organization on true
  left join lateral (
    select organization.*
    from app_theatre_budget.organizations organization
    where organization.org_code = desired.org_code
      and organization.fiscal_year_id is null
    order by organization.created_at, organization.id
    limit 1
  ) global_organization on true
)
insert into app_theatre_budget.fiscal_year_organizations (
  fiscal_year_id,
  organization_id,
  active,
  sort_order,
  project_tracking_required
)
select
  fiscal_year_id,
  organization_id,
  true,
  sort_order,
  project_tracking_required
from resolved_memberships
where organization_id is not null
on conflict (fiscal_year_id, organization_id) do update
set
  sort_order = excluded.sort_order,
  project_tracking_required = excluded.project_tracking_required,
  updated_at = now();

notify pgrst, 'reload schema';
