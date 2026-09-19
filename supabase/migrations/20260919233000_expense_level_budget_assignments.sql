-- Expense Claims are collections. Each EX Expense owns its budget/category/account assignment.

alter table app_theatre_budget.expense_claims
  alter column organization_id drop not null;

alter table app_theatre_budget.expense_claims
  drop constraint if exists expense_claims_scope_check;

drop policy if exists expense_claims_select_scoped on app_theatre_budget.expense_claims;
create policy expense_claims_select_scoped on app_theatre_budget.expense_claims
for select to authenticated using (
  entered_by_user_id = auth.uid()
  or app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.purchases purchase
    where purchase.expense_claim_id = expense_claims.id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id, purchase.organization_id, purchase.project_id,
        purchase.production_category_id,
        array['admin','project_manager','buyer','viewer']::app_theatre_budget.app_role[]
      )
  )
);

drop policy if exists expense_claims_insert_scoped on app_theatre_budget.expense_claims;
create policy expense_claims_insert_scoped on app_theatre_budget.expense_claims
for insert to authenticated with check (entered_by_user_id = auth.uid());

drop policy if exists expense_claims_update_scoped on app_theatre_budget.expense_claims;
create policy expense_claims_update_scoped on app_theatre_budget.expense_claims
for update to authenticated using (
  entered_by_user_id = auth.uid()
  or app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.purchases purchase
    where purchase.expense_claim_id = expense_claims.id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id, purchase.organization_id, purchase.project_id,
        purchase.production_category_id,
        array['admin','project_manager']::app_theatre_budget.app_role[]
      )
  )
) with check (
  entered_by_user_id = auth.uid()
  or app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.purchases purchase
    where purchase.expense_claim_id = expense_claims.id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id, purchase.organization_id, purchase.project_id,
        purchase.production_category_id,
        array['admin','project_manager']::app_theatre_budget.app_role[]
      )
  )
);

