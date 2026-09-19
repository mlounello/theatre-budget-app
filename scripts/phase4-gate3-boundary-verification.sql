\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 3: cross-FY rejection and same-FY variance verification (rollback only)'

begin;
set local search_path = app_theatre_budget, public;

do $$
declare
  v_purchase_id uuid;
  v_other_fiscal_year_id uuid;
  v_rejected boolean := false;
begin
  select purchase.id into v_purchase_id
  from purchases purchase
  order by purchase.created_at
  limit 1;
  select fiscal_year.id into v_other_fiscal_year_id
  from fiscal_years fiscal_year
  where fiscal_year.id <> (select fiscal_year_id from purchases where id = v_purchase_id)
  order by fiscal_year.start_date
  limit 1;

  begin
    update purchases set fiscal_year_id = v_other_fiscal_year_id where id = v_purchase_id;
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'Cross-FY purchase update was not rejected'; end if;
end;
$$;

do $$
declare
  v_receipt_id uuid;
  v_other_statement_id uuid;
  v_rejected boolean := false;
begin
  select receipt.id into v_receipt_id
  from purchase_receipts receipt
  join purchases purchase on purchase.id = receipt.purchase_id
  where receipt.cc_statement_month_id is not null
    and exists (
      select 1 from cc_statement_months statement
      where statement.fiscal_year_id <> purchase.fiscal_year_id
    )
  limit 1;
  select statement.id into v_other_statement_id
  from cc_statement_months statement
  where statement.fiscal_year_id <> (
    select purchase.fiscal_year_id
    from purchase_receipts receipt
    join purchases purchase on purchase.id = receipt.purchase_id
    where receipt.id = v_receipt_id
  )
  limit 1;

  if v_receipt_id is null or v_other_statement_id is null then
    raise exception 'Cross-FY receipt fixture is unavailable';
  end if;
  begin
    update purchase_receipts set cc_statement_month_id = v_other_statement_id where id = v_receipt_id;
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'Cross-FY receipt assignment was not rejected'; end if;
end;
$$;

do $$
declare
  v_request_id uuid := gen_random_uuid();
  v_from_month_id uuid;
  v_to_month_id uuid;
  v_fiscal_year_id uuid;
  v_from_organization_id uuid;
  v_to_organization_id uuid;
  v_from_account_id uuid;
  v_to_account_id uuid;
  v_from_month_start date;
  v_to_month_start date;
  v_cross_org boolean;
begin
  select
    source.month_id, target.month_id, source.fiscal_year_id,
    source.organization_id, target.organization_id,
    source.account_code_id, target.account_code_id,
    source.month_start, target.month_start
  into
    v_from_month_id, v_to_month_id, v_fiscal_year_id,
    v_from_organization_id, v_to_organization_id,
    v_from_account_id, v_to_account_id,
    v_from_month_start, v_to_month_start
  from (
    select month.id month_id, plan.fiscal_year_id, plan.organization_id,
      plan.account_code_id, month.month_start
    from budget_plan_months month
    join budget_plans plan on plan.id = month.budget_plan_id
    join account_codes account on account.id = plan.account_code_id
    where not account.is_revenue
  ) source
  join (
    select month.id month_id, plan.fiscal_year_id, plan.organization_id,
      plan.account_code_id, month.month_start
    from budget_plan_months month
    join budget_plans plan on plan.id = month.budget_plan_id
    join account_codes account on account.id = plan.account_code_id
    where not account.is_revenue
  ) target
    on target.fiscal_year_id = source.fiscal_year_id
   and target.organization_id <> source.organization_id
  limit 1;

  if v_from_month_id is null then raise exception 'Same-FY cross-org variance fixture is unavailable'; end if;

  insert into variance_requests (id, fiscal_year_id, status, reason, total_transfer_amount)
  values (v_request_id, v_fiscal_year_id, 'draft', 'PHASE4_GATE3_TEST', 1);

  insert into variance_request_lines (
    variance_request_id,
    from_budget_plan_month_id, to_budget_plan_month_id,
    from_organization_id, from_account_code_id, from_month_start,
    to_organization_id, to_account_code_id, to_month_start,
    transfer_amount, narrative, cross_org_override
  ) values (
    v_request_id,
    v_from_month_id, v_to_month_id,
    v_from_organization_id, v_from_account_id, v_from_month_start,
    v_to_organization_id, v_to_account_id, v_to_month_start,
    1, 'PHASE4_GATE3_TEST', false
  );

  select line.cross_org_override into v_cross_org
  from variance_request_lines line where line.variance_request_id = v_request_id;
  if not v_cross_org then raise exception 'Same-FY cross-org variance was not marked as cross-org'; end if;
end;
$$;

do $$
declare
  v_request_id uuid := gen_random_uuid();
  v_from_month_id uuid;
  v_to_month_id uuid;
  v_from_organization_id uuid;
  v_to_organization_id uuid;
  v_from_account_id uuid;
  v_to_account_id uuid;
  v_from_month_start date;
  v_to_month_start date;
  v_fiscal_year_id uuid;
  v_rejected boolean := false;
begin
  select
    source.month_id, target.month_id, source.fiscal_year_id,
    source.organization_id, target.organization_id,
    source.account_code_id, target.account_code_id,
    source.month_start, target.month_start
  into
    v_from_month_id, v_to_month_id, v_fiscal_year_id,
    v_from_organization_id, v_to_organization_id,
    v_from_account_id, v_to_account_id,
    v_from_month_start, v_to_month_start
  from (
    select month.id month_id, plan.fiscal_year_id, plan.organization_id,
      plan.account_code_id, month.month_start
    from budget_plan_months month
    join budget_plans plan on plan.id = month.budget_plan_id
    join account_codes account on account.id = plan.account_code_id
    where not account.is_revenue
  ) source
  join (
    select month.id month_id, plan.fiscal_year_id, plan.organization_id,
      plan.account_code_id, month.month_start
    from budget_plan_months month
    join budget_plans plan on plan.id = month.budget_plan_id
    join account_codes account on account.id = plan.account_code_id
    where not account.is_revenue
  ) target on target.fiscal_year_id <> source.fiscal_year_id
  limit 1;

  if v_from_month_id is null then raise exception 'Cross-FY variance fixture is unavailable'; end if;
  insert into variance_requests (id, fiscal_year_id, status, reason, total_transfer_amount)
  values (v_request_id, v_fiscal_year_id, 'draft', 'PHASE4_GATE3_TEST', 1);

  begin
    insert into variance_request_lines (
      variance_request_id,
      from_budget_plan_month_id, to_budget_plan_month_id,
      from_organization_id, from_account_code_id, from_month_start,
      to_organization_id, to_account_code_id, to_month_start,
      transfer_amount, narrative, cross_org_override
    ) values (
      v_request_id,
      v_from_month_id, v_to_month_id,
      v_from_organization_id, v_from_account_id, v_from_month_start,
      v_to_organization_id, v_to_account_id, v_to_month_start,
      1, 'PHASE4_GATE3_TEST', true
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'Cross-FY variance was not rejected'; end if;
end;
$$;

select 1 as all_gate3_boundary_checks_passed;
rollback;
