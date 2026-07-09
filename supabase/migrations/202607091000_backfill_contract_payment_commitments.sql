with contract_payment_targets as (
  select
    p.id as purchase_id,
    pa.id as purchase_allocation_id,
    coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date, p.ordered_on, p.purchase_date, p.created_at::date)::date as order_date,
    fy.id as fiscal_year_id,
    coalesce(p.organization_id, pr.organization_id) as organization_id,
    coalesce(pa.account_code_id, pbl.account_code_id, p.banner_account_code_id) as account_code_id,
    bpm.id as budget_plan_month_id,
    pa.amount as committed_amount
  from app_theatre_budget.purchases p
  join app_theatre_budget.contract_installments ci
    on ci.purchase_id = p.id
  left join app_theatre_budget.projects pr
    on pr.id = p.project_id
  join app_theatre_budget.purchase_allocations pa
    on pa.purchase_id = p.id
  left join app_theatre_budget.project_budget_lines pbl
    on pbl.id = coalesce(pa.reporting_budget_line_id, p.budget_line_id)
  join app_theatre_budget.fiscal_years fy
    on fy.start_date <= coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date, p.ordered_on, p.purchase_date, p.created_at::date)::date
   and fy.end_date >= coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date, p.ordered_on, p.purchase_date, p.created_at::date)::date
  join app_theatre_budget.budget_plans bp
    on bp.fiscal_year_id = fy.id
   and bp.organization_id = coalesce(p.organization_id, pr.organization_id)
   and bp.account_code_id = coalesce(pa.account_code_id, pbl.account_code_id, p.banner_account_code_id)
  join app_theatre_budget.budget_plan_months bpm
    on bpm.budget_plan_id = bp.id
   and bpm.month_start = date_trunc('month', coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date, p.ordered_on, p.purchase_date, p.created_at::date)::date)::date
  where p.request_type = 'contract_payment'
    and p.status is distinct from 'cancelled'
    and pa.id is not null
    and pa.amount is not null
)
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
  cpt.purchase_id,
  cpt.purchase_allocation_id,
  cpt.fiscal_year_id,
  cpt.organization_id,
  cpt.account_code_id,
  cpt.budget_plan_month_id,
  cpt.order_date,
  cpt.committed_amount,
  'submitted'
from contract_payment_targets cpt
where not exists (
  select 1
  from app_theatre_budget.institutional_budget_commitments ibc
  where ibc.purchase_allocation_id = cpt.purchase_allocation_id
);
