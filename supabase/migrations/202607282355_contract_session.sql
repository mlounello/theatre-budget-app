begin;

alter table app_theatre_budget.contracts
  add column if not exists contract_session text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contracts_contract_session_check'
      and conrelid = 'app_theatre_budget.contracts'::regclass
  ) then
    alter table app_theatre_budget.contracts
      add constraint contracts_contract_session_check
      check (
        contract_session is null
        or contract_session in ('summer', 'fall', 'winter', 'spring')
      );
  end if;
end $$;

commit;
