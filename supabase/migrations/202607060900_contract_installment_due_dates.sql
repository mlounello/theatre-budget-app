alter table app_theatre_budget.contract_installments
  add column if not exists due_date date,
  add column if not exists ap_receive_by date,
  add column if not exists mail_by date;

create index if not exists idx_contract_installments_due_date
  on app_theatre_budget.contract_installments (due_date);

create index if not exists idx_contract_installments_mail_by
  on app_theatre_budget.contract_installments (mail_by);
