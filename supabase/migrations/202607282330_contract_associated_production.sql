begin;

alter table app_theatre_budget.contracts
  add column if not exists production_project_id uuid
  references app_theatre_budget.projects (id) on delete set null;

update app_theatre_budget.contracts
set production_project_id = project_id
where production_project_id is null;

create index if not exists idx_contracts_production_project_id
  on app_theatre_budget.contracts (production_project_id);

create or replace function app_theatre_budget.default_contract_production_project()
returns trigger
language plpgsql
set search_path = app_theatre_budget, public
as $$
begin
  new.production_project_id := coalesce(new.production_project_id, new.project_id);
  return new;
end;
$$;

drop trigger if exists default_contract_production_project
  on app_theatre_budget.contracts;
create trigger default_contract_production_project
before insert on app_theatre_budget.contracts
for each row execute function app_theatre_budget.default_contract_production_project();

commit;
