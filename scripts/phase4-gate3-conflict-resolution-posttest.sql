\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 3: conflict-resolution postconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when not exists (
  select 1 from purchases where fiscal_year_id is null
) then 1 else 0 end as purchases_all_have_fiscal_year;

select 1 / case when not exists (
  select 1 from income_lines where fiscal_year_id is null
) then 1 else 0 end as income_all_has_fiscal_year;

select 1 / case when not exists (
  select 1 from cc_statement_months where fiscal_year_id is null
) then 1 else 0 end as statement_months_all_have_fiscal_year;

select 1 / case when not exists (
  select 1 from cc_statement_lines where fiscal_year_id is null
) then 1 else 0 end as statement_lines_all_have_fiscal_year;

select 1 / case when not exists (
  select 1
  from fiscal_year_assignment_conflicts
  where status = 'open'
    and entity_table in (
      'purchases', 'income_lines', 'cc_statement_months', 'cc_statement_lines'
    )
) then 1 else 0 end as no_transaction_fy_conflicts_remain_open;

select 1 / case when (
  select count(*)
  from fiscal_year_assignment_conflicts
  where entity_table in ('income_lines', 'cc_statement_months')
    and status = 'resolved'
    and resolved_fiscal_year_id is not null
    and resolution_note = 'Gate 3: user-approved date-based fiscal-year assignment'
) = 26 then 1 else 0 end as all_reviewed_conflicts_are_explicitly_resolved;

rollback;
