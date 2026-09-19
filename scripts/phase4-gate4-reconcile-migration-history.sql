\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 4: reconcile verified live migration history'

begin;

do $$
declare
  v_active_canonical integer;
  v_applied_mappings integer;
  v_reference_logs integer;
  v_active_memberships integer;
begin
  if to_regclass('app_theatre_budget.organization_consolidation_map') is null
     or to_regclass('app_theatre_budget.organization_reference_repoint_log') is null then
    raise exception 'Gate 4 consolidation audit tables are not live.';
  end if;

  select count(*) into v_active_canonical
  from app_theatre_budget.organizations
  where active
    and superseded_by_organization_id is null;

  select count(*) into v_applied_mappings
  from app_theatre_budget.organization_consolidation_map
  where applied_at is not null;

  select count(*) into v_reference_logs
  from app_theatre_budget.organization_reference_repoint_log;

  select count(*) into v_active_memberships
  from app_theatre_budget.fiscal_year_organizations
  where active;

  if v_active_canonical <> 4 then
    raise exception 'Gate 4 expected 4 active canonical organizations, found %.', v_active_canonical;
  end if;
  if v_applied_mappings <> 5 then
    raise exception 'Gate 4 expected 5 applied organization mappings, found %.', v_applied_mappings;
  end if;
  if v_reference_logs <> 96 then
    raise exception 'Gate 4 expected 96 reference repoint logs, found %.', v_reference_logs;
  end if;
  if v_active_memberships <> 7 then
    raise exception 'Gate 4 expected 7 active fiscal-year memberships, found %.', v_active_memberships;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'app_theatre_budget'
      and indexname = 'organizations_one_active_canonical_code'
  ) then
    raise exception 'Gate 4 canonical organization uniqueness index is not live.';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'app_theatre_budget'
      and table_row.relname = 'fiscal_year_organizations'
      and trigger_row.tgname = 'fiscal_year_organizations_validate_canonical'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Gate 4 canonical membership trigger is not live.';
  end if;
end;
$$;

insert into supabase_migrations.schema_migrations (version, statements, name)
values
  ('20260919030000', array['Applied and verified during Phase 4 Gate 4.'], 'phase4_gate4_consolidation_log_foundation'),
  ('20260919031000', array['Applied and verified during Phase 4 Gate 4.'], 'phase4_gate4_canonicalize_organizations')
on conflict (version) do nothing;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from supabase_migrations.schema_migrations
  where (version, name) in (
    ('20260919030000', 'phase4_gate4_consolidation_log_foundation'),
    ('20260919031000', 'phase4_gate4_canonicalize_organizations')
  );

  if v_count <> 2 then
    raise exception 'Gate 4 migration-history reconciliation failed: expected 2 exact entries, found %.', v_count;
  end if;
end;
$$;

commit;
