\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 5I: Expense Claim RLS assertions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

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
) = 4 then 1 else 0 end as expense_claim_policies_present;

select 1 / case when not exists (
  select 1 from pg_policies
  where schemaname = 'app_theatre_budget'
    and tablename = 'expense_claims'
    and policyname <> 'expense_claims_delete_scoped'
    and coalesce(qual, with_check, '') not like '%can_access_financial_scope%'
) then 1 else 0 end as expense_claim_policies_use_shared_scope;

select 1 / case when exists (
  select 1 from information_schema.columns
  where table_schema = 'app_theatre_budget' and table_name = 'purchases'
    and column_name = 'expense_claim_id'
) then 1 else 0 end as expense_identity_is_available;

select 1 / case when not exists (
  select 1 from contracts
  where is_union and engagement_type <> 'union_freelance_artist'
) then 1 else 0 end as union_contracts_are_classified;

rollback;
