\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 5J: reconcile verified live migration history'

begin;

do $$
begin
  if to_regprocedure('app_theatre_budget.create_expense_claim_transaction(jsonb,jsonb)') is null then
    raise exception 'Gate 5J transactional Expense Claim function is not live.';
  end if;
end;
$$;

insert into supabase_migrations.schema_migrations (version, statements, name)
values (
  '20260919220000',
  array['Applied and verified during Phase 4 Gate 5J.'],
  'phase4_gate5j_transactional_expense_claims'
)
on conflict (version) do nothing;

commit;
