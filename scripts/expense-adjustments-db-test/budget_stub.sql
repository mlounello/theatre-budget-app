-- Extra stubs so the real allocation trigger and update_expense_budget_destination can run.
create table app_theatre_budget.projects (id uuid primary key, fiscal_year_id uuid, organization_id uuid);
create table app_theatre_budget.project_budget_lines (id uuid primary key default gen_random_uuid(), project_id uuid, production_category_id uuid);
create table app_theatre_budget.fiscal_year_organizations (fiscal_year_id uuid, organization_id uuid, active boolean, project_tracking_required boolean);
alter table app_theatre_budget.purchases add column project_id uuid, add column organization_id uuid, add column budget_line_id uuid,
  add column production_category_id uuid, add column banner_account_code_id uuid, add column budget_tracked boolean;
alter table app_theatre_budget.purchase_allocations add column project_id uuid, add column reporting_budget_line_id uuid, add column organization_id uuid,
  add column account_code_id uuid, add column production_category_id uuid, add column reporting_bucket text;
create function app_theatre_budget.ensure_project_category_line(p_project uuid, p_category uuid) returns uuid language plpgsql as $$
declare v uuid; begin
  select id into v from app_theatre_budget.project_budget_lines where project_id = p_project and production_category_id = p_category;
  if v is null then insert into app_theatre_budget.project_budget_lines (project_id, production_category_id) values (p_project, p_category) returning id into v; end if; return v; end $$;
grant select, insert, update, delete on all tables in schema app_theatre_budget to authenticated;
