begin;

create table if not exists app_theatre_budget.contract_productions (
  contract_id uuid not null
    references app_theatre_budget.contracts (id) on delete cascade,
  project_id uuid not null
    references app_theatre_budget.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contract_id, project_id)
);

insert into app_theatre_budget.contract_productions (contract_id, project_id)
select contract.id, coalesce(contract.production_project_id, contract.project_id)
from app_theatre_budget.contracts contract
on conflict (contract_id, project_id) do nothing;

create index if not exists idx_contract_productions_project_id
  on app_theatre_budget.contract_productions (project_id);

alter table app_theatre_budget.contract_productions enable row level security;

drop policy if exists contract_productions_select_access
  on app_theatre_budget.contract_productions;
create policy contract_productions_select_access
on app_theatre_budget.contract_productions
for select
to authenticated
using (
  exists (
    select 1
    from app_theatre_budget.contracts contract
    where contract.id = contract_productions.contract_id
      and app_theatre_budget.is_project_member(contract.project_id)
  )
);

drop policy if exists contract_productions_manage_access
  on app_theatre_budget.contract_productions;
create policy contract_productions_manage_access
on app_theatre_budget.contract_productions
for all
to authenticated
using (
  exists (
    select 1
    from app_theatre_budget.contracts contract
    where contract.id = contract_productions.contract_id
      and app_theatre_budget.has_project_role(
        contract.project_id,
        array['admin', 'project_manager']::app_theatre_budget.app_role[]
      )
  )
)
with check (
  exists (
    select 1
    from app_theatre_budget.contracts contract
    where contract.id = contract_productions.contract_id
      and app_theatre_budget.has_project_role(
        contract.project_id,
        array['admin', 'project_manager']::app_theatre_budget.app_role[]
      )
  )
);

grant select, insert, update, delete
  on app_theatre_budget.contract_productions
  to authenticated;

notify pgrst, 'reload schema';

commit;
