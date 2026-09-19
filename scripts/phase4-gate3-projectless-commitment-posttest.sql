\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 3: projectless institutional commitment backfill postconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when count(*) = 2 and sum(commitment.committed_amount) = 658.08
  then 1 else 0 end as expected_legacy_commitments_created
from institutional_budget_commitments commitment
where commitment.purchase_id in (
  'f97583ec-ab7d-438a-a384-401d1968cf71'::uuid,
  '1b753a7c-8b70-4d77-9b5b-6dc807157a2c'::uuid
)
  and commitment.commitment_status = 'submitted';

select 1 / case when not exists (
  select 1
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
      select 1 from institutional_budget_commitments commitment
      where commitment.purchase_id = purchase.id
    )
) then 1 else 0 end as no_eligible_projectless_purchase_is_missing;

rollback;
