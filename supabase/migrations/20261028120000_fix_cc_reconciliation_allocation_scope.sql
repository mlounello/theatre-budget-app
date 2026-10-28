-- Monthly card reconciliation creates one actual purchase/allocation per receipt.
-- After PO allocations became complete budget children, the reconciliation
-- function still omitted project_id and the project's organization_id from the
-- allocation row. The shared allocation validator correctly rejected that row.

do $migration$
declare
  v_sql text;
begin
  v_sql := pg_get_functiondef(
    'app_theatre_budget.finalize_cc_receipt_batch(uuid,text,jsonb,uuid)'::regprocedure
  );

  if position(
    'purchase_id, reporting_budget_line_id, project_id, organization_id'
    in v_sql
  ) > 0 then
    return;
  end if;

  if position($old$
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
$old$ in v_sql) = 0 then
    raise exception 'Could not find the legacy monthly reconciliation allocation insert.';
  end if;

  v_sql := replace(v_sql, $old$
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
$old$, $new$
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
$new$);

  execute v_sql;

  v_sql := pg_get_functiondef(
    'app_theatre_budget.finalize_cc_receipt_batch(uuid,text,jsonb,uuid)'::regprocedure
  );
  if position(
    'purchase_id, reporting_budget_line_id, project_id, organization_id'
    in v_sql
  ) = 0
    or position(
      'when v_receipt.project_id is not null then v_project.organization_id'
      in v_sql
    ) = 0 then
    raise exception 'Monthly reconciliation allocation repair did not apply.';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
