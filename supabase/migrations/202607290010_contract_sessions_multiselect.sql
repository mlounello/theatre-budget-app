begin;

alter table app_theatre_budget.contracts
  drop constraint if exists contracts_contract_session_check;

alter table app_theatre_budget.contracts
  alter column contract_session type text[]
  using (
    case
      when contract_session is null then array[]::text[]
      else array[contract_session]
    end
  ),
  alter column contract_session set default array[]::text[],
  alter column contract_session set not null;

alter table app_theatre_budget.contracts
  add constraint contracts_contract_session_check
  check (
    contract_session <@ array['summer', 'fall', 'winter', 'spring']::text[]
  );

commit;
