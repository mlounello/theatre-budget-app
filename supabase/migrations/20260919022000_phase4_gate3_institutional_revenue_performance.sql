-- Phase 4 Gate 3: connect institutional revenue targets to posted income actuals.
-- Revenue remains non-spendable; this view is reporting-only.

create or replace view app_theatre_budget.v_institutional_revenue_performance as
with targets as (
  select
    plan.id as budget_plan_id,
    plan.fiscal_year_id,
    fiscal_year.name as fiscal_year_name,
    plan.organization_id,
    organization.org_code,
    organization.name as organization_name,
    plan.account_code_id,
    account.code as account_code,
    account.category as account_category,
    account.name as account_name,
    greatest(plan.annual_amount, 0)::numeric(12, 2) as target_amount
  from app_theatre_budget.budget_plans plan
  join app_theatre_budget.fiscal_years fiscal_year on fiscal_year.id = plan.fiscal_year_id
  join app_theatre_budget.organizations organization on organization.id = plan.organization_id
  join app_theatre_budget.account_codes account on account.id = plan.account_code_id
  where account.is_revenue = true
), actuals as (
  select
    income.fiscal_year_id,
    organization.org_code,
    income.banner_account_code_id as account_code_id,
    sum(income.amount)::numeric(12, 2) as received_amount
  from app_theatre_budget.income_lines income
  join app_theatre_budget.organizations organization on organization.id = income.organization_id
  join app_theatre_budget.account_codes account on account.id = income.banner_account_code_id
  where account.is_revenue = true
    and income.income_type <> 'starting_budget'
  group by income.fiscal_year_id, organization.org_code, income.banner_account_code_id
)
select
  target.budget_plan_id,
  target.fiscal_year_id,
  target.fiscal_year_name,
  target.organization_id,
  target.org_code,
  target.organization_name,
  target.account_code_id,
  target.account_code,
  target.account_category,
  target.account_name,
  target.target_amount,
  greatest(coalesce(actual.received_amount, 0), 0)::numeric(12, 2) as received_amount,
  greatest(target.target_amount - coalesce(actual.received_amount, 0), 0)::numeric(12, 2) as remaining_to_target,
  greatest(coalesce(actual.received_amount, 0) - target.target_amount, 0)::numeric(12, 2) as over_target_amount
from targets target
left join actuals actual
  on actual.fiscal_year_id = target.fiscal_year_id
 and actual.org_code = target.org_code
 and actual.account_code_id = target.account_code_id;

alter view app_theatre_budget.v_institutional_revenue_performance set (security_invoker = true);
grant select on app_theatre_budget.v_institutional_revenue_performance to authenticated;

notify pgrst, 'reload schema';