create or replace function app_theatre_budget.create_expense_claim_transaction(
  p_claim jsonb,
  p_expenses jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = app_theatre_budget, public, auth
as $$
declare
  v_claim_id uuid := coalesce(nullif(p_claim->>'id', '')::uuid, gen_random_uuid());
  v_user_id uuid := nullif(p_claim->>'entered_by_user_id', '')::uuid;
  v_claim_type text := p_claim->>'claim_type';
  v_claim_number text := p_claim->>'claim_number';
  v_authorization_claim_id uuid := nullif(p_claim->>'authorization_claim_id', '')::uuid;
  v_settled numeric(12,2);
  v_remaining numeric(12,2);
  v_authorized_total numeric(12,2);
  v_expense jsonb;
  v_purchase_ids uuid[] := '{}';
begin
  if auth.uid() is null or v_user_id is distinct from auth.uid() then
    raise exception 'Expense Claims must be created for the signed-in user.';
  end if;
  if jsonb_typeof(p_expenses) <> 'array' or jsonb_array_length(p_expenses) = 0 then
    raise exception 'At least one Expense is required.';
  end if;

  insert into app_theatre_budget.expense_claims (
    id, fiscal_year_id, project_id, organization_id, credit_card_id, claim_number,
    claim_type, claim_month, status, authorized_amount, settled_amount,
    authorization_claim_id, overage_explanation, notes, entered_by_user_id
  ) values (
    v_claim_id,
    (p_claim->>'fiscal_year_id')::uuid,
    null,
    null,
    nullif(p_claim->>'credit_card_id', '')::uuid,
    v_claim_number,
    v_claim_type,
    nullif(p_claim->>'claim_month', '')::date,
    p_claim->>'status',
    nullif(p_claim->>'authorized_amount', '')::numeric,
    nullif(p_claim->>'settled_amount', '')::numeric,
    v_authorization_claim_id,
    nullif(p_claim->>'overage_explanation', ''),
    nullif(p_claim->>'notes', ''),
    v_user_id
  );

  for v_expense in select value from jsonb_array_elements(p_expenses)
  loop
    if nullif(v_expense->>'project_id', '') is null
       and nullif(v_expense->>'organization_id', '') is null then
      raise exception 'Every Expense needs a budget destination.';
    end if;

    v_purchase_ids := array_append(v_purchase_ids, (v_expense->>'id')::uuid);

    insert into app_theatre_budget.purchases (
      id, fiscal_year_id, project_id, organization_id, budget_line_id,
      production_category_id, banner_account_code_id, budget_tracked,
      entered_by_user_id, title, reference_number, estimated_amount,
      requested_amount, encumbered_amount, pending_cc_amount, posted_amount,
      status, request_type, is_credit_card, credit_card_id, cc_workflow_status,
      procurement_status, purchase_date, ordered_on, notes, expense_claim_id,
      expense_number, expense_stage, authorization_purchase_id,
      authorized_amount, overage_explanation
    ) values (
      (v_expense->>'id')::uuid,
      (p_claim->>'fiscal_year_id')::uuid,
      nullif(v_expense->>'project_id', '')::uuid,
      (v_expense->>'organization_id')::uuid,
      nullif(v_expense->>'budget_line_id', '')::uuid,
      nullif(v_expense->>'production_category_id', '')::uuid,
      (v_expense->>'banner_account_code_id')::uuid,
      true,
      v_user_id,
      v_expense->>'title',
      v_claim_number,
      (v_expense->>'amount')::numeric,
      (v_expense->>'requested_amount')::numeric,
      0,
      (v_expense->>'pending_cc_amount')::numeric,
      0,
      v_expense->>'status',
      'expense',
      v_claim_type <> 'reimbursement',
      nullif(p_claim->>'credit_card_id', '')::uuid,
      nullif(v_expense->>'cc_workflow_status', ''),
      v_expense->>'procurement_status',
      nullif(v_expense->>'expense_date', '')::date,
      nullif(v_expense->>'expense_date', '')::date,
      nullif(v_expense->>'note', ''),
      v_claim_id,
      v_expense->>'expense_number',
      v_expense->>'expense_stage',
      null,
      nullif(p_claim->>'authorized_amount', '')::numeric,
      nullif(p_claim->>'overage_explanation', '')
    );

    if nullif(v_expense->>'budget_line_id', '') is not null then
      insert into app_theatre_budget.purchase_allocations (
        purchase_id, reporting_budget_line_id, account_code_id,
        production_category_id, amount, reporting_bucket, note
      ) values (
        (v_expense->>'id')::uuid,
        (v_expense->>'budget_line_id')::uuid,
        (v_expense->>'banner_account_code_id')::uuid,
        nullif(v_expense->>'production_category_id', '')::uuid,
        (v_expense->>'amount')::numeric,
        'direct',
        v_claim_number || ' / ' || (v_expense->>'expense_number')
      );
    end if;

    if nullif(v_expense->>'attachment_url', '') is not null then
      insert into app_theatre_budget.purchase_receipts (
        purchase_id, note, amount_received, attachment_url,
        fully_received, created_by_user_id
      ) values (
        (v_expense->>'id')::uuid,
        nullif(v_expense->>'note', ''),
        (v_expense->>'amount')::numeric,
        v_expense->>'attachment_url',
        false,
        v_user_id
      );
    end if;
  end loop;

  if v_claim_type = 'monthly_reconciliation' then
    select coalesce(sum(settled_amount), 0)
      into v_settled
    from app_theatre_budget.expense_claims
    where authorization_claim_id = v_authorization_claim_id
      and status <> 'cancelled';

    select coalesce(authorized_amount, 0), greatest(coalesce(authorized_amount, 0) - v_settled, 0)
      into v_authorized_total, v_remaining
    from app_theatre_budget.expense_claims
    where id = v_authorization_claim_id
    for update;

    update app_theatre_budget.expense_claims
    set settled_amount = v_settled,
        status = case when v_remaining = 0 then 'reconciled' else 'approved' end,
        updated_at = now()
    where id = v_authorization_claim_id;

    update app_theatre_budget.purchases
    set requested_amount = case
          when v_remaining = 0 or v_authorized_total = 0 then 0
          else round(v_remaining * estimated_amount / v_authorized_total, 2)
        end,
        notes = 'Original authorization preserved; ' || v_settled::text ||
          ' reconciled, ' || v_remaining::text || ' remaining hold across the claim.'
    where expense_claim_id = v_authorization_claim_id
      and expense_stage = 'authorization';
  end if;

  return jsonb_build_object('claim_id', v_claim_id, 'purchase_ids', to_jsonb(v_purchase_ids));
end;
$$;

revoke all on function app_theatre_budget.create_expense_claim_transaction(jsonb, jsonb) from public;
grant execute on function app_theatre_budget.create_expense_claim_transaction(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
