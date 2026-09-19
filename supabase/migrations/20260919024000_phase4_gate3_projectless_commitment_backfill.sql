-- Phase 4 Gate 3: bring legacy projectless posted purchases into institutional
-- monthly availability. Current writers already perform this sync on save.

insert into app_theatre_budget.institutional_budget_commitments (
  purchase_id,
  purchase_allocation_id,
  fiscal_year_id,
  organization_id,
  account_code_id,
  budget_plan_month_id,
  order_date,
  committed_amount,
  commitment_status
)
select
  purchase.id,
  null,
  purchase.fiscal_year_id,
  purchase.organization_id,
  purchase.banner_account_code_id,
  budget_month.id,
  coalesce(purchase.ordered_on, purchase.purchase_date, purchase.created_at::date),
  purchase.posted_amount,
  'submitted'
from app_theatre_budget.purchases purchase
join app_theatre_budget.budget_plans plan
  on plan.fiscal_year_id = purchase.fiscal_year_id
 and plan.organization_id = purchase.organization_id
 and plan.account_code_id = purchase.banner_account_code_id
join app_theatre_budget.budget_plan_months budget_month
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
    from app_theatre_budget.institutional_budget_commitments commitment
    where commitment.purchase_id = purchase.id
  );

notify pgrst, 'reload schema';
