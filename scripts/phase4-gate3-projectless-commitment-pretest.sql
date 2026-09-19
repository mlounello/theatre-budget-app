\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 3: projectless institutional commitment backfill preconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

-- The backfill is deliberately narrow: posted projectless purchases with an
-- explicit FY/org/account and an exact institutional month bucket, but no
-- existing commitment. These are the records the current application helper
-- would sync if they were saved again today.
with candidates as (
  select
    purchase.id,
    purchase.posted_amount,
    budget_month.id as budget_plan_month_id
  from purchases purchase
  join budget_plans plan
    on plan.fiscal_year_id = purchase.fiscal_year_id
   and plan.organization_id = purchase.organization_id
   and plan.account_code_id = purchase.banner_account_code_id
  join budget_plan_months budget_month
    on budget_month.budget_plan_id = plan.id
   and budget_month.month_start = date_trunc(
     'month',
     coalesce(purchase.ordered_on, purchase.purchase_date, purchase.created_at::date)
   )::date
  where purchase.project_id is null
    and purchase.status = 'posted'
    and purchase.posted_amount <> 0
    and not exists (
      select 1
      from institutional_budget_commitments commitment
      where commitment.purchase_id = purchase.id
    )
)
select 1 / case when count(*) = 2 and sum(posted_amount) = 658.08
  then 1 else 0 end as expected_legacy_backfill_set
from candidates;

rollback;
