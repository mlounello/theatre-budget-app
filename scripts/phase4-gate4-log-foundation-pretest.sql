\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 4: consolidation log foundation preconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when to_regclass('app_theatre_budget.organization_consolidation_map') is null
  then 1 else 0 end as mapping_table_not_yet_present;

select 1 / case when to_regclass('app_theatre_budget.organization_reference_repoint_log') is null
  then 1 else 0 end as repoint_log_not_yet_present;

rollback;
