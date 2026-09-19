\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 5J: transactional Expense Claim security assertions (read only)'

begin read only;

select 1 / case when exists (
  select 1
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'app_theatre_budget'
    and procedure.proname = 'create_expense_claim_transaction'
    and procedure.prosecdef = false
) then 1 else 0 end as transaction_function_is_security_invoker;

select 1 / case when has_function_privilege(
  'authenticated',
  'app_theatre_budget.create_expense_claim_transaction(jsonb,jsonb)',
  'execute'
) then 1 else 0 end as authenticated_can_execute;

select 1 / case when not has_function_privilege(
  'anon',
  'app_theatre_budget.create_expense_claim_transaction(jsonb,jsonb)',
  'execute'
) then 1 else 0 end as anonymous_cannot_execute;

select 1 / case when (
  select count(*) from pg_policies
  where schemaname = 'app_theatre_budget'
    and tablename = 'expense_claims'
    and policyname in (
      'expense_claims_select_scoped',
      'expense_claims_insert_scoped',
      'expense_claims_update_scoped',
      'expense_claims_delete_scoped'
    )
) = 4 then 1 else 0 end as expense_claim_rls_unchanged;

rollback;

