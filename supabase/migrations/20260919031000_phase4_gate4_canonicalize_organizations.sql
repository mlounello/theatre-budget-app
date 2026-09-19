-- Phase 4 Gate 4: consolidate organization identities without deleting history.
-- The selected canonical rows are the current FY27 identities. Their FY is
-- moved to fiscal_year_organizations; the organization rows become enduring.

insert into app_theatre_budget.organization_consolidation_map (
  legacy_organization_id,
  canonical_organization_id,
  normalized_org_code,
  canonical_display_name,
  status,
  decision_note
)
values
  (
    '6054084f-3be7-4b35-bb87-08543e41365c',
    '3a3c0ae6-9be3-4e82-950b-15ad820244cd',
    '2ac200',
    'Theatre',
    'planned',
    'FY27 identity retained as canonical; global identity superseded.'
  ),
  (
    'd9d3d185-ce96-46bf-9da4-2f8818f6c86c',
    '52b71d8a-6e73-4b12-8ef1-bc1e59d52f2e',
    '2ac230',
    'Theatre Productions',
    'planned',
    'FY27 Theatre Productions identity retained as canonical; Theatre Department remains historically traceable.'
  ),
  (
    '9a6802af-6559-424c-9f6c-62a94877dfd0',
    '210e3c74-e1a6-47fa-819d-b444c06e5736',
    '3pe000',
    'Events',
    'planned',
    'FY27 identity retained as canonical; global identity superseded.'
  ),
  (
    '07abbbb4-0877-4988-a868-187fc6dc01d9',
    '3370dae1-1140-47ac-9a01-ee8d15033fe0',
    'sj5000',
    'University Events',
    'planned',
    'FY27 identity retained as canonical. The colliding historical 11080 plan remains on this superseded identity.'
  ),
  (
    '0b102505-50c3-4ffc-9737-6f9ee189f606',
    '3370dae1-1140-47ac-9a01-ee8d15033fe0',
    'sj5000',
    'University Events',
    'planned',
    'FY27 identity retained as canonical; FY26 identity superseded.'
  )
on conflict (legacy_organization_id) do update
set
  canonical_organization_id = excluded.canonical_organization_id,
  normalized_org_code = excluded.normalized_org_code,
  canonical_display_name = excluded.canonical_display_name,
  decision_note = excluded.decision_note;

-- Create every needed canonical FY membership before references move.
insert into app_theatre_budget.fiscal_year_organizations (
  fiscal_year_id,
  organization_id,
  active,
  sort_order,
  project_tracking_required
)
select distinct on (membership.fiscal_year_id, mapping.canonical_organization_id)
  membership.fiscal_year_id,
  mapping.canonical_organization_id,
  true,
  membership.sort_order,
  membership.project_tracking_required
from app_theatre_budget.organization_consolidation_map mapping
join app_theatre_budget.fiscal_year_organizations membership
  on membership.organization_id = mapping.legacy_organization_id
where mapping.status = 'planned'
order by membership.fiscal_year_id, mapping.canonical_organization_id, membership.active desc, membership.updated_at desc
on conflict (fiscal_year_id, organization_id) do update
set
  active = true,
  sort_order = excluded.sort_order,
  project_tracking_required = excluded.project_tracking_required,
  updated_at = now();

-- Canonical identities become enduring before transaction references move.
-- This prevents legacy FY-assignment triggers from treating the canonical row
-- itself as a competing fiscal-year source during the repoint.
update app_theatre_budget.organizations canonical
set
  name = mapping.canonical_display_name,
  fiscal_year_id = null,
  active = true,
  superseded_by_organization_id = null
from (
  select distinct canonical_organization_id, normalized_org_code, canonical_display_name
  from app_theatre_budget.organization_consolidation_map
  where status = 'planned'
) mapping
where canonical.id = mapping.canonical_organization_id;

