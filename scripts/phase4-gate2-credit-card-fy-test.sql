\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 2: Credit Card fiscal-year assertions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when (
  select count(*) from information_schema.columns
  where table_schema = 'app_theatre_budget'
    and table_name = 'cc_statement_months'
    and column_name in ('fiscal_year_id', 'organization_id')
    and is_nullable = 'YES'
) = 2 then 1 else 0 end as statement_month_scope_columns_exist;

select 1 / case when (
  select count(*) from information_schema.columns
  where table_schema = 'app_theatre_budget'
    and table_name = 'cc_statement_lines'
    and column_name in ('fiscal_year_id', 'organization_id', 'banner_account_code_id')
    and is_nullable = 'YES'
) = 3 then 1 else 0 end as statement_line_scope_columns_exist;

select 1 / case when not exists (
  select 1
  from cc_statement_months statement
  where statement.fiscal_year_id is null
    and not exists (
      select 1
      from fiscal_year_assignment_conflicts conflict
      where conflict.entity_table = 'cc_statement_months'
        and conflict.entity_id = statement.id
        and conflict.status = 'open'
        and conflict.conflict_type in ('date_review_required', 'unresolved')
    )
) then 1 else 0 end as every_unassigned_statement_is_reported;

select 1 / case when not exists (
  select 1
  from fiscal_year_assignment_conflicts conflict
  where conflict.entity_table = 'cc_statement_months'
    and conflict.conflict_type = 'date_review_required'
    and conflict.status = 'open'
    and conflict.proposed_fiscal_year_id is null
) then 1 else 0 end as every_statement_date_review_has_a_proposed_fy;

select 1 / case when (
  select count(*)
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'app_theatre_budget'
    and (
      (relation.relname = 'cc_statement_months' and trigger.tgname = 'cc_statement_months_assign_fiscal_year')
      or (relation.relname = 'cc_statement_lines' and trigger.tgname = 'cc_statement_lines_assign_scope')
    )
) = 2 then 1 else 0 end as credit_card_assignment_triggers_exist;

select 1 / case when exists (
  select 1 from information_schema.columns
  where table_schema = 'app_theatre_budget'
    and table_name = 'cc_statement_lines'
    and column_name = 'project_budget_line_id'
    and is_nullable = 'NO'
) then 1 else 0 end as project_only_line_requirement_is_preserved;

rollback;
