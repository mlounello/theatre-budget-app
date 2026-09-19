\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 5I: reconcile verified live migration history'

begin;

do $$
begin
  if to_regclass('app_theatre_budget.expense_claims') is null then
    raise exception 'Gate 5I Expense Claims table is not live.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'app_theatre_budget' and table_name = 'contracts'
      and column_name = 'engagement_type'
  ) then
    raise exception 'Gate 5I hiring classification is not live.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'app_theatre_budget' and table_name = 'purchases'
      and column_name = 'expense_claim_id'
  ) then
    raise exception 'Gate 5I Expense identity is not live.';
  end if;
  if exists (
    select 1 from app_theatre_budget.contracts
    where is_union and engagement_type <> 'union_freelance_artist'
  ) then
    raise exception 'Gate 5I union hiring backfill is incomplete.';
  end if;
end;
$$;

insert into supabase_migrations.schema_migrations (version, statements, name)
values (
  '20260919190000',
  array['Applied and verified during combined Phase 4 Gate 5I.'],
  'phase4_gate5i_hiring_expense_claims'
)
on conflict (version) do nothing;

commit;
