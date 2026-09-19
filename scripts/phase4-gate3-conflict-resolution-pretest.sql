\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 3: conflict-resolution preconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when (
  select count(*)
  from fiscal_year_assignment_conflicts
  where status = 'open'
    and entity_table in ('income_lines', 'cc_statement_months')
) = 26 then 1 else 0 end as expected_reviewed_conflict_count;

select 1 / case when not exists (
  select 1
  from fiscal_year_assignment_conflicts conflict
  left join fiscal_years fiscal_year
    on fiscal_year.id = conflict.proposed_fiscal_year_id
  where conflict.status = 'open'
    and conflict.entity_table in ('income_lines', 'cc_statement_months')
    and (
      conflict.conflict_type <> 'date_review_required'
      or conflict.proposed_fiscal_year_id is null
      or fiscal_year.id is null
    )
) then 1 else 0 end as every_conflict_has_a_valid_proposed_fy;

select 1 / case when not exists (
  select 1
  from fiscal_year_assignment_conflicts conflict
  join income_lines income on income.id = conflict.entity_id
  join fiscal_years fiscal_year on fiscal_year.id = conflict.proposed_fiscal_year_id
  where conflict.entity_table = 'income_lines'
    and conflict.status = 'open'
    and coalesce(income.received_on, income.created_at::date)
      not between fiscal_year.start_date and fiscal_year.end_date
) then 1 else 0 end as income_dates_match_proposed_fy;

select 1 / case when not exists (
  select 1
  from fiscal_year_assignment_conflicts conflict
  join cc_statement_months statement on statement.id = conflict.entity_id
  join fiscal_years fiscal_year on fiscal_year.id = conflict.proposed_fiscal_year_id
  where conflict.entity_table = 'cc_statement_months'
    and conflict.status = 'open'
    and statement.statement_month
      not between fiscal_year.start_date and fiscal_year.end_date
) then 1 else 0 end as statement_dates_match_proposed_fy;

select 1 / case when not exists (
  select 1
  from fiscal_year_assignment_conflicts conflict
  join cc_statement_lines line on line.statement_month_id = conflict.entity_id
  where conflict.entity_table = 'cc_statement_months'
    and conflict.status = 'open'
    and line.fiscal_year_id is distinct from conflict.proposed_fiscal_year_id
) then 1 else 0 end as statement_lines_do_not_conflict;

rollback;
