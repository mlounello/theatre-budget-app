-- A receipt can be a charge or a return/credit. Monthly card reconciliation
-- must reject only zero-dollar rows, not negative receipt amounts.

do $migration$
declare
  v_sql text;
begin
  v_sql := pg_get_functiondef(
    'app_theatre_budget.finalize_cc_receipt_batch(uuid,text,jsonb,uuid)'::regprocedure
  );

  if position(
    'if v_amount = 0 then raise exception ''Every receipt amount must be non-zero.''; end if;'
    in v_sql
  ) > 0 then
    return;
  end if;

  if position(
    'if v_amount <= 0 then raise exception ''Every receipt amount must be greater than zero.''; end if;'
    in v_sql
  ) = 0 then
    raise exception 'Could not find the legacy positive-only receipt validation.';
  end if;

  v_sql := replace(
    v_sql,
    'if v_amount <= 0 then raise exception ''Every receipt amount must be greater than zero.''; end if;',
    'if v_amount = 0 then raise exception ''Every receipt amount must be non-zero.''; end if;'
  );
  execute v_sql;

  v_sql := pg_get_functiondef(
    'app_theatre_budget.finalize_cc_receipt_batch(uuid,text,jsonb,uuid)'::regprocedure
  );
  if position(
    'if v_amount = 0 then raise exception ''Every receipt amount must be non-zero.''; end if;'
    in v_sql
  ) = 0 then
    raise exception 'Negative receipt support did not apply.';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
