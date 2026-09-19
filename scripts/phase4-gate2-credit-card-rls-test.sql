\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 2: Credit Card mutation RLS assertions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when not exists (
  select 1 from pg_policies
  where schemaname = 'app_theatre_budget'
    and tablename in ('cc_statement_months', 'cc_statement_lines')
    and policyname in (
      'pm admin can insert statement months',
      'pm admin can update statement months',
      'pm admin can delete statement months',
      'pm admin can insert statement lines',
      'pm admin can update statement lines',
      'pm admin can delete statement lines'
    )
) then 1 else 0 end as legacy_unscoped_mutation_policies_removed;

select 1 / case when (
  select count(*) from pg_policies
  where schemaname = 'app_theatre_budget'
    and tablename in ('cc_statement_months', 'cc_statement_lines')
    and policyname in (
      'cc_statement_months_insert_scoped',
      'cc_statement_months_update_scoped',
      'cc_statement_months_delete_scoped',
      'cc_statement_lines_insert_scoped',
      'cc_statement_lines_update_scoped',
      'cc_statement_lines_delete_scoped'
    )
) = 6 then 1 else 0 end as scoped_mutation_policies_present;

select 1 / case when not exists (
  select 1 from pg_policies
  where schemaname = 'app_theatre_budget'
    and tablename in ('cc_statement_months', 'cc_statement_lines')
    and policyname like 'cc_statement_%_scoped'
    and coalesce(qual, with_check, '') not like '%can_access_financial_scope%'
) then 1 else 0 end as credit_card_scoped_policies_use_shared_boundary;

rollback;
