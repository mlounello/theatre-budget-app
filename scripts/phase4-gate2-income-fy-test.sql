\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 2: income fiscal-year assertions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when exists (
  select 1 from information_schema.columns
  where table_schema = 'app_theatre_budget'
    and table_name = 'income_lines'
    and column_name = 'fiscal_year_id'
    and is_nullable = 'YES'
) then 1 else 0 end as income_fiscal_year_is_nullable;

select 1 / case when not exists (
  select 1
  from income_lines income
  left join projects project on project.id = income.project_id
  left join organizations organization on organization.id = income.organization_id
  where income.fiscal_year_id is not null
    and income.fiscal_year_id is distinct from coalesce(
      project.fiscal_year_id,
      organization.fiscal_year_id,
      income.fiscal_year_id
    )
) then 1 else 0 end as backfilled_income_matches_explicit_source;

select 1 / case when not exists (
  select 1
  from income_lines income
  where income.fiscal_year_id is null
    and not exists (
      select 1
      from fiscal_year_assignment_conflicts conflict
      where conflict.entity_table = 'income_lines'
        and conflict.entity_id = income.id
        and conflict.status = 'open'
        and conflict.conflict_type in ('date_review_required', 'unresolved')
    )
) then 1 else 0 end as every_unassigned_income_row_is_reported;

select 1 / case when not exists (
  select 1
  from fiscal_year_assignment_conflicts conflict
  where conflict.entity_table = 'income_lines'
    and conflict.conflict_type = 'date_review_required'
    and conflict.status = 'open'
    and conflict.proposed_fiscal_year_id is null
) then 1 else 0 end as every_date_review_has_a_proposed_fy;

select 1 / case when exists (
  select 1
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  join pg_proc function on function.oid = trigger.tgfoid
  where namespace.nspname = 'app_theatre_budget'
    and relation.relname = 'income_lines'
    and trigger.tgname = 'income_lines_assign_fiscal_year'
    and function.proname = 'assign_income_fiscal_year'
) then 1 else 0 end as income_assignment_trigger_exists;

rollback;
