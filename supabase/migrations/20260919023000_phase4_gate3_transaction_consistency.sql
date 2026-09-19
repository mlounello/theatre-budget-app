-- Phase 4 Gate 3: require transaction fiscal years and enforce same-FY scope.
-- Apply only after compatible application writers are deployed.

alter table app_theatre_budget.cc_statement_lines
  alter column project_budget_line_id drop not null;

alter table app_theatre_budget.cc_statement_lines
  drop constraint if exists cc_statement_lines_project_or_organization_scope;
alter table app_theatre_budget.cc_statement_lines
  add constraint cc_statement_lines_project_or_organization_scope check (
    (project_budget_line_id is not null and banner_account_code_id is not null)
    or
    (project_budget_line_id is null and organization_id is not null and banner_account_code_id is not null)
  );

create or replace function app_theatre_budget.validate_transaction_fiscal_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
declare
  v_project_fiscal_year_id uuid;
  v_project_organization_id uuid;
begin
  if new.fiscal_year_id is null then
    raise exception 'Fiscal year is required for %.', tg_table_name;
  end if;

  if new.project_id is not null then
    select project.fiscal_year_id, project.organization_id
    into v_project_fiscal_year_id, v_project_organization_id
    from app_theatre_budget.projects project
    where project.id = new.project_id;

    if v_project_fiscal_year_id is null then
      raise exception 'Project % does not exist.', new.project_id;
    end if;
    if new.fiscal_year_id <> v_project_fiscal_year_id then
      raise exception 'Transaction fiscal year must match project fiscal year.';
    end if;
    if new.organization_id is not null and new.organization_id <> v_project_organization_id then
      raise exception 'Transaction organization must match project organization.';
    end if;
  end if;

  if new.organization_id is not null and not exists (
    select 1
    from app_theatre_budget.fiscal_year_organizations membership
    where membership.fiscal_year_id = new.fiscal_year_id
      and membership.organization_id = new.organization_id
      and membership.active = true
  ) then
    raise exception 'Organization is not active in the transaction fiscal year.';
  end if;

  return new;
end;
$$;

create or replace function app_theatre_budget.validate_cc_statement_line_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
declare
  v_statement_fiscal_year_id uuid;
  v_project_fiscal_year_id uuid;
  v_project_organization_id uuid;
begin
  select statement.fiscal_year_id
  into v_statement_fiscal_year_id
  from app_theatre_budget.cc_statement_months statement
  where statement.id = new.statement_month_id;

  if new.fiscal_year_id is null or new.fiscal_year_id <> v_statement_fiscal_year_id then
    raise exception 'Statement line fiscal year must match statement month fiscal year.';
  end if;

  if new.project_budget_line_id is not null then
    select project.fiscal_year_id, project.organization_id
    into v_project_fiscal_year_id, v_project_organization_id
    from app_theatre_budget.project_budget_lines budget_line
    join app_theatre_budget.projects project on project.id = budget_line.project_id
    where budget_line.id = new.project_budget_line_id;

    if v_project_fiscal_year_id is null or new.fiscal_year_id <> v_project_fiscal_year_id then
      raise exception 'Statement line fiscal year must match project fiscal year.';
    end if;
    if new.organization_id is distinct from v_project_organization_id then
      raise exception 'Statement line organization must match project organization.';
    end if;
  elsif new.organization_id is null or new.banner_account_code_id is null then
    raise exception 'Projectless statement lines require organization and Banner account.';
  end if;

  if not exists (
    select 1 from app_theatre_budget.fiscal_year_organizations membership
    where membership.fiscal_year_id = new.fiscal_year_id
      and membership.organization_id = new.organization_id
      and membership.active = true
  ) then
    raise exception 'Statement line organization is not active in the fiscal year.';
  end if;

  return new;
end;
$$;

create or replace function app_theatre_budget.validate_purchase_receipt_statement_fy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
declare
  v_purchase_fiscal_year_id uuid;
  v_statement_fiscal_year_id uuid;
begin
  if new.cc_statement_month_id is null then return new; end if;
  select fiscal_year_id into v_purchase_fiscal_year_id
  from app_theatre_budget.purchases where id = new.purchase_id;
  select fiscal_year_id into v_statement_fiscal_year_id
  from app_theatre_budget.cc_statement_months where id = new.cc_statement_month_id;
  if v_purchase_fiscal_year_id is null
     or v_statement_fiscal_year_id is null
     or v_purchase_fiscal_year_id <> v_statement_fiscal_year_id then
    raise exception 'Receipt and statement month must belong to the same fiscal year.';
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_validate_fiscal_scope on app_theatre_budget.purchases;
create trigger purchases_validate_fiscal_scope
before insert or update of fiscal_year_id, project_id, organization_id
on app_theatre_budget.purchases
for each row execute function app_theatre_budget.validate_transaction_fiscal_scope();

drop trigger if exists income_lines_validate_fiscal_scope on app_theatre_budget.income_lines;
create trigger income_lines_validate_fiscal_scope
before insert or update of fiscal_year_id, project_id, organization_id
on app_theatre_budget.income_lines
for each row execute function app_theatre_budget.validate_transaction_fiscal_scope();

drop trigger if exists cc_statement_months_validate_fiscal_scope on app_theatre_budget.cc_statement_months;
create trigger cc_statement_months_validate_fiscal_scope
before insert or update of fiscal_year_id, project_id, organization_id
on app_theatre_budget.cc_statement_months
for each row execute function app_theatre_budget.validate_transaction_fiscal_scope();

drop trigger if exists cc_statement_lines_validate_fiscal_scope on app_theatre_budget.cc_statement_lines;
create trigger cc_statement_lines_validate_fiscal_scope
before insert or update of statement_month_id, fiscal_year_id, project_budget_line_id, organization_id, banner_account_code_id
on app_theatre_budget.cc_statement_lines
for each row execute function app_theatre_budget.validate_cc_statement_line_scope();

drop trigger if exists purchase_receipts_validate_statement_fy on app_theatre_budget.purchase_receipts;
create trigger purchase_receipts_validate_statement_fy
before insert or update of purchase_id, cc_statement_month_id
on app_theatre_budget.purchase_receipts
for each row execute function app_theatre_budget.validate_purchase_receipt_statement_fy();

alter table app_theatre_budget.purchases alter column fiscal_year_id set not null;
alter table app_theatre_budget.income_lines alter column fiscal_year_id set not null;
alter table app_theatre_budget.cc_statement_months alter column fiscal_year_id set not null;
alter table app_theatre_budget.cc_statement_lines alter column fiscal_year_id set not null;

notify pgrst, 'reload schema';
