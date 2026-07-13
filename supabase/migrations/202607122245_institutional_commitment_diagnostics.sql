create or replace view app_theatre_budget.v_institutional_commitment_diagnostics as
with source_rows as (
  select
    p.id as purchase_id,
    p.title as purchase_title,
    p.request_type,
    p.status as purchase_status,
    p.procurement_status,
    p.organization_id as purchase_organization_id,
    pr.organization_id as project_organization_id,
    raw_org.id as raw_organization_id,
    raw_org.org_code as raw_org_code,
    raw_org.name as raw_organization_name,
    raw_org.fiscal_year_id as raw_org_fiscal_year_id,
    coalesce(fy_org.id, raw_org.id) as normalized_organization_id,
    fy_org.id as fiscal_year_organization_id,
    fy_org.name as fiscal_year_organization_name,
    coalesce(p.ordered_on, p.purchase_date, p.created_at::date) as purchase_order_date,
    coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date, p.ordered_on, p.purchase_date, p.created_at::date)::date as institutional_order_date,
    fy.id as fiscal_year_id,
    fy.name as fiscal_year_name,
    pa.id as purchase_allocation_id,
    pa.amount as allocation_amount,
    coalesce(pa.account_code_id, pbl.account_code_id, p.banner_account_code_id) as account_code_id,
    ac.code as account_code,
    ac.name as account_name,
    bp.id as budget_plan_id,
    bpm.id as budget_plan_month_id,
    bpm.month_start,
    ibc.id as commitment_id,
    ibc.commitment_status,
    ibc.committed_amount,
    ci.id as contract_installment_id,
    ci.installment_number,
    ci.due_date as contract_due_date,
    ci.ap_receive_by,
    ci.mail_by
  from app_theatre_budget.purchases p
  left join app_theatre_budget.projects pr
    on pr.id = p.project_id
  left join app_theatre_budget.contract_installments ci
    on ci.purchase_id = p.id
  left join app_theatre_budget.purchase_allocations pa
    on pa.purchase_id = p.id
  left join app_theatre_budget.project_budget_lines pbl
    on pbl.id = coalesce(pa.reporting_budget_line_id, p.budget_line_id)
  left join app_theatre_budget.organizations raw_org
    on raw_org.id = coalesce(p.organization_id, pr.organization_id)
  left join app_theatre_budget.fiscal_years fy
    on fy.start_date <= coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date, p.ordered_on, p.purchase_date, p.created_at::date)::date
   and fy.end_date >= coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date, p.ordered_on, p.purchase_date, p.created_at::date)::date
  left join app_theatre_budget.organizations fy_org
    on fy_org.org_code = raw_org.org_code
   and fy_org.fiscal_year_id = fy.id
  left join app_theatre_budget.account_codes ac
    on ac.id = coalesce(pa.account_code_id, pbl.account_code_id, p.banner_account_code_id)
  left join app_theatre_budget.budget_plans bp
    on bp.fiscal_year_id = fy.id
   and bp.organization_id = coalesce(fy_org.id, raw_org.id)
   and bp.account_code_id = coalesce(pa.account_code_id, pbl.account_code_id, p.banner_account_code_id)
  left join app_theatre_budget.budget_plan_months bpm
    on bpm.budget_plan_id = bp.id
   and bpm.month_start = date_trunc('month', coalesce(ci.mail_by, ci.ap_receive_by, ci.due_date, p.ordered_on, p.purchase_date, p.created_at::date)::date)::date
  left join app_theatre_budget.institutional_budget_commitments ibc
    on ibc.purchase_allocation_id = pa.id
  where p.status is distinct from 'cancelled'
    and p.request_type in ('requisition', 'expense', 'contract', 'request', 'budget_transfer', 'contract_payment')
)
select
  *,
  case
    when purchase_allocation_id is null then 'missing_purchase_allocation'
    when raw_organization_id is null then 'missing_organization'
    when institutional_order_date is null then 'missing_order_date'
    when fiscal_year_id is null then 'missing_fiscal_year'
    when account_code_id is null then 'missing_account_code'
    when budget_plan_id is null then 'missing_budget_plan'
    when budget_plan_month_id is null then 'missing_budget_plan_month'
    when commitment_id is null then 'missing_commitment'
    when commitment_status = 'cancelled' then 'cancelled_commitment'
    else 'ok'
  end as diagnostic_status,
  (raw_organization_id is not null and fiscal_year_organization_id is not null and raw_organization_id <> fiscal_year_organization_id)
    as used_legacy_or_cross_year_org
from source_rows;

alter view app_theatre_budget.v_institutional_commitment_diagnostics set (security_invoker = true);

grant select on app_theatre_budget.v_institutional_commitment_diagnostics to authenticated;
