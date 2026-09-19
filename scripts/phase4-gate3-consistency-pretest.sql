\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 3: transaction consistency preconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when not exists (
  select 1 from purchases where fiscal_year_id is null
  union all select 1 from income_lines where fiscal_year_id is null
  union all select 1 from cc_statement_months where fiscal_year_id is null
  union all select 1 from cc_statement_lines where fiscal_year_id is null
) then 1 else 0 end as every_transaction_has_fiscal_year;

select 1 / case when not exists (
  select 1
  from purchases transaction
  join projects project on project.id = transaction.project_id
  where transaction.fiscal_year_id <> project.fiscal_year_id
  union all
  select 1
  from income_lines transaction
  join projects project on project.id = transaction.project_id
  where transaction.fiscal_year_id <> project.fiscal_year_id
) then 1 else 0 end as project_transactions_match_project_fy;

select 1 / case when not exists (
  select 1 from purchases transaction
  where transaction.organization_id is not null
    and not exists (
      select 1 from fiscal_year_organizations membership
      where membership.fiscal_year_id = transaction.fiscal_year_id
        and membership.organization_id = transaction.organization_id
        and membership.active = true
    )
  union all
  select 1 from income_lines transaction
  where transaction.organization_id is not null
    and not exists (
      select 1 from fiscal_year_organizations membership
      where membership.fiscal_year_id = transaction.fiscal_year_id
        and membership.organization_id = transaction.organization_id
        and membership.active = true
    )
) then 1 else 0 end as transaction_organizations_have_membership;

select 1 / case when not exists (
  select 1
  from cc_statement_lines line
  join cc_statement_months statement on statement.id = line.statement_month_id
  where line.fiscal_year_id <> statement.fiscal_year_id
) then 1 else 0 end as statement_lines_match_statement_fy;

select 1 / case when not exists (
  select 1
  from purchase_receipts receipt
  join purchases purchase on purchase.id = receipt.purchase_id
  join cc_statement_months statement on statement.id = receipt.cc_statement_month_id
  where purchase.fiscal_year_id <> statement.fiscal_year_id
) then 1 else 0 end as assigned_receipts_match_statement_fy;

rollback;
