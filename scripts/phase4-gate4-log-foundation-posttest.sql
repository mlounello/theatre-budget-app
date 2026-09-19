\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 4: consolidation log foundation postconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when to_regclass('app_theatre_budget.organization_consolidation_map') is not null
  then 1 else 0 end as mapping_table_exists;

select 1 / case when to_regclass('app_theatre_budget.organization_reference_repoint_log') is not null
  then 1 else 0 end as repoint_log_exists;

select 1 / case when (
  select count(*) from pg_policies
  where schemaname = 'app_theatre_budget'
    and policyname in ('organization_consolidation_map_admin_read', 'organization_reference_repoint_log_admin_read')
) = 2 then 1 else 0 end as admin_read_policies_exist;

rollback;
