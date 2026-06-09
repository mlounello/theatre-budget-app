-- Add an explicit target bucket to variance requests so negative monthly
-- institutional buckets can open stable draft variances without guessing from
-- a purchase's largest commitment.

alter table app_theatre_budget.variance_requests
  add column if not exists target_budget_plan_month_id uuid
  references app_theatre_budget.budget_plan_months (id) on delete restrict;

create index if not exists idx_variance_requests_target_bucket
  on app_theatre_budget.variance_requests (target_budget_plan_month_id);