-- A transaction-local helper logs every row before changing its FK.
create or replace function pg_temp.repoint_organization_reference(
  p_table regclass,
  p_column text,
  p_fiscal_year_expression text default 'null::uuid',
  p_predicate text default 'true'
)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  execute format(
    'insert into app_theatre_budget.organization_reference_repoint_log (
       mapping_id, source_table, source_column, source_row_id,
       original_organization_id, canonical_organization_id, fiscal_year_id
     )
     select mapping.id, %L, %L, source.id, source.%I,
            mapping.canonical_organization_id, %s
     from %s source
     join app_theatre_budget.organization_consolidation_map mapping
       on mapping.legacy_organization_id = source.%I
     where mapping.status = ''planned'' and (%s)
     on conflict (source_table, source_column, source_row_id, original_organization_id) do nothing',
    p_table::text,
    p_column,
    p_column,
    p_fiscal_year_expression,
    p_table,
    p_column,
    p_predicate
  );

  execute format(
    'update %s source
     set %I = mapping.canonical_organization_id
     from app_theatre_budget.organization_consolidation_map mapping
     where mapping.status = ''planned''
       and source.%I = mapping.legacy_organization_id
       and (%s)',
    p_table,
    p_column,
    p_column,
    p_predicate
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Repoint direct relationships. The one approved historical SJ5000 plan is
-- deliberately retained on its superseded identity to avoid a uniqueness
-- collision and to preserve the pre-Gate-4 financial baseline.
select pg_temp.repoint_organization_reference(
  'app_theatre_budget.budget_plans',
  'organization_id',
  'source.fiscal_year_id',
  'source.id <> ''c1478552-6149-4b16-a161-888e3762ed0c''::uuid'
);
select pg_temp.repoint_organization_reference('app_theatre_budget.cc_statement_lines', 'organization_id', 'source.fiscal_year_id');
select pg_temp.repoint_organization_reference('app_theatre_budget.cc_statement_months', 'organization_id', 'source.fiscal_year_id');
select pg_temp.repoint_organization_reference('app_theatre_budget.contracts', 'organization_id', 'source.fiscal_year_id');
select pg_temp.repoint_organization_reference('app_theatre_budget.foapals', 'organization_id');
select pg_temp.repoint_organization_reference('app_theatre_budget.income_lines', 'organization_id', 'source.fiscal_year_id');
select pg_temp.repoint_organization_reference('app_theatre_budget.institutional_budget_commitments', 'organization_id', 'source.fiscal_year_id');
select pg_temp.repoint_organization_reference('app_theatre_budget.projects', 'organization_id', 'source.fiscal_year_id');
select pg_temp.repoint_organization_reference('app_theatre_budget.purchases', 'organization_id', 'source.fiscal_year_id');
select pg_temp.repoint_organization_reference('app_theatre_budget.user_access_scopes', 'organization_id', 'source.fiscal_year_id');
select pg_temp.repoint_organization_reference(
  'app_theatre_budget.variance_request_lines',
  'from_organization_id',
  '(select request.fiscal_year_id from app_theatre_budget.variance_requests request where request.id = source.variance_request_id)'
);
select pg_temp.repoint_organization_reference(
  'app_theatre_budget.variance_request_lines',
  'to_organization_id',
  '(select request.fiscal_year_id from app_theatre_budget.variance_requests request where request.id = source.variance_request_id)'
);
select pg_temp.repoint_organization_reference(
  'app_theatre_budget.variance_request_targets',
  'organization_id',
  '(select request.fiscal_year_id from app_theatre_budget.variance_requests request where request.id = source.variance_request_id)'
);

-- Legacy memberships remain traceable but inactive.
update app_theatre_budget.fiscal_year_organizations membership
set active = false, updated_at = now()
from app_theatre_budget.organization_consolidation_map mapping
where mapping.status = 'planned'
  and membership.organization_id = mapping.legacy_organization_id;

-- Legacy organization rows are superseded, never deleted.
update app_theatre_budget.organizations legacy
set
  active = false,
  superseded_by_organization_id = mapping.canonical_organization_id
from app_theatre_budget.organization_consolidation_map mapping
where mapping.status = 'planned'
  and legacy.id = mapping.legacy_organization_id;

update app_theatre_budget.organization_consolidation_map
set status = 'applied', applied_at = now()
where status = 'planned';

-- Enforce one active canonical identity per normalized code.
create unique index organizations_one_active_canonical_code
  on app_theatre_budget.organizations(lower(trim(org_code)))
  where active = true and superseded_by_organization_id is null;

create or replace function app_theatre_budget.validate_active_canonical_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
begin
  if new.active and not exists (
    select 1 from app_theatre_budget.organizations organization
    where organization.id = new.organization_id
      and organization.active = true
      and organization.superseded_by_organization_id is null
  ) then
    raise exception 'Active fiscal-year membership requires an active canonical organization.';
  end if;
  return new;
end;
$$;

create trigger fiscal_year_organizations_validate_canonical
before insert or update of organization_id, active
on app_theatre_budget.fiscal_year_organizations
for each row execute function app_theatre_budget.validate_active_canonical_membership();

notify pgrst, 'reload schema';
