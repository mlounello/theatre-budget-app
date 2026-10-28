-- An EX Expense may contain multiple receipts, including a charge and its refund.
-- Keep the EX unique while accumulating every matching receipt into one purchase
-- and one budget allocation.

do $migration$
declare
  v_sql text;
begin
  v_sql := pg_get_functiondef(
    'app_theatre_budget.finalize_cc_receipt_batch(uuid,text,jsonb,uuid)'::regprocedure
  );

  if position('Receipts sharing an EX number must use the same Expense Claim, funding request, and budget destination.' in v_sql) > 0 then
    return;
  end if;

  if position($old$
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
      purchase_id, reporting_budget_line_id, project_id, organization_id,
      account_code_id, production_category_id, amount, reporting_bucket, note
    ) values (
      v_purchase_id, v_budget_line_id, v_receipt.project_id,
      case
        when v_receipt.project_id is not null then v_project.organization_id
        else v_receipt.organization_id
      end,
      v_receipt.account_code_id,
      case when v_receipt.project_id is not null then v_receipt.production_category_id else null end,
      v_amount, 'direct', p_claim_number || ' / ' || v_expense_number
    );
$old$ in v_sql) = 0 then
    raise exception 'Could not find the one-purchase-per-receipt reconciliation block.';
  end if;

  v_sql := replace(v_sql, $old$
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
      purchase_id, reporting_budget_line_id, project_id, organization_id,
      account_code_id, production_category_id, amount, reporting_bucket, note
    ) values (
      v_purchase_id, v_budget_line_id, v_receipt.project_id,
      case
        when v_receipt.project_id is not null then v_project.organization_id
        else v_receipt.organization_id
      end,
      v_receipt.account_code_id,
      case when v_receipt.project_id is not null then v_receipt.production_category_id else null end,
      v_amount, 'direct', p_claim_number || ' / ' || v_expense_number
    );
$old$, $new$
    perform pg_advisory_xact_lock(
      hashtextextended(v_statement.fiscal_year_id::text || ':' || v_expense_number, 0)
    );

    select purchase.id into v_purchase_id
    from app_theatre_budget.purchases purchase
    where purchase.fiscal_year_id = v_statement.fiscal_year_id
      and purchase.expense_number = v_expense_number
    for update;

    if v_purchase_id is null then
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
        purchase_id, reporting_budget_line_id, project_id, organization_id,
        account_code_id, production_category_id, amount, reporting_bucket, note
      ) values (
        v_purchase_id, v_budget_line_id, v_receipt.project_id,
        case
          when v_receipt.project_id is not null then v_project.organization_id
          else v_receipt.organization_id
        end,
        v_receipt.account_code_id,
        case when v_receipt.project_id is not null then v_receipt.production_category_id else null end,
        v_amount, 'direct', p_claim_number || ' / ' || v_expense_number
      );
    else
      if exists (
        select 1
        from app_theatre_budget.purchases purchase
        where purchase.id = v_purchase_id
          and (
            purchase.expense_claim_id is distinct from v_claim_id
            or purchase.cc_statement_month_id is distinct from v_statement.id
            or purchase.credit_card_id is distinct from v_statement.credit_card_id
            or purchase.project_id is distinct from v_receipt.project_id
            or purchase.organization_id is distinct from case
              when v_receipt.project_id is not null then v_project.organization_id
              else v_receipt.organization_id
            end
            or purchase.budget_line_id is distinct from v_budget_line_id
            or purchase.production_category_id is distinct from case
              when v_receipt.project_id is not null then v_receipt.production_category_id
              else null
            end
            or purchase.banner_account_code_id is distinct from v_receipt.account_code_id
            or purchase.authorization_purchase_id is distinct from v_authorization.id
            or purchase.expense_stage is distinct from 'actual'
          )
      ) then
        raise exception 'Receipts sharing an EX number must use the same Expense Claim, funding request, and budget destination.';
      end if;

      update app_theatre_budget.purchases
      set estimated_amount = coalesce(estimated_amount, 0) + v_amount,
          pending_cc_amount = coalesce(pending_cc_amount, 0) + v_amount,
          updated_at = now()
      where id = v_purchase_id;

      update app_theatre_budget.purchase_allocations
      set amount = coalesce(amount, 0) + v_amount
      where purchase_id = v_purchase_id;
      if not found then
        raise exception 'The existing EX Expense is missing its budget allocation.';
      end if;
    end if;
$new$);

  if position('v_purchase_ids := array_append(v_purchase_ids, v_purchase_id);' in v_sql) = 0 then
    raise exception 'Could not find the reconciliation purchase result append.';
  end if;
  v_sql := replace(
    v_sql,
    'v_purchase_ids := array_append(v_purchase_ids, v_purchase_id);',
    'if not (v_purchase_id = any(v_purchase_ids)) then' || chr(10) ||
    '      v_purchase_ids := array_append(v_purchase_ids, v_purchase_id);' || chr(10) ||
    '    end if;'
  );

  execute v_sql;

  v_sql := pg_get_functiondef(
    'app_theatre_budget.finalize_cc_receipt_batch(uuid,text,jsonb,uuid)'::regprocedure
  );
  if position('Receipts sharing an EX number must use the same Expense Claim, funding request, and budget destination.' in v_sql) = 0
    or position('set estimated_amount = coalesce(estimated_amount, 0) + v_amount' in v_sql) = 0
    or position('if not (v_purchase_id = any(v_purchase_ids)) then' in v_sql) = 0 then
    raise exception 'Multi-receipt EX grouping did not apply.';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
