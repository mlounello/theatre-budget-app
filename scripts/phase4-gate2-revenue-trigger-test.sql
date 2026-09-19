\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 2: revenue guardrail rollback test'

begin;
set local search_path = app_theatre_budget, public;

do $$
declare
  v_project_id uuid;
  v_expense_account_id uuid;
  v_revenue_account_id uuid;
  v_purchase_id uuid;
  v_rejected boolean := false;
begin
  select project.id into v_project_id
  from projects project
  order by project.created_at, project.id
  limit 1;

  select account.id into v_expense_account_id
  from account_codes account
  where not account.is_revenue
  order by account.code, account.id
  limit 1;

  select account.id into v_revenue_account_id
  from account_codes account
  where account.is_revenue
  order by account.code, account.id
  limit 1;

  insert into purchases (
    project_id,
    banner_account_code_id,
    title,
    budget_tracked
  ) values (
    v_project_id,
    v_expense_account_id,
    '[PHASE4 TEST - ROLLBACK] expense account accepted',
    false
  ) returning id into v_purchase_id;

  begin
    insert into purchases (
      project_id,
      banner_account_code_id,
      title,
      budget_tracked
    ) values (
      v_project_id,
      v_revenue_account_id,
      '[PHASE4 TEST - ROLLBACK] revenue account rejected',
      false
    );
  exception when others then
    if sqlerrm = 'Revenue accounts cannot be used for spending.' then
      v_rejected := true;
    else
      raise;
    end if;
  end;

  if not v_rejected then
    raise exception 'Revenue purchase was not rejected.';
  end if;
end;
$$;

rollback;
