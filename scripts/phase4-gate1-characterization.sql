\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 1: read-only live-database characterization'

begin read only;
set local search_path = app_theatre_budget, public;

-- Transitional schema is still the current production contract.
select 1 / case when not exists (
  select 1 from information_schema.columns
  where table_schema = 'app_theatre_budget'
    and table_name = 'purchases'
    and column_name = 'fiscal_year_id'
) then 1 else 0 end as purchases_fiscal_year_not_yet_explicit;

select 1 / case when not exists (
  select 1 from information_schema.columns
  where table_schema = 'app_theatre_budget'
    and table_name = 'income_lines'
    and column_name = 'fiscal_year_id'
) then 1 else 0 end as income_fiscal_year_not_yet_explicit;

-- Every existing purchase has one unambiguous FY source today.
select 1 / case when not exists (
  select 1
  from purchases purchase
  left join projects project on project.id = purchase.project_id
  left join organizations organization on organization.id = purchase.organization_id
  where (project.fiscal_year_id is null and organization.fiscal_year_id is null)
     or (
       project.fiscal_year_id is not null
       and organization.fiscal_year_id is not null
       and project.fiscal_year_id <> organization.fiscal_year_id
     )
) then 1 else 0 end as purchase_backfill_is_unambiguous;

-- Income may still need a reviewed date assignment, but every row maps to a known FY.
select 1 / case when not exists (
  select 1
  from income_lines income
  left join projects project on project.id = income.project_id
  left join organizations organization on organization.id = income.organization_id
  where (
    project.fiscal_year_id is not null
    and organization.fiscal_year_id is not null
    and project.fiscal_year_id <> organization.fiscal_year_id
  ) or (
    project.fiscal_year_id is null
    and organization.fiscal_year_id is null
    and not exists (
      select 1 from fiscal_years fiscal_year
      where coalesce(income.received_on, income.created_at::date)
        between fiscal_year.start_date and fiscal_year.end_date
    )
  )
) then 1 else 0 end as income_has_a_reviewable_fiscal_year;

-- Revenue-spending protections are installed on every current spending path.
select 1 / case when (
  select count(*)
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  join pg_proc function on function.oid = trigger.tgfoid
  where namespace.nspname = 'app_theatre_budget'
    and not trigger.tgisinternal
    and relation.relname in ('purchases', 'purchase_allocations', 'contracts')
    and function.proname = 'reject_new_revenue_spending'
) = 3 then 1 else 0 end as revenue_guardrail_triggers_present;

select 1 / case when not exists (
  select 1 from purchases purchase
  join account_codes account on account.id = purchase.banner_account_code_id
  where account.is_revenue
) and not exists (
  select 1 from purchase_allocations allocation
  join account_codes account on account.id = allocation.account_code_id
  where account.is_revenue
) and not exists (
  select 1 from contracts contract
  join account_codes account on account.id = contract.banner_account_code_id
  where account.is_revenue
) then 1 else 0 end as no_existing_revenue_spending;

-- Variance lines are same-FY, never revenue-funded, and carry accurate org metadata.
select 1 / case when exists (
  select 1
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  join pg_proc function on function.oid = trigger.tgfoid
  where namespace.nspname = 'app_theatre_budget'
    and relation.relname = 'variance_request_lines'
    and trigger.tgname = 'variance_lines_validate_scope'
    and function.proname = 'validate_variance_line_scope'
) then 1 else 0 end as variance_scope_trigger_present;

select 1 / case when not exists (
  select 1
  from variance_request_lines line
  join budget_plan_months source_month on source_month.id = line.from_budget_plan_month_id
  join budget_plans source_plan on source_plan.id = source_month.budget_plan_id
  join account_codes source_account on source_account.id = source_plan.account_code_id
  join budget_plan_months target_month on target_month.id = line.to_budget_plan_month_id
  join budget_plans target_plan on target_plan.id = target_month.budget_plan_id
  where source_plan.fiscal_year_id <> target_plan.fiscal_year_id
     or source_account.is_revenue
     or line.from_organization_id is distinct from source_plan.organization_id
     or line.to_organization_id is distinct from target_plan.organization_id
     or line.cross_org_override is distinct from (source_plan.organization_id <> target_plan.organization_id)
) then 1 else 0 end as existing_variance_lines_are_valid;

-- Existing FY + organization scopes are internally consistent.
select 1 / case when not exists (
  select 1
  from user_access_scopes scope
  join organizations organization on organization.id = scope.organization_id
  where scope.fiscal_year_id is not null
    and organization.fiscal_year_id is not null
    and scope.fiscal_year_id <> organization.fiscal_year_id
) then 1 else 0 end as access_scope_fiscal_years_are_consistent;

-- Characterize known security debt so later RLS work cannot silently overlook it.
select 1 / case when exists (
  select 1 from pg_policies
  where schemaname = 'app_theatre_budget'
    and tablename = 'purchases'
    and policyname in ('core_member_read_purchases', 'member_read_purchases')
    and qual like '%core.is_member%'
) then 1 else 0 end as broad_purchase_member_read_policy_is_present;

-- The retired placeholder is retained but has no active purchase references.
select 1 / case when not exists (
  select 1
  from purchases purchase
  join projects project on project.id = purchase.project_id
  where lower(trim(project.name)) = 'external procurement'
) then 1 else 0 end as external_procurement_has_no_purchases;

-- Every current statement month maps by date, but FY still is not explicit on the row.
select 1 / case when not exists (
  select 1
  from cc_statement_months statement
  where not exists (
    select 1 from fiscal_years fiscal_year
    where statement.statement_month between fiscal_year.start_date and fiscal_year.end_date
  )
) then 1 else 0 end as statement_months_are_date_mappable;

rollback;
