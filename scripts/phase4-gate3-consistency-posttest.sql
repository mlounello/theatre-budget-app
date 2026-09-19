\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 3: transaction consistency postconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when (
  select count(*)
  from information_schema.columns
  where table_schema = 'app_theatre_budget'
    and column_name = 'fiscal_year_id'
    and is_nullable = 'NO'
    and table_name in ('purchases', 'income_lines', 'cc_statement_months', 'cc_statement_lines')
) = 4 then 1 else 0 end as transaction_fiscal_years_are_required;

select 1 / case when exists (
  select 1
  from information_schema.columns
  where table_schema = 'app_theatre_budget'
    and table_name = 'cc_statement_lines'
    and column_name = 'project_budget_line_id'
    and is_nullable = 'YES'
) then 1 else 0 end as statement_lines_support_projectless_scope;

select 1 / case when (
  select count(*)
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'app_theatre_budget'
    and trigger.tgname in (
      'purchases_validate_fiscal_scope',
      'income_lines_validate_fiscal_scope',
      'cc_statement_months_validate_fiscal_scope',
      'cc_statement_lines_validate_fiscal_scope',
      'purchase_receipts_validate_statement_fy'
    )
) = 5 then 1 else 0 end as fiscal_scope_validation_triggers_exist;

select 1 / case when exists (
  select 1 from pg_constraint
  where conrelid = 'app_theatre_budget.cc_statement_lines'::regclass
    and conname = 'cc_statement_lines_project_or_organization_scope'
) then 1 else 0 end as statement_line_scope_constraint_exists;

rollback;
