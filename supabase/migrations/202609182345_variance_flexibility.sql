-- Permit expense-budget transfers across organizations and months while keeping
-- fiscal years isolated and recording cross-organization movement for audit.

create or replace function app_theatre_budget.validate_variance_line_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
declare
  v_source_fiscal_year_id uuid;
  v_target_fiscal_year_id uuid;
  v_source_organization_id uuid;
  v_target_organization_id uuid;
  v_source_is_revenue boolean;
begin
  select plan.fiscal_year_id, plan.organization_id, account.is_revenue
  into v_source_fiscal_year_id, v_source_organization_id, v_source_is_revenue
  from app_theatre_budget.budget_plan_months month
  join app_theatre_budget.budget_plans plan on plan.id = month.budget_plan_id
  join app_theatre_budget.account_codes account on account.id = plan.account_code_id
  where month.id = new.from_budget_plan_month_id;

  select plan.fiscal_year_id, plan.organization_id
  into v_target_fiscal_year_id, v_target_organization_id
  from app_theatre_budget.budget_plan_months month
  join app_theatre_budget.budget_plans plan on plan.id = month.budget_plan_id
  where month.id = new.to_budget_plan_month_id;

  if v_source_fiscal_year_id is null or v_target_fiscal_year_id is null then
    raise exception 'Variance source and target budget months are required.';
  end if;
  if v_source_fiscal_year_id <> v_target_fiscal_year_id then
    raise exception 'Variance sources and targets must belong to the same fiscal year.';
  end if;
  if coalesce(v_source_is_revenue, false) then
    raise exception 'Revenue targets cannot fund a variance.';
  end if;

  new.from_organization_id := v_source_organization_id;
  new.to_organization_id := v_target_organization_id;
  new.cross_org_override := v_source_organization_id <> v_target_organization_id;
  return new;
end;
$$;

drop trigger if exists variance_lines_validate_scope on app_theatre_budget.variance_request_lines;
create trigger variance_lines_validate_scope
before insert or update of from_budget_plan_month_id, to_budget_plan_month_id
on app_theatre_budget.variance_request_lines
for each row execute function app_theatre_budget.validate_variance_line_scope();
