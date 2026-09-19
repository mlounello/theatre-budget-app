\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 4: canonical organization consolidation postconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when (
  select count(*) from organizations
  where active = true and superseded_by_organization_id is null
) = 4 then 1 else 0 end as four_active_canonical_organizations;

select 1 / case when (
  select count(*) from organization_consolidation_map where status = 'applied'
) = 5 then 1 else 0 end as all_identity_mappings_applied;

select 1 / case when not exists (
  select 1 from fiscal_year_organizations membership
  join organizations organization on organization.id = membership.organization_id
  where membership.active = true
    and (organization.active = false or organization.superseded_by_organization_id is not null)
) then 1 else 0 end as active_memberships_are_canonical;

select 1 / case when (
  select count(*) from fiscal_year_organizations where active = true
) = 7 then 1 else 0 end as expected_fy26_fy27_memberships_preserved;

select 1 / case when not exists (
  select 1 from organization_reference_repoint_log log
  left join organization_consolidation_map mapping on mapping.id = log.mapping_id
  where mapping.id is null
    or log.original_organization_id <> mapping.legacy_organization_id
    or log.canonical_organization_id <> mapping.canonical_organization_id
) then 1 else 0 end as every_log_row_has_reversible_mapping;

-- Every direct reference was moved except the one explicitly retained plan.
with legacy_ids as (
  select legacy_organization_id from organization_consolidation_map where status = 'applied'
), remaining as (
  select 'budget_plans' as source_table, id from budget_plans where organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'cc_statement_lines', id from cc_statement_lines where organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'cc_statement_months', id from cc_statement_months where organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'contracts', id from contracts where organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'foapals', id from foapals where organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'income_lines', id from income_lines where organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'institutional_budget_commitments', id from institutional_budget_commitments where organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'projects', id from projects where organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'purchases', id from purchases where organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'user_access_scopes', id from user_access_scopes where organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'variance_request_lines.from', id from variance_request_lines where from_organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'variance_request_lines.to', id from variance_request_lines where to_organization_id in (select legacy_organization_id from legacy_ids)
  union all select 'variance_request_targets', id from variance_request_targets where organization_id in (select legacy_organization_id from legacy_ids)
)
select 1 / case when count(*) = 1
  and min(source_table) = 'budget_plans'
  and min(id::text) = 'c1478552-6149-4b16-a161-888e3762ed0c'
  then 1 else 0 end as only_approved_historical_plan_retains_legacy_identity
from remaining;

select 1 / case when exists (
  select 1 from pg_indexes
  where schemaname = 'app_theatre_budget'
    and indexname = 'organizations_one_active_canonical_code'
) then 1 else 0 end as canonical_code_uniqueness_exists;

select 1 / case when exists (
  select 1 from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'app_theatre_budget'
    and relation.relname = 'fiscal_year_organizations'
    and trigger.tgname = 'fiscal_year_organizations_validate_canonical'
) then 1 else 0 end as canonical_membership_trigger_exists;

rollback;
