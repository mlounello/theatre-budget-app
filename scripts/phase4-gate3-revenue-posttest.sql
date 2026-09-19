\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 3: institutional revenue postconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when exists (
  select 1
  from information_schema.views
  where table_schema = 'app_theatre_budget'
    and table_name = 'v_institutional_revenue_performance'
) then 1 else 0 end as revenue_performance_view_exists;

select 1 / case when not exists (
  select 1
  from v_institutional_revenue_performance performance
  where performance.target_amount < 0
     or performance.received_amount < 0
     or performance.remaining_to_target < 0
     or performance.over_target_amount < 0
) then 1 else 0 end as revenue_metrics_are_nonnegative;

select 1 / case when not exists (
  select 1
  from v_institutional_revenue_performance performance
  where round(performance.received_amount - performance.target_amount, 2)
    <> round(performance.over_target_amount - performance.remaining_to_target, 2)
) then 1 else 0 end as revenue_metrics_reconcile;

rollback;
