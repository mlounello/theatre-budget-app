-- A project's reporting classification and an allocation's funding organization
-- are independent. They must share the parent PO's fiscal year, but a project may
-- be paid from another authorized organization budget.

create or replace function app_theatre_budget.validate_purchase_allocation_target()
returns trigger
language plpgsql
set search_path = app_theatre_budget, public
as $$
declare
  v_purchase_fiscal_year_id uuid;
  v_project_fiscal_year_id uuid;
  v_line_project_id uuid;
  v_line_category_id uuid;
  v_project_tracking_required boolean;
begin
  select fiscal_year_id into v_purchase_fiscal_year_id
  from app_theatre_budget.purchases
  where id = new.purchase_id;

  if v_purchase_fiscal_year_id is null then
    raise exception 'A PO allocation requires a parent purchase with a fiscal year.';
  end if;

  if new.reporting_budget_line_id is not null then
    select line.project_id, line.production_category_id
      into v_line_project_id, v_line_category_id
    from app_theatre_budget.project_budget_lines line
    where line.id = new.reporting_budget_line_id;
    if v_line_project_id is null then
      raise exception 'The allocation budget line does not exist.';
    end if;
    if new.project_id is null then
      new.project_id := v_line_project_id;
    elsif new.project_id is distinct from v_line_project_id then
      raise exception 'The allocation budget line must belong to its selected project.';
    end if;
    if new.production_category_id is null then
      new.production_category_id := v_line_category_id;
    elsif v_line_category_id is not null and new.production_category_id is distinct from v_line_category_id then
      raise exception 'The allocation category must match its project budget line.';
    end if;
  end if;

  if new.project_id is not null then
    select project.fiscal_year_id
      into v_project_fiscal_year_id
    from app_theatre_budget.projects project
    where project.id = new.project_id;
    if v_project_fiscal_year_id is null then
      raise exception 'The allocation project does not exist.';
    end if;
    if v_project_fiscal_year_id is distinct from v_purchase_fiscal_year_id then
      raise exception 'A PO allocation must stay inside the parent PO fiscal year.';
    end if;
  end if;

  if new.organization_id is null then
    raise exception 'Every PO allocation requires an organization.';
  end if;

  select membership.project_tracking_required
    into v_project_tracking_required
  from app_theatre_budget.fiscal_year_organizations membership
  where membership.fiscal_year_id = v_purchase_fiscal_year_id
    and membership.organization_id = new.organization_id
    and membership.active = true;

  if v_project_tracking_required is null then
    raise exception 'The allocation organization is not active in this fiscal year.';
  end if;
  if v_project_tracking_required and new.project_id is null then
    raise exception 'That organization requires a project for every allocation.';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
