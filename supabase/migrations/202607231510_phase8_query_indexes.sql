begin;

-- Measured Phase 8 indexes for the highest-read Theatre Budget relations.
-- These are additive and do not rewrite or remove any financial records.

create index if not exists idx_tb_purchases_project
  on app_theatre_budget.purchases (project_id);
create index if not exists idx_tb_purchases_budget_line
  on app_theatre_budget.purchases (budget_line_id);
create index if not exists idx_tb_purchases_vendor
  on app_theatre_budget.purchases (vendor_id)
  where vendor_id is not null;
create index if not exists idx_tb_purchase_events_purchase_changed
  on app_theatre_budget.purchase_events (purchase_id, changed_at desc);
create index if not exists idx_tb_project_budget_lines_account_code
  on app_theatre_budget.project_budget_lines (account_code_id)
  where account_code_id is not null;

commit;
