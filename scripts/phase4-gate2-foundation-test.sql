\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 2: fiscal-year foundation assertions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when exists (
  select 1 from information_schema.tables
  where table_schema = 'app_theatre_budget'
    and table_name = 'fiscal_year_organizations'
) then 1 else 0 end as membership_table_exists;

select 1 / case when exists (
  select 1 from information_schema.tables
  where table_schema = 'app_theatre_budget'
    and table_name = 'fiscal_year_assignment_conflicts'
) then 1 else 0 end as conflict_table_exists;

select 1 / case when (
  select count(*) from fiscal_year_organizations
) = 7 then 1 else 0 end as expected_membership_count;

select 1 / case when not exists (
  select 1
  from fiscal_year_organizations membership
  join organizations organization on organization.id = membership.organization_id
  group by membership.fiscal_year_id, lower(trim(organization.org_code))
  having count(*) > 1
) then 1 else 0 end as one_membership_per_fy_org_code;

select 1 / case when not exists (
  select 1
  from fiscal_year_organizations membership
  join organizations organization on organization.id = membership.organization_id
  where membership.project_tracking_required is distinct from organization.project_tracking_required
) then 1 else 0 end as membership_settings_match_source;

select 1 / case when not exists (
  select 1 from organizations
  where not active or superseded_by_organization_id is not null
) then 1 else 0 end as no_organization_was_retired;

select 1 / case when not exists (
  select 1
  from fiscal_year_assignment_conflicts
  where entity_table not in ('income_lines', 'cc_statement_months')
) then 1 else 0 end as no_unexpected_foundation_conflicts;

select 1 / case when (
  select relrowsecurity from pg_class
  where oid = 'app_theatre_budget.fiscal_year_organizations'::regclass
) and (
  select relrowsecurity from pg_class
  where oid = 'app_theatre_budget.fiscal_year_assignment_conflicts'::regclass
) then 1 else 0 end as new_tables_have_rls;

rollback;
