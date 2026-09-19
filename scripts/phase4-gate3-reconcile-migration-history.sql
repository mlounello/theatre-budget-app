\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 3: reconcile verified live migration history'

begin;

do $$
begin
  if exists (
    select 1 from app_theatre_budget.fiscal_year_assignment_conflicts
    where status = 'open'
      and entity_table in ('purchases', 'income_lines', 'cc_statement_months', 'cc_statement_lines')
  ) then
    raise exception 'Gate 3 transaction fiscal-year conflicts remain open.';
  end if;

  if not exists (
    select 1 from information_schema.views
    where table_schema = 'app_theatre_budget'
      and table_name = 'v_institutional_revenue_performance'
  ) then
    raise exception 'Gate 3 revenue performance view is not live.';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'app_theatre_budget'
      and table_name in ('purchases', 'income_lines', 'cc_statement_months', 'cc_statement_lines')
      and column_name = 'fiscal_year_id'
      and is_nullable = 'NO'
  ) <> 4 then
    raise exception 'Gate 3 required transaction fiscal years are not live.';
  end if;

  if (
    select coalesce(sum(committed_amount), 0)
    from app_theatre_budget.institutional_budget_commitments
    where purchase_id in (
      'f97583ec-ab7d-438a-a384-401d1968cf71'::uuid,
      '1b753a7c-8b70-4d77-9b5b-6dc807157a2c'::uuid
    )
      and commitment_status = 'submitted'
  ) <> 658.08 then
    raise exception 'Gate 3 projectless commitment backfill is not live.';
  end if;
end;
$$;

insert into supabase_migrations.schema_migrations (version, statements, name)
values
  ('20260919020000', array['Applied and verified during Phase 4 Gate 3.'], 'phase4_gate3_resolve_fiscal_year_conflicts'),
  ('20260919022000', array['Applied and verified during Phase 4 Gate 3.'], 'phase4_gate3_institutional_revenue_performance'),
  ('20260919023000', array['Applied and verified during Phase 4 Gate 3.'], 'phase4_gate3_transaction_consistency'),
  ('20260919024000', array['Applied and verified during Phase 4 Gate 3.'], 'phase4_gate3_projectless_commitment_backfill')
on conflict (version) do nothing;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from supabase_migrations.schema_migrations
  where (version, name) in (
    ('20260919020000', 'phase4_gate3_resolve_fiscal_year_conflicts'),
    ('20260919022000', 'phase4_gate3_institutional_revenue_performance'),
    ('20260919023000', 'phase4_gate3_transaction_consistency'),
    ('20260919024000', 'phase4_gate3_projectless_commitment_backfill')
  );

  if v_count <> 4 then
    raise exception 'Gate 3 migration-history reconciliation failed: expected 4 exact entries, found %.', v_count;
  end if;
end;
$$;

commit;
