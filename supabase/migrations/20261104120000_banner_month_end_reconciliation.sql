-- Dated, read-only reconciliation snapshots for Banner YTD and ENC controls.
-- Financial postings remain owned by purchases and purchase_invoice_transactions.

create table if not exists app_theatre_budget.banner_reconciliation_periods (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null references app_theatre_budget.fiscal_years(id) on delete restrict,
  organization_id uuid not null references app_theatre_budget.organizations(id) on delete restrict,
  account_code_id uuid not null references app_theatre_budget.account_codes(id) on delete restrict,
  as_of_date date not null,
  ytd_control_total numeric(12, 2) not null,
  enc_control_total numeric(12, 2) not null,
  enc_detail_total numeric(12, 2) not null,
  app_ytd_total numeric(12, 2) not null,
  app_enc_total numeric(12, 2) not null,
  ytd_source_filename text null,
  enc_control_filename text null,
  enc_detail_filename text null,
  status text not null default 'reconciled' check (status in ('reconciled', 'attention')),
  notes text null,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fiscal_year_id, organization_id, account_code_id, as_of_date)
);

create index if not exists idx_banner_reconciliation_periods_scope
  on app_theatre_budget.banner_reconciliation_periods (
    fiscal_year_id, organization_id, account_code_id, as_of_date desc
  );

alter table app_theatre_budget.banner_reconciliation_periods enable row level security;

drop policy if exists banner_reconciliation_periods_select_scoped
  on app_theatre_budget.banner_reconciliation_periods;
drop policy if exists banner_reconciliation_periods_insert_scoped
  on app_theatre_budget.banner_reconciliation_periods;
drop policy if exists banner_reconciliation_periods_update_scoped
  on app_theatre_budget.banner_reconciliation_periods;

create policy banner_reconciliation_periods_select_scoped
on app_theatre_budget.banner_reconciliation_periods
for select to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    null,
    null,
    array['admin','project_manager','buyer','viewer','procurement_tracker']::app_theatre_budget.app_role[]
  )
);

create policy banner_reconciliation_periods_insert_scoped
on app_theatre_budget.banner_reconciliation_periods
for insert to authenticated
with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    null,
    null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

create policy banner_reconciliation_periods_update_scoped
on app_theatre_budget.banner_reconciliation_periods
for update to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    null,
    null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
)
with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    null,
    null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

grant select, insert, update on app_theatre_budget.banner_reconciliation_periods to authenticated;

notify pgrst, 'reload schema';
