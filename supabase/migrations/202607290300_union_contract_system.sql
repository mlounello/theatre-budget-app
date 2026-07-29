begin;

create table app_theatre_budget.union_funds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vendor_number text,
  foapal_id uuid references app_theatre_budget.foapals (id) on delete set null,
  check_request_handling text not null default 'mail'
    check (check_request_handling in ('mail', 'business_affairs_pickup', 'other')),
  check_request_other_location text,
  vendor_address1 text,
  vendor_address2 text,
  vendor_address3 text,
  tax_id_encrypted text,
  tax_id_last4 text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_theatre_budget.union_agreements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  union_name text not null,
  version_label text not null,
  effective_from date,
  effective_to date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version_label),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create table app_theatre_budget.union_agreement_funds (
  id uuid primary key default gen_random_uuid(),
  union_agreement_id uuid not null
    references app_theatre_budget.union_agreements (id) on delete cascade,
  union_fund_id uuid not null
    references app_theatre_budget.union_funds (id) on delete restrict,
  percentage numeric(9, 4) not null check (percentage >= 0 and percentage <= 100),
  contribution_type text not null
    check (contribution_type in ('employer_paid', 'artist_withholding')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (union_agreement_id, union_fund_id)
);

alter table app_theatre_budget.guest_artists
  add column if not exists is_union boolean not null default false,
  add column if not exists default_union_agreement_id uuid
    references app_theatre_budget.union_agreements (id) on delete set null;

alter table app_theatre_budget.contracts
  add column if not exists is_union boolean not null default false,
  add column if not exists union_agreement_id uuid
    references app_theatre_budget.union_agreements (id) on delete set null,
  add column if not exists union_agreement_name_snapshot text,
  add column if not exists union_signature_status text not null default 'not_started';

alter table app_theatre_budget.contracts
  drop constraint if exists contracts_union_signature_status_check;
alter table app_theatre_budget.contracts
  add constraint contracts_union_signature_status_check
  check (union_signature_status in ('not_started', 'sent_to_union', 'union_countersigned', 'complete'));

create table app_theatre_budget.contract_union_contributions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null
    references app_theatre_budget.contracts (id) on delete cascade,
  union_agreement_fund_id uuid
    references app_theatre_budget.union_agreement_funds (id) on delete set null,
  union_fund_id uuid
    references app_theatre_budget.union_funds (id) on delete set null,
  purchase_id uuid unique
    references app_theatre_budget.purchases (id) on delete set null,
  fund_name_snapshot text not null,
  vendor_number_snapshot text,
  foapal_id_snapshot uuid references app_theatre_budget.foapals (id) on delete set null,
  check_request_handling_snapshot text not null default 'mail'
    check (check_request_handling_snapshot in ('mail', 'business_affairs_pickup', 'other')),
  check_request_other_location_snapshot text,
  vendor_address1_snapshot text,
  vendor_address2_snapshot text,
  vendor_address3_snapshot text,
  tax_id_encrypted_snapshot text,
  tax_id_last4_snapshot text,
  contribution_type text not null
    check (contribution_type in ('employer_paid', 'artist_withholding')),
  percentage numeric(9, 4) not null check (percentage >= 0 and percentage <= 100),
  calculation_base numeric(12, 2) not null,
  amount numeric(12, 2) not null check (amount >= 0),
  due_date date,
  ap_receive_by date,
  mail_by date,
  status text not null default 'planned'
    check (status in ('planned', 'check_request_submitted', 'check_paid')),
  check_request_submitted_on date,
  check_paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, union_agreement_fund_id)
);

create index idx_union_agreement_funds_agreement
  on app_theatre_budget.union_agreement_funds (union_agreement_id, sort_order);
create index idx_union_agreement_funds_fund
  on app_theatre_budget.union_agreement_funds (union_fund_id);
create index idx_guest_artists_default_union_agreement
  on app_theatre_budget.guest_artists (default_union_agreement_id);
