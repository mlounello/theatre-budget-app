create table if not exists app_theatre_budget.funds (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_theatre_budget.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_theatre_budget.foapals (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references app_theatre_budget.funds (id) on delete restrict,
  organization_id uuid not null references app_theatre_budget.organizations (id) on delete restrict,
  program_id uuid not null references app_theatre_budget.programs (id) on delete restrict,
  label text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fund_id, organization_id, program_id)
);

create index if not exists idx_foapals_organization_id on app_theatre_budget.foapals (organization_id);
create index if not exists idx_foapals_fund_id on app_theatre_budget.foapals (fund_id);
create index if not exists idx_foapals_program_id on app_theatre_budget.foapals (program_id);

alter table app_theatre_budget.contracts
  add column if not exists contract_number text,
  add column if not exists contract_role text,
  add column if not exists check_request_foapal_id uuid references app_theatre_budget.foapals (id) on delete set null,
  add column if not exists check_request_handling text not null default 'mail',
  add column if not exists check_request_other_location text,
  add column if not exists vendor_address1 text,
  add column if not exists vendor_address2 text,
  add column if not exists vendor_address3 text,
  add column if not exists tax_id_encrypted text,
  add column if not exists tax_id_last4 text;

alter table app_theatre_budget.contract_installments
  add column if not exists check_request_foapal_id uuid references app_theatre_budget.foapals (id) on delete set null,
  add column if not exists check_request_handling text not null default 'mail',
  add column if not exists check_request_other_location text,
  add column if not exists vendor_address1 text,
  add column if not exists vendor_address2 text,
  add column if not exists vendor_address3 text,
  add column if not exists tax_id_encrypted text,
  add column if not exists tax_id_last4 text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contracts_check_request_handling_check'
      and conrelid = 'app_theatre_budget.contracts'::regclass
  ) then
    alter table app_theatre_budget.contracts
      add constraint contracts_check_request_handling_check
      check (check_request_handling in ('mail', 'business_affairs_pickup', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'contract_installments_check_request_handling_check'
      and conrelid = 'app_theatre_budget.contract_installments'::regclass
  ) then
    alter table app_theatre_budget.contract_installments
      add constraint contract_installments_check_request_handling_check
      check (check_request_handling in ('mail', 'business_affairs_pickup', 'other'));
  end if;
end $$;

create index if not exists idx_contracts_check_request_foapal_id
  on app_theatre_budget.contracts (check_request_foapal_id);

create index if not exists idx_contract_installments_check_request_foapal_id
  on app_theatre_budget.contract_installments (check_request_foapal_id);

alter table app_theatre_budget.funds enable row level security;
alter table app_theatre_budget.programs enable row level security;
alter table app_theatre_budget.foapals enable row level security;

drop policy if exists funds_select_authenticated on app_theatre_budget.funds;
create policy funds_select_authenticated
on app_theatre_budget.funds
for select
to authenticated
using (true);

drop policy if exists programs_select_authenticated on app_theatre_budget.programs;
create policy programs_select_authenticated
on app_theatre_budget.programs
for select
to authenticated
using (true);

drop policy if exists foapals_select_authenticated on app_theatre_budget.foapals;
create policy foapals_select_authenticated
on app_theatre_budget.foapals
for select
to authenticated
using (true);

drop policy if exists funds_admin_manage on app_theatre_budget.funds;
create policy funds_admin_manage
on app_theatre_budget.funds
for all
to authenticated
using (app_theatre_budget.is_admin_user())
with check (app_theatre_budget.is_admin_user());

drop policy if exists programs_admin_manage on app_theatre_budget.programs;
create policy programs_admin_manage
on app_theatre_budget.programs
for all
to authenticated
using (app_theatre_budget.is_admin_user())
with check (app_theatre_budget.is_admin_user());

drop policy if exists foapals_admin_manage on app_theatre_budget.foapals;
create policy foapals_admin_manage
on app_theatre_budget.foapals
for all
to authenticated
using (app_theatre_budget.is_admin_user())
with check (app_theatre_budget.is_admin_user());

grant select, insert, update, delete on app_theatre_budget.funds to authenticated;
grant select, insert, update, delete on app_theatre_budget.programs to authenticated;
grant select, insert, update, delete on app_theatre_budget.foapals to authenticated;
