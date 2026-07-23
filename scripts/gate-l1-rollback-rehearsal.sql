\set ON_ERROR_STOP on
\pset pager off

begin;

create temporary table gate_l1_rollback_baseline as
select
  encode(
    extensions.digest(
      pg_get_functiondef(
        'app_theatre_budget.ensure_project_category_line(uuid,uuid)'::regprocedure
      ),
      'sha256'
    ),
    'hex'
  ) as ensure_function_hash,
  (select count(*) from app_theatre_budget.projects) as project_count,
  (select count(*) from app_theatre_budget.account_codes) as account_code_count,
  (select count(*) from app_theatre_budget.project_budget_lines) as budget_line_count,
  (select count(*) from app_theatre_budget.contracts) as contract_count,
  (select count(*) from app_theatre_budget.purchases) as purchase_count;

\ir ../supabase/migrations/202607231700_gate_l1_theatre_budget_function_auth.sql
\ir gate-l1-production-rollback.sql

do $test$
declare
  baseline_record gate_l1_rollback_baseline%rowtype;
  restored_hash text;
  function_oid regprocedure;
begin
  select * into strict baseline_record from gate_l1_rollback_baseline;

  select encode(
    extensions.digest(
      pg_get_functiondef(
        'app_theatre_budget.ensure_project_category_line(uuid,uuid)'::regprocedure
      ),
      'sha256'
    ),
    'hex'
  )
  into strict restored_hash;

  if restored_hash <> baseline_record.ensure_function_hash then
    raise exception 'Emergency rollback did not restore the exact function definition.';
  end if;

  foreach function_oid in array array[
    'app_theatre_budget.ensure_project_category_line(uuid,uuid)'::regprocedure,
    'app_theatre_budget.seed_all_project_budget_lines_from_account_codes()'::regprocedure,
    'app_theatre_budget.seed_project_budget_lines_for_account_code(uuid)'::regprocedure,
    'app_theatre_budget.seed_project_budget_lines_for_project(uuid)'::regprocedure
  ]
  loop
    if not has_function_privilege('anon', function_oid, 'execute')
       or not has_function_privilege('authenticated', function_oid, 'execute')
       or not has_function_privilege('service_role', function_oid, 'execute') then
      raise exception 'Emergency rollback did not restore prior grants: %', function_oid;
    end if;
  end loop;

  if baseline_record.project_count <>
       (select count(*) from app_theatre_budget.projects)
     or baseline_record.account_code_count <>
       (select count(*) from app_theatre_budget.account_codes)
     or baseline_record.budget_line_count <>
       (select count(*) from app_theatre_budget.project_budget_lines)
     or baseline_record.contract_count <>
       (select count(*) from app_theatre_budget.contracts)
     or baseline_record.purchase_count <>
       (select count(*) from app_theatre_budget.purchases) then
    raise exception 'Protected Theatre Budget counts changed during rollback rehearsal.';
  end if;
end;
$test$;

select
  'gate_l1_rollback_passed' as result,
  ensure_function_hash,
  project_count,
  account_code_count,
  budget_line_count,
  contract_count,
  purchase_count
from gate_l1_rollback_baseline;

rollback;