create index idx_contracts_union_agreement
  on app_theatre_budget.contracts (union_agreement_id);
create index idx_contract_union_contributions_contract
  on app_theatre_budget.contract_union_contributions (contract_id);

alter table app_theatre_budget.union_funds enable row level security;
alter table app_theatre_budget.union_agreements enable row level security;
alter table app_theatre_budget.union_agreement_funds enable row level security;
alter table app_theatre_budget.contract_union_contributions enable row level security;

create policy union_funds_read on app_theatre_budget.union_funds
for select to authenticated using (true);
create policy union_funds_manage on app_theatre_budget.union_funds
for all to authenticated
using (app_theatre_budget.get_user_role() in ('admin', 'project_manager'))
with check (app_theatre_budget.get_user_role() in ('admin', 'project_manager'));

create policy union_agreements_read on app_theatre_budget.union_agreements
for select to authenticated using (true);
create policy union_agreements_manage on app_theatre_budget.union_agreements
for all to authenticated
using (app_theatre_budget.get_user_role() in ('admin', 'project_manager'))
with check (app_theatre_budget.get_user_role() in ('admin', 'project_manager'));

create policy union_agreement_funds_read on app_theatre_budget.union_agreement_funds
for select to authenticated using (true);
create policy union_agreement_funds_manage on app_theatre_budget.union_agreement_funds
for all to authenticated
using (app_theatre_budget.get_user_role() in ('admin', 'project_manager'))
with check (app_theatre_budget.get_user_role() in ('admin', 'project_manager'));

create policy contract_union_contributions_read
on app_theatre_budget.contract_union_contributions
for select to authenticated
using (
  exists (
    select 1 from app_theatre_budget.contracts contract
    where contract.id = contract_union_contributions.contract_id
      and app_theatre_budget.is_project_member(contract.project_id)
  )
);
create policy contract_union_contributions_manage
on app_theatre_budget.contract_union_contributions
for all to authenticated
using (
  exists (
    select 1 from app_theatre_budget.contracts contract
    where contract.id = contract_union_contributions.contract_id
      and app_theatre_budget.has_project_role(
        contract.project_id,
        array['admin', 'project_manager']::app_theatre_budget.app_role[]
      )
  )
)
with check (
  exists (
    select 1 from app_theatre_budget.contracts contract
    where contract.id = contract_union_contributions.contract_id
      and app_theatre_budget.has_project_role(
        contract.project_id,
        array['admin', 'project_manager']::app_theatre_budget.app_role[]
      )
  )
);

grant select, insert, update, delete on
  app_theatre_budget.union_funds,
  app_theatre_budget.union_agreements,
  app_theatre_budget.union_agreement_funds,
  app_theatre_budget.contract_union_contributions
to authenticated;

create or replace function app_theatre_budget.delete_contract_with_links(
  p_contract_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public, core
as $$
declare
  v_project_id uuid;
  v_purchase_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'You must be authenticated.';
  end if;
  select project_id into v_project_id
  from app_theatre_budget.contracts
  where id = p_contract_id;
  if v_project_id is null then raise exception 'Contract not found.'; end if;
  if not app_theatre_budget.has_project_role(
    v_project_id,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  ) then
    raise exception 'Only Admin or Project Manager can manage contracts.';
  end if;

  select coalesce(array_agg(linked.purchase_id), '{}'::uuid[])
  into v_purchase_ids
  from (
    select purchase_id
    from app_theatre_budget.contract_installments
    where contract_id = p_contract_id and purchase_id is not null
    union all
    select purchase_id
    from app_theatre_budget.contract_union_contributions
    where contract_id = p_contract_id and purchase_id is not null
  ) linked;

  if array_length(v_purchase_ids, 1) is not null then
    delete from app_theatre_budget.purchases where id = any(v_purchase_ids);
  end if;
  delete from app_theatre_budget.contracts where id = p_contract_id;
end;
$$;

grant execute on function app_theatre_budget.delete_contract_with_links(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
