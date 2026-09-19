\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 2: Credit Card trigger rollback test'

begin;
set local search_path = app_theatre_budget, public;

do $$
declare
  v_project_id uuid;
  v_project_fiscal_year_id uuid;
  v_project_organization_id uuid;
  v_budget_line_id uuid;
  v_budget_account_code_id uuid;
  v_credit_card_id uuid;
  v_statement_id uuid;
  v_statement_fiscal_year_id uuid;
  v_line_fiscal_year_id uuid;
  v_line_organization_id uuid;
  v_line_account_code_id uuid;
begin
  select
    project.id,
    project.fiscal_year_id,
    project.organization_id,
    budget_line.id,
    budget_line.account_code_id
  into
    v_project_id,
    v_project_fiscal_year_id,
    v_project_organization_id,
    v_budget_line_id,
    v_budget_account_code_id
  from project_budget_lines budget_line
  join projects project on project.id = budget_line.project_id
  where budget_line.account_code_id is not null
  order by project.created_at, project.id, budget_line.created_at, budget_line.id
  limit 1;

  select credit_card.id into v_credit_card_id
  from credit_cards credit_card
  order by credit_card.created_at, credit_card.id
  limit 1;

  insert into cc_statement_months (
    project_id,
    credit_card_id,
    statement_month
  ) values (
    v_project_id,
    v_credit_card_id,
    '2099-01-01'
  ) returning id, fiscal_year_id
  into v_statement_id, v_statement_fiscal_year_id;

  if v_statement_fiscal_year_id is distinct from v_project_fiscal_year_id then
    raise exception 'Legacy statement writer did not receive project fiscal year.';
  end if;

  insert into cc_statement_lines (
    statement_month_id,
    project_budget_line_id,
    amount,
    note
  ) values (
    v_statement_id,
    v_budget_line_id,
    1,
    '[PHASE4 TEST - ROLLBACK]'
  ) returning fiscal_year_id, organization_id, banner_account_code_id
  into v_line_fiscal_year_id, v_line_organization_id, v_line_account_code_id;

  if v_line_fiscal_year_id is distinct from v_project_fiscal_year_id
     or v_line_organization_id is distinct from v_project_organization_id
     or v_line_account_code_id is distinct from v_budget_account_code_id then
    raise exception 'Legacy statement line writer did not receive project scope.';
  end if;
end;
$$;

rollback;
