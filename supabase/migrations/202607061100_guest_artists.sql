create table if not exists app_theatre_budget.guest_artists (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  vendor_number text,
  email text,
  phone text,
  default_foapal_id uuid references app_theatre_budget.foapals (id) on delete set null,
  default_check_request_handling text not null default 'mail',
  default_check_request_other_location text,
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

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'guest_artists_default_check_request_handling_check'
      and conrelid = 'app_theatre_budget.guest_artists'::regclass
  ) then
    alter table app_theatre_budget.guest_artists
      add constraint guest_artists_default_check_request_handling_check
      check (default_check_request_handling in ('mail', 'business_affairs_pickup', 'other'));
  end if;
end $$;

alter table app_theatre_budget.contracts
  add column if not exists guest_artist_id uuid references app_theatre_budget.guest_artists (id) on delete set null;

create index if not exists idx_guest_artists_display_name
  on app_theatre_budget.guest_artists (lower(display_name));

create index if not exists idx_guest_artists_default_foapal_id
  on app_theatre_budget.guest_artists (default_foapal_id);

create index if not exists idx_contracts_guest_artist_id
  on app_theatre_budget.contracts (guest_artist_id);

alter table app_theatre_budget.guest_artists enable row level security;

drop policy if exists guest_artists_manage_contract_managers on app_theatre_budget.guest_artists;
create policy guest_artists_manage_contract_managers
on app_theatre_budget.guest_artists
for all
to authenticated
using (app_theatre_budget.get_user_role() in ('admin', 'project_manager'))
with check (app_theatre_budget.get_user_role() in ('admin', 'project_manager'));

grant select, insert, update, delete on app_theatre_budget.guest_artists to authenticated;
