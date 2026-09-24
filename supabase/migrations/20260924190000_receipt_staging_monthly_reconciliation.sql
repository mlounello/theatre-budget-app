-- Stage card receipts against their original authorization, then finalize a selected
-- card/month batch into one reconciliation EC with one actual EX per receipt.

alter table app_theatre_budget.purchase_receipts
  add column if not exists receipt_date date,
  add column if not exists project_id uuid null references app_theatre_budget.projects(id) on delete restrict,
  add column if not exists organization_id uuid null references app_theatre_budget.organizations(id) on delete restrict,
  add column if not exists production_category_id uuid null references app_theatre_budget.production_categories(id) on delete restrict,
  add column if not exists account_code_id uuid null references app_theatre_budget.account_codes(id) on delete restrict,
  add column if not exists authorization_purchase_id uuid null references app_theatre_budget.purchases(id) on delete restrict;

update app_theatre_budget.purchase_receipts receipt
set receipt_date = coalesce(receipt.receipt_date, receipt.created_at::date),
    project_id = coalesce(receipt.project_id, purchase.project_id),
    organization_id = coalesce(receipt.organization_id, purchase.organization_id),
    production_category_id = coalesce(receipt.production_category_id, purchase.production_category_id),
    account_code_id = coalesce(receipt.account_code_id, purchase.banner_account_code_id),
    authorization_purchase_id = coalesce(
      receipt.authorization_purchase_id,
      purchase.authorization_purchase_id,
      case when purchase.expense_stage = 'authorization' then purchase.id else null end
    )
from app_theatre_budget.purchases purchase
where purchase.id = receipt.purchase_id;

create index if not exists idx_purchase_receipts_authorization_purchase
  on app_theatre_budget.purchase_receipts (authorization_purchase_id)
  where authorization_purchase_id is not null;

alter table app_theatre_budget.expense_claims
  drop constraint if exists expense_claims_reconciliation_link_check;

