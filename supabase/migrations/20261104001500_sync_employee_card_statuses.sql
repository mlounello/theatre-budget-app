-- Bring any employee-card purchases created before automatic status syncing
-- into the same lifecycle as their linked receipts and statement month.

with employee_card_state as (
  select
    purchase.id,
    case
      when exists (
        select 1
        from app_theatre_budget.purchase_receipts receipt
        join app_theatre_budget.cc_statement_months statement
          on statement.id = receipt.cc_statement_month_id
        where (receipt.authorization_purchase_id = purchase.id or receipt.purchase_id = purchase.id)
          and statement.posted_to_banner_at is not null
      ) or direct_statement.posted_to_banner_at is not null then 'posted_to_account'
      when exists (
        select 1
        from app_theatre_budget.purchase_receipts receipt
        join app_theatre_budget.cc_statement_months statement
          on statement.id = receipt.cc_statement_month_id
        where (receipt.authorization_purchase_id = purchase.id or receipt.purchase_id = purchase.id)
          and statement.posted_at is not null
      ) or direct_statement.posted_at is not null then 'statement_paid'
      when exists (
        select 1
        from app_theatre_budget.purchase_receipts receipt
        where receipt.authorization_purchase_id = purchase.id or receipt.purchase_id = purchase.id
      ) then 'receipts_uploaded'
      else 'requested'
    end as workflow_status
  from app_theatre_budget.purchases purchase
  left join app_theatre_budget.cc_statement_months direct_statement
    on direct_statement.id = purchase.cc_statement_month_id
  where purchase.expense_stage = 'employee_card'
)
update app_theatre_budget.purchases purchase
set procurement_status = state.workflow_status,
    cc_workflow_status = state.workflow_status,
    updated_at = now()
from employee_card_state state
where purchase.id = state.id
  and (
    purchase.procurement_status is distinct from state.workflow_status
    or purchase.cc_workflow_status is distinct from state.workflow_status
  );

notify pgrst, 'reload schema';
