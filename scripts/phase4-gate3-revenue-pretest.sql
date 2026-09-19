\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 3: institutional revenue preconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when not exists (
  select 1
  from income_lines income
  where income.fiscal_year_id is null
) then 1 else 0 end as income_fiscal_year_is_complete;

select 1 / case when exists (
  select 1
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'app_theatre_budget'
    and relation.relname = 'purchases'
    and trigger.tgname = 'purchases_reject_new_revenue_spending'
) then 1 else 0 end as revenue_spending_guardrail_is_live;

select 1 / case when not exists (
  select 1
  from income_lines income
  join account_codes account on account.id = income.banner_account_code_id
  where account.is_revenue = false
    and income.income_type <> 'starting_budget'
) then 1 else 0 end as received_revenue_uses_revenue_accounts;

rollback;