create or replace function app_theatre_budget.finalize_cc_receipt_batch(
  p_statement_month_id uuid,
  p_claim_number text,
  p_receipts jsonb,
  p_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = app_theatre_budget, public, auth
as $$
declare
  v_statement app_theatre_budget.cc_statement_months%rowtype;
  v_claim_id uuid := gen_random_uuid();
  v_item jsonb;
  v_receipt app_theatre_budget.purchase_receipts%rowtype;
  v_authorization app_theatre_budget.purchases%rowtype;
  v_project app_theatre_budget.projects%rowtype;
  v_purchase_id uuid;
  v_budget_line_id uuid;
  v_expense_number text;
  v_amount numeric(12,2);
  v_total numeric(12,2) := 0;
  v_purchase_ids uuid[] := '{}';
  v_authorization_ids uuid[] := '{}';
  v_authorization_id uuid;
  v_authorization_total numeric(12,2);
  v_reconciled_total numeric(12,2);
  v_remaining numeric(12,2);
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Monthly reconciliation must be completed by the signed-in user.';
  end if;
  if p_claim_number !~ '^EC[0-9]{6}$' then
    raise exception 'Expense Claim number must use EC######.';
  end if;
  if jsonb_typeof(p_receipts) <> 'array' or jsonb_array_length(p_receipts) = 0 then
    raise exception 'Select at least one receipt.';
  end if;

  select * into v_statement
  from app_theatre_budget.cc_statement_months
  where id = p_statement_month_id
  for update;
  if not found then raise exception 'Statement month not found.'; end if;
  if v_statement.posted_at is not null then raise exception 'This statement is already submitted.'; end if;

  insert into app_theatre_budget.expense_claims (
    id, fiscal_year_id, project_id, organization_id, credit_card_id,
    claim_number, claim_type, claim_month, status, settled_amount,
    authorization_claim_id, entered_by_user_id
  ) values (
    v_claim_id, v_statement.fiscal_year_id, null, null, v_statement.credit_card_id,
    p_claim_number, 'monthly_reconciliation', v_statement.statement_month,
    'reconciled', 0, null, p_user_id
  );

  for v_item in select value from jsonb_array_elements(p_receipts)
  loop
    v_expense_number := upper(btrim(v_item->>'expense_number'));
    if v_expense_number !~ '^EX[0-9]{6}$' then
      raise exception 'Every selected receipt needs an EX###### Expense number.';
    end if;

    select * into v_receipt
    from app_theatre_budget.purchase_receipts
    where id = (v_item->>'receipt_id')::uuid
    for update;
    if not found then raise exception 'A selected receipt was not found.'; end if;
    if v_receipt.cc_statement_month_id is not null then
      raise exception 'A selected receipt has already been finalized.';
    end if;
    if v_receipt.project_id is null and v_receipt.organization_id is null then
      raise exception 'Every receipt needs a project or organization budget before finalization.';
    end if;
    if v_receipt.account_code_id is null then
      raise exception 'Every receipt needs a Banner account / FOAP before finalization.';
    end if;
    if v_receipt.project_id is not null and v_receipt.production_category_id is null then
      raise exception 'Every theatre-project receipt needs a Production Category.';
    end if;

    select * into v_authorization
    from app_theatre_budget.purchases
    where id = coalesce(v_receipt.authorization_purchase_id, v_receipt.purchase_id)
    for update;
    if not found or v_authorization.request_type <> 'expense' or not v_authorization.is_credit_card then
      raise exception 'The receipt is not linked to a valid card funding request.';
    end if;
    if v_authorization.fiscal_year_id is distinct from v_statement.fiscal_year_id then
      raise exception 'Receipt and statement fiscal years do not match.';
    end if;
    if v_authorization.credit_card_id is distinct from v_statement.credit_card_id then
      raise exception 'Every selected receipt must belong to this statement card.';
    end if;

    if v_receipt.project_id is not null then
      select * into v_project from app_theatre_budget.projects where id = v_receipt.project_id;
      if not found or v_project.fiscal_year_id is distinct from v_statement.fiscal_year_id then
        raise exception 'A receipt project is outside the statement fiscal year.';
      end if;
      v_budget_line_id := app_theatre_budget.ensure_project_category_line(
        v_receipt.project_id, v_receipt.production_category_id
      );
    else
      v_budget_line_id := null;
      if not exists (
        select 1 from app_theatre_budget.fiscal_year_organizations membership
        where membership.fiscal_year_id = v_statement.fiscal_year_id
          and membership.organization_id = v_receipt.organization_id
          and membership.active = true
          and membership.project_tracking_required = false
      ) then
        raise exception 'A receipt organization is not an active direct budget for this fiscal year.';
      end if;
    end if;

    v_amount := round(coalesce(v_receipt.amount_received, 0), 2);
    if v_amount <= 0 then raise exception 'Every receipt amount must be greater than zero.'; end if;
    v_purchase_id := gen_random_uuid();

    insert into app_theatre_budget.purchases (
      id, fiscal_year_id, project_id, organization_id, budget_line_id,
      production_category_id, banner_account_code_id, budget_tracked,
      entered_by_user_id, title, reference_number, estimated_amount,
      requested_amount, encumbered_amount, pending_cc_amount, posted_amount,
      status, request_type, is_credit_card, credit_card_id, cc_workflow_status,
      procurement_status, purchase_date, ordered_on, notes, expense_claim_id,
      expense_number, expense_stage, authorization_purchase_id, authorized_amount,
      cc_statement_month_id
    ) values (
      v_purchase_id, v_statement.fiscal_year_id, v_receipt.project_id,
      case when v_receipt.project_id is not null then v_project.organization_id else v_receipt.organization_id end,
      v_budget_line_id, case when v_receipt.project_id is not null then v_receipt.production_category_id else null end,
      v_receipt.account_code_id, true, p_user_id,
      coalesce(nullif(btrim(v_receipt.note), ''), v_authorization.title),
      p_claim_number, v_amount, 0, 0, v_amount, 0,
      'pending_cc', 'expense', true, v_statement.credit_card_id,
      'receipts_uploaded', 'receipts_uploaded', coalesce(v_receipt.receipt_date, current_date),
      coalesce(v_receipt.receipt_date, current_date),
      'Finalized from receipt staged against ' || coalesce(v_authorization.reference_number, 'funding request'),
      v_claim_id, v_expense_number, 'actual', v_authorization.id,
      v_authorization.estimated_amount, v_statement.id
    );

    insert into app_theatre_budget.purchase_allocations (
      purchase_id, reporting_budget_line_id, organization_id, account_code_id,
      production_category_id, amount, reporting_bucket, note
    ) values (
      v_purchase_id, v_budget_line_id,
      case when v_receipt.project_id is null then v_receipt.organization_id else null end,
      v_receipt.account_code_id,
      case when v_receipt.project_id is not null then v_receipt.production_category_id else null end,
      v_amount, 'direct', p_claim_number || ' / ' || v_expense_number
    );

    update app_theatre_budget.purchase_receipts
    set purchase_id = v_purchase_id,
        authorization_purchase_id = v_authorization.id,
        cc_statement_month_id = v_statement.id,
        fully_received = true
    where id = v_receipt.id;

    v_total := v_total + v_amount;
    v_purchase_ids := array_append(v_purchase_ids, v_purchase_id);
    if not (v_authorization.id = any(v_authorization_ids)) then
      v_authorization_ids := array_append(v_authorization_ids, v_authorization.id);
    end if;
  end loop;

  update app_theatre_budget.expense_claims
  set settled_amount = v_total, updated_at = now()
  where id = v_claim_id;

  foreach v_authorization_id in array v_authorization_ids
  loop
    select coalesce(nullif(estimated_amount, 0), nullif(authorized_amount, 0), nullif(requested_amount, 0), 0)
      into v_authorization_total
    from app_theatre_budget.purchases
    where id = v_authorization_id;

    select coalesce(sum(actual.pending_cc_amount + actual.posted_amount), 0)
      into v_reconciled_total
    from app_theatre_budget.purchases actual
    where actual.authorization_purchase_id = v_authorization_id
      and actual.status <> 'cancelled';
    v_remaining := greatest(v_authorization_total - v_reconciled_total, 0);

    update app_theatre_budget.purchases
    set requested_amount = v_remaining,
        estimated_amount = v_authorization_total,
        cc_workflow_status = case when v_remaining = 0 then 'receipts_uploaded' else cc_workflow_status end,
        notes = coalesce(notes || E'\n', '') || v_reconciled_total::text || ' finalized; ' || v_remaining::text || ' authorization remaining.'
    where id = v_authorization_id;
  end loop;

  return jsonb_build_object(
    'claim_id', v_claim_id,
    'purchase_ids', to_jsonb(v_purchase_ids),
    'receipt_count', jsonb_array_length(p_receipts),
    'total', v_total
  );
end;
$$;

revoke all on function app_theatre_budget.finalize_cc_receipt_batch(uuid, text, jsonb, uuid) from public;
grant execute on function app_theatre_budget.finalize_cc_receipt_batch(uuid, text, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
