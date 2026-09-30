-- Allow later receipts to be appended as additional EX rows under the same
-- monthly reconciliation EC, and bind an unassigned funding request to the
-- statement card selected by the user.

do $migration$
declare
  v_sql text;
begin
  v_sql := pg_get_functiondef(
    'app_theatre_budget.finalize_cc_receipt_batch(uuid,text,jsonb,uuid)'::regprocedure
  );

  if position('v_claim_id uuid := gen_random_uuid();' in v_sql) > 0 then
    v_sql := replace(v_sql,
      'v_claim_id uuid := gen_random_uuid();',
      'v_claim_id uuid;'
    );

    v_sql := replace(v_sql, $old$
  insert into app_theatre_budget.expense_claims (
    id, fiscal_year_id, project_id, organization_id, credit_card_id,
    claim_number, claim_type, claim_month, status, settled_amount,
    authorization_claim_id, entered_by_user_id
  ) values (
    v_claim_id, v_statement.fiscal_year_id, null, null, v_statement.credit_card_id,
    p_claim_number, 'monthly_reconciliation', v_statement.statement_month,
    'reconciled', 0, null, p_user_id
  );
$old$, $new$
  select id into v_claim_id
  from app_theatre_budget.expense_claims
  where fiscal_year_id = v_statement.fiscal_year_id
    and claim_number = p_claim_number
    and claim_type = 'monthly_reconciliation'
  for update;

  if v_claim_id is null then
    if exists (
      select 1 from app_theatre_budget.expense_claims
      where fiscal_year_id = v_statement.fiscal_year_id and claim_number = p_claim_number
    ) then
      raise exception 'That EC number is already used by a different Expense Claim type.';
    end if;
    v_claim_id := gen_random_uuid();
    insert into app_theatre_budget.expense_claims (
      id, fiscal_year_id, project_id, organization_id, credit_card_id,
      claim_number, claim_type, claim_month, status, settled_amount,
      authorization_claim_id, entered_by_user_id
    ) values (
      v_claim_id, v_statement.fiscal_year_id, null, null, v_statement.credit_card_id,
      p_claim_number, 'monthly_reconciliation', v_statement.statement_month,
      'reconciled', 0, null, p_user_id
    );
  elsif exists (
    select 1 from app_theatre_budget.expense_claims claim
    where claim.id = v_claim_id
      and ((claim.credit_card_id is not null and claim.credit_card_id is distinct from v_statement.credit_card_id)
        or claim.claim_month is distinct from v_statement.statement_month)
  ) then
    raise exception 'That Expense Claim belongs to a different card or statement month.';
  else
    update app_theatre_budget.expense_claims
    set credit_card_id = v_statement.credit_card_id, updated_at = now()
    where id = v_claim_id and credit_card_id is null;
  end if;
$new$);

    v_sql := replace(v_sql, $old$
    if v_authorization.credit_card_id is distinct from v_statement.credit_card_id then
      raise exception 'Every selected receipt must belong to this statement card.';
    end if;
$old$, $new$
    if v_authorization.credit_card_id is null then
      update app_theatre_budget.purchases
      set credit_card_id = v_statement.credit_card_id
      where id = v_authorization.id;
      update app_theatre_budget.expense_claims
      set credit_card_id = v_statement.credit_card_id, updated_at = now()
      where id = v_authorization.expense_claim_id and credit_card_id is null;
      v_authorization.credit_card_id := v_statement.credit_card_id;
    elsif v_authorization.credit_card_id is distinct from v_statement.credit_card_id then
      raise exception 'Every selected receipt must belong to this statement card.';
    end if;
$new$);

    v_sql := replace(v_sql, $old$
  update app_theatre_budget.expense_claims
  set settled_amount = v_total, updated_at = now()
  where id = v_claim_id;
$old$, $new$
  update app_theatre_budget.expense_claims claim
  set settled_amount = (
        select coalesce(sum(purchase.pending_cc_amount + purchase.posted_amount), 0)
        from app_theatre_budget.purchases purchase
        where purchase.expense_claim_id = claim.id and purchase.status <> 'cancelled'
      ),
      updated_at = now()
  where id = v_claim_id;
$new$);

    if position('select id into v_claim_id' in v_sql) = 0
      or position('v_authorization.credit_card_id is null' in v_sql) = 0
      or position('purchase.expense_claim_id = claim.id' in v_sql) = 0 then
      raise exception 'Could not safely revise finalize_cc_receipt_batch.';
    end if;

    execute v_sql;
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
