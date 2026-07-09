with contract_payment_dates as (
  select
    p.id as purchase_id,
    ci.purchase_id as installment_purchase_id,
    coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date)::date as order_date
  from app_theatre_budget.purchases p
  join app_theatre_budget.contract_installments ci
    on ci.purchase_id = p.id
  where p.request_type = 'contract_payment'
    and coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date) is not null
)
update app_theatre_budget.purchases p
set ordered_on = cpd.order_date
from contract_payment_dates cpd
where p.id = cpd.purchase_id
  and p.ordered_on is distinct from cpd.order_date;

with contract_payment_targets as (
  select
    p.id as purchase_id,
    pa.id as purchase_allocation_id,
    coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date)::date as order_date,
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
  left join app_theatre_budget.purchase_allocations pa
    on pa.purchase_id = p.id
  left join app_theatre_budget.project_budget_lines pbl
    on pbl.id = coalesce(pa.reporting_budget_line_id, p.budget_line_id)
  join app_theatre_budget.fiscal_years fy
    on fy.start_date <= coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date)::date
   and fy.end_date >= coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date)::date
  join app_theatre_budget.budget_plans bp
    on bp.fiscal_year_id = fy.id
   and bp.organization_id = coalesce(p.organization_id, pr.organization_id)
   and bp.account_code_id = coalesce(pa.account_code_id, pbl.account_code_id, p.banner_account_code_id)
  join app_theatre_budget.budget_plan_months bpm
    on bpm.budget_plan_id = bp.id
   and bpm.month_start = date_trunc('month', coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date)::date)::date
  where p.request_type = 'contract_payment'
    and coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date) is not null
    and pa.id is not null
)
update app_theatre_budget.institutional_budget_commitments ibc
set
  fiscal_year_id = cpt.fiscal_year_id,
  organization_id = cpt.organization_id,
  account_code_id = cpt.account_code_id,
  budget_plan_month_id = cpt.budget_plan_month_id,
  order_date = cpt.order_date,
  committed_amount = cpt.committed_amount,
  updated_at = now()
from contract_payment_targets cpt
where ibc.purchase_id = cpt.purchase_id
  and ibc.purchase_allocation_id = cpt.purchase_allocation_id
  and (
    ibc.budget_plan_month_id is distinct from cpt.budget_plan_month_id
    or ibc.order_date is distinct from cpt.order_date
    or ibc.committed_amount is distinct from cpt.committed_amount
  );
