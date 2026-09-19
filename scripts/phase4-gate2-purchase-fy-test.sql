\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 2: purchase fiscal-year assertions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when exists (
  select 1 from information_schema.columns
  where table_schema = 'app_theatre_budget'
    and table_name = 'purchases'
    and column_name = 'fiscal_year_id'
    and is_nullable = 'YES'
) then 1 else 0 end as purchase_fiscal_year_is_nullable;

select 1 / case when not exists (
  select 1 from purchases where fiscal_year_id is null
) then 1 else 0 end as all_existing_purchases_backfilled;

select 1 / case when not exists (
  select 1
  from purchases purchase
  left join projects project on project.id = purchase.project_id
  left join organizations organization on organization.id = purchase.organization_id
  where purchase.fiscal_year_id is distinct from coalesce(
    project.fiscal_year_id,
    organization.fiscal_year_id
  )
) then 1 else 0 end as purchase_fiscal_year_matches_legacy_source;

select 1 / case when not exists (
  select 1 from fiscal_year_assignment_conflicts
  where entity_table = 'purchases' and status = 'open'
) then 1 else 0 end as purchase_backfill_created_no_conflicts;

select 1 / case when exists (
  select 1
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  join pg_proc function on function.oid = trigger.tgfoid
  where namespace.nspname = 'app_theatre_budget'
    and relation.relname = 'purchases'
    and trigger.tgname = 'purchases_assign_fiscal_year'
    and function.proname = 'assign_purchase_fiscal_year'
) then 1 else 0 end as purchase_assignment_trigger_exists;

rollback;
