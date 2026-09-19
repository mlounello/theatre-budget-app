-- Phase 4 Gate 4: durable identity mapping and row-level repoint audit trail.

create table app_theatre_budget.organization_consolidation_map (
  id uuid primary key default gen_random_uuid(),
  legacy_organization_id uuid not null references app_theatre_budget.organizations(id) on delete restrict,
  canonical_organization_id uuid not null references app_theatre_budget.organizations(id) on delete restrict,
  normalized_org_code text not null,
  canonical_display_name text not null,
  status text not null default 'planned' check (status in ('planned', 'applied', 'reversed')),
  decision_note text,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (legacy_organization_id),
  check (legacy_organization_id <> canonical_organization_id)
);

create index organization_consolidation_map_canonical_idx
  on app_theatre_budget.organization_consolidation_map(canonical_organization_id);

create table app_theatre_budget.organization_reference_repoint_log (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references app_theatre_budget.organization_consolidation_map(id) on delete restrict,
  source_table text not null,
  source_column text not null,
  source_row_id uuid not null,
  original_organization_id uuid not null references app_theatre_budget.organizations(id) on delete restrict,
  canonical_organization_id uuid not null references app_theatre_budget.organizations(id) on delete restrict,
  fiscal_year_id uuid references app_theatre_budget.fiscal_years(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  repointed_at timestamptz not null default now(),
  unique (source_table, source_column, source_row_id, original_organization_id)
);

create index organization_reference_repoint_log_mapping_idx
  on app_theatre_budget.organization_reference_repoint_log(mapping_id);

alter table app_theatre_budget.organization_consolidation_map enable row level security;
alter table app_theatre_budget.organization_reference_repoint_log enable row level security;

create policy organization_consolidation_map_admin_read
on app_theatre_budget.organization_consolidation_map
for select to authenticated
using (app_theatre_budget.is_admin_user());

create policy organization_reference_repoint_log_admin_read
on app_theatre_budget.organization_reference_repoint_log
for select to authenticated
using (app_theatre_budget.is_admin_user());

grant select on app_theatre_budget.organization_consolidation_map to authenticated;
grant select on app_theatre_budget.organization_reference_repoint_log to authenticated;

notify pgrst, 'reload schema';
