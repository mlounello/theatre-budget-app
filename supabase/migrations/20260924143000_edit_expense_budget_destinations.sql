-- Allow the final budget destination of any existing EX Expense to be corrected
-- atomically without changing its claim, receipt, statement, or identifier history.

create or replace function app_theatre_budget.update_expense_budget_destination(
  p_purchase_id uuid,
  p_project_id uuid,
  p_organization_id uuid,
  p_production_category_id uuid,
  p_account_code_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = app_theatre_budget, public, auth
as $$
declare
  v_purchase app_theatre_budget.purchases%rowtype;
  v_project app_theatre_budget.projects%rowtype;
  v_budget_line_id uuid;
  v_amount numeric(12,2);
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Expense updates must be made by the signed-in user.';
  end if;
  if (p_project_id is null) = (p_organization_id is null) then
    raise exception 'Choose exactly one project or organization budget.';
  end if;
  if p_account_code_id is null then
    raise exception 'Choose a Banner account / FOAP charge.';
  end if;

  select * into v_purchase
  from app_theatre_budget.purchases
  where id = p_purchase_id
  for update;

  if not found or v_purchase.request_type <> 'expense' then
    raise exception 'Expense not found or outside your access scope.';
  end if;

  if p_project_id is not null then
    if p_production_category_id is null then
      raise exception 'Choose a Production Category for a theatre project Expense.';
    end if;
    select * into v_project
    from app_theatre_budget.projects
    where id = p_project_id;
    if not found or v_project.fiscal_year_id is distinct from v_purchase.fiscal_year_id then
      raise exception 'The selected project is outside this Expense fiscal year.';
    end if;
    v_budget_line_id := app_theatre_budget.ensure_project_category_line(
      p_project_id,
      p_production_category_id
    );
  else
    if not exists (
      select 1
      from app_theatre_budget.fiscal_year_organizations membership
      where membership.fiscal_year_id = v_purchase.fiscal_year_id
        and membership.organization_id = p_organization_id
        and membership.active = true
        and membership.project_tracking_required = false
    ) then
      raise exception 'That organization is not an active non-project budget in this fiscal year.';
    end if;
  end if;

  v_amount := coalesce(
    nullif(v_purchase.posted_amount, 0),
    nullif(v_purchase.pending_cc_amount, 0),
    nullif(v_purchase.requested_amount, 0),
    nullif(v_purchase.estimated_amount, 0),
    0
  );

  -- Remove the old destination before changing the purchase header so RLS checks
  -- the caller's access to the record as it existed when they opened it.
  delete from app_theatre_budget.purchase_allocations
  where purchase_id = p_purchase_id;

  update app_theatre_budget.purchases
  set project_id = p_project_id,
      organization_id = case when p_project_id is not null then v_project.organization_id else p_organization_id end,
      budget_line_id = v_budget_line_id,
      production_category_id = case when p_project_id is not null then p_production_category_id else null end,
      banner_account_code_id = p_account_code_id,
      budget_tracked = true
  where id = p_purchase_id;

  insert into app_theatre_budget.purchase_allocations (
    purchase_id,
    reporting_budget_line_id,
    organization_id,
    account_code_id,
    production_category_id,
    amount,
    reporting_bucket,
    note
  ) values (
    p_purchase_id,
    v_budget_line_id,
    case when p_project_id is null then p_organization_id else null end,
    p_account_code_id,
    case when p_project_id is not null then p_production_category_id else null end,
    v_amount,
    'direct',
    coalesce(v_purchase.reference_number || ' / ', '') || coalesce(v_purchase.expense_number, 'Expense')
  );

  insert into app_theatre_budget.purchase_events (
    purchase_id,
    from_status,
    to_status,
    estimated_amount_snapshot,
    requested_amount_snapshot,
    encumbered_amount_snapshot,
    pending_cc_amount_snapshot,
    posted_amount_snapshot,
    changed_by_user_id,
    note
  ) values (
    p_purchase_id,
    v_purchase.status,
    v_purchase.status,
    v_purchase.estimated_amount,
    v_purchase.requested_amount,
    v_purchase.encumbered_amount,
    v_purchase.pending_cc_amount,
    v_purchase.posted_amount,
    p_user_id,
    'Expense budget destination updated.'
  );

  return jsonb_build_object(
    'purchase_id', p_purchase_id,
    'project_id', p_project_id,
    'organization_id', case when p_project_id is not null then v_project.organization_id else p_organization_id end,
    'budget_line_id', v_budget_line_id
  );
end;
$$;

revoke all on function app_theatre_budget.update_expense_budget_destination(uuid, uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function app_theatre_budget.update_expense_budget_destination(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
