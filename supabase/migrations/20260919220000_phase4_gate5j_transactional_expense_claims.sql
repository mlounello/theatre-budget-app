-- Phase 4 Gate 5J: make each Expense Claim and all of its EX lines one database transaction.
-- Receipt files are staged before this call; database rows are committed together or not at all.

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
  v_authorization_purchase_id uuid := nullif(p_claim->>'authorization_purchase_id', '')::uuid;
  v_settled numeric(12,2);
  v_remaining numeric(12,2);
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
    nullif(p_claim->>'project_id', '')::uuid,
    (p_claim->>'organization_id')::uuid,
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
      nullif(p_claim->>'project_id', '')::uuid,
      (p_claim->>'organization_id')::uuid,
      nullif(p_claim->>'budget_line_id', '')::uuid,
      nullif(p_claim->>'production_category_id', '')::uuid,
      (p_claim->>'banner_account_code_id')::uuid,
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
      v_authorization_purchase_id,
      nullif(p_claim->>'authorized_amount', '')::numeric,
      nullif(p_claim->>'overage_explanation', '')
    );

    if nullif(p_claim->>'budget_line_id', '') is not null then
      insert into app_theatre_budget.purchase_allocations (
        purchase_id, reporting_budget_line_id, account_code_id,
        production_category_id, amount, reporting_bucket, note
      ) values (
        (v_expense->>'id')::uuid,
        (p_claim->>'budget_line_id')::uuid,
        (p_claim->>'banner_account_code_id')::uuid,
        nullif(p_claim->>'production_category_id', '')::uuid,
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

    select greatest(coalesce(authorized_amount, 0) - v_settled, 0)
      into v_remaining
    from app_theatre_budget.expense_claims
    where id = v_authorization_claim_id
    for update;

    update app_theatre_budget.expense_claims
    set settled_amount = v_settled,
        status = case when v_remaining = 0 then 'reconciled' else 'approved' end,
        updated_at = now()
    where id = v_authorization_claim_id;

    update app_theatre_budget.purchases
    set requested_amount = v_remaining,
        notes = 'Original authorization preserved; ' || v_settled::text ||
          ' reconciled, ' || v_remaining::text || ' remaining hold.'
    where id = v_authorization_purchase_id;
  end if;

  return jsonb_build_object('claim_id', v_claim_id, 'purchase_ids', to_jsonb(v_purchase_ids));
end;
$$;

revoke all on function app_theatre_budget.create_expense_claim_transaction(jsonb, jsonb) from public;
grant execute on function app_theatre_budget.create_expense_claim_transaction(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
