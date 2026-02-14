-- Contracts module with installment-based check payments.

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid references public.fiscal_years (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  project_id uuid not null references public.projects (id) on delete cascade,
  banner_account_code_id uuid not null references public.account_codes (id) on delete restrict,
  production_category_id uuid references public.production_categories (id) on delete set null,
  entered_by_user_id uuid not null references public.users (id) on delete restrict,
  contractor_name text not null,
  contractor_employee_id text,
  contractor_email text,
  contractor_phone text,
  contract_value numeric(12, 2) not null default 0,
  installment_count integer not null default 1,
  workflow_status text not null default 'w9_requested',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (installment_count between 1 and 4),
  check (contract_value <> 0)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contracts_workflow_status_check'
  ) then
    alter table public.contracts
      add constraint contracts_workflow_status_check
      check (
        workflow_status in (
          'w9_requested',
          'contract_sent',
          'contract_signed_returned',
          'siena_signed'
        )
      );
  end if;
end $$;

create index if not exists idx_contracts_project_id on public.contracts (project_id);
create index if not exists idx_contracts_org_id on public.contracts (organization_id);
create index if not exists idx_contracts_fiscal_year_id on public.contracts (fiscal_year_id);
create index if not exists idx_contracts_account_code_id on public.contracts (banner_account_code_id);

create table if not exists public.contract_installments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  purchase_id uuid unique references public.purchases (id) on delete set null,
  installment_number integer not null,
  installment_amount numeric(12, 2) not null,
  status text not null default 'planned',
  check_request_submitted_on date,
  check_paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, installment_number),
  check (installment_amount <> 0),
  check (installment_number > 0)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contract_installments_status_check'
  ) then
    alter table public.contract_installments
      add constraint contract_installments_status_check
      check (status in ('planned', 'check_request_submitted', 'check_paid'));
  end if;
end $$;

create index if not exists idx_contract_installments_contract_id on public.contract_installments (contract_id);
create index if not exists idx_contract_installments_status on public.contract_installments (status);

alter table public.contracts enable row level security;
alter table public.contract_installments enable row level security;

drop policy if exists "members can read contracts" on public.contracts;
create policy "members can read contracts"
on public.contracts
for select
to authenticated
using (public.is_project_member(project_id));

drop policy if exists "pm admin can manage contracts" on public.contracts;
create policy "pm admin can manage contracts"
on public.contracts
for all
to authenticated
using (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]))
with check (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]));

drop policy if exists "members can read contract installments" on public.contract_installments;
create policy "members can read contract installments"
on public.contract_installments
for select
to authenticated
using (
  exists (
    select 1
    from public.contracts c
    where c.id = contract_installments.contract_id
      and public.is_project_member(c.project_id)
  )
);

drop policy if exists "pm admin can manage contract installments" on public.contract_installments;
create policy "pm admin can manage contract installments"
on public.contract_installments
for all
to authenticated
using (
  exists (
    select 1
    from public.contracts c
    where c.id = contract_installments.contract_id
      and public.has_project_role(c.project_id, array['admin','project_manager']::public.app_role[])
  )
)
with check (
  exists (
    select 1
    from public.contracts c
    where c.id = contract_installments.contract_id
      and public.has_project_role(c.project_id, array['admin','project_manager']::public.app_role[])
  )
);

grant select, insert, update, delete on public.contracts to authenticated;
grant select, insert, update, delete on public.contract_installments to authenticated;

alter table public.purchases
  drop constraint if exists purchases_request_type_check;

alter table public.purchases
  add constraint purchases_request_type_check
  check (request_type in ('requisition', 'expense', 'contract', 'request', 'budget_transfer', 'contract_payment'));
