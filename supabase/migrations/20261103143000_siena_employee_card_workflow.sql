-- Employee-issued Siena cards do not require an advance Expense Claim or
-- Expense number. Purchases are entered directly, receipts are staged against
-- them, and the final EC/EX identifiers are assigned during monthly
-- reconciliation.

alter table app_theatre_budget.purchases
  drop constraint if exists purchases_expense_stage_check;

alter table app_theatre_budget.purchases
  add constraint purchases_expense_stage_check
  check (
    expense_stage is null
    or expense_stage in ('authorization', 'employee_card', 'actual', 'reimbursement')
  );

comment on column app_theatre_budget.purchases.expense_stage is
  'Expense workflow: authorization, employee_card, actual monthly reconciliation, or reimbursement.';

notify pgrst, 'reload schema';
