\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 2: reconcile already-live migration history'

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'app_theatre_budget'
      and table_name = 'organizations'
      and column_name = 'project_tracking_required'
  ) then
    raise exception 'Projectless organization purchase migration is not live.';
  end if;

  if exists (
    select 1
    from app_theatre_budget.purchases purchase
    join app_theatre_budget.projects project on project.id = purchase.project_id
    where lower(trim(project.name)) = 'external procurement'
  ) then
    raise exception 'External Procurement still has linked purchases.';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_proc function on function.oid = trigger.tgfoid
    where namespace.nspname = 'app_theatre_budget'
      and relation.relname = 'purchases'
      and trigger.tgname = 'purchases_reject_new_revenue_spending'
      and function.proname = 'reject_new_revenue_spending'
  ) then
    raise exception 'Revenue guardrail migration is not live.';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_proc function on function.oid = trigger.tgfoid
    where namespace.nspname = 'app_theatre_budget'
      and relation.relname = 'variance_request_lines'
      and trigger.tgname = 'variance_lines_validate_scope'
      and function.proname = 'validate_variance_line_scope'
  ) then
    raise exception 'Variance flexibility migration is not live.';
  end if;
end;
$$;

insert into supabase_migrations.schema_migrations (version, statements, name)
values
  ('202609180030', array['Reconciled from verified live schema during Phase 4 Gate 2.'], 'projectless_organization_purchases'),
  ('202609182150', array['Reconciled from verified live schema during Phase 4 Gate 2.'], 'retire_external_procurement'),
  ('202609182330', array['Reconciled from verified live schema during Phase 4 Gate 2.'], 'revenue_guardrails'),
  ('202609182345', array['Reconciled from verified live schema during Phase 4 Gate 2.'], 'variance_flexibility')
on conflict (version) do nothing;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from supabase_migrations.schema_migrations
  where (version, name) in (
    ('202609180030', 'projectless_organization_purchases'),
    ('202609182150', 'retire_external_procurement'),
    ('202609182330', 'revenue_guardrails'),
    ('202609182345', 'variance_flexibility')
  );

  if v_count <> 4 then
    raise exception 'Migration-history reconciliation failed: expected 4 exact entries, found %.', v_count;
  end if;
end;
$$;

commit;
