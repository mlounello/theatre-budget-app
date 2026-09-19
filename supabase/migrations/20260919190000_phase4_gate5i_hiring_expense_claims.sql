-- Phase 4 Gate 5I: Hiring classifications and Expense Claim / Expense identity.
-- Additive: existing Contracts, purchases, receipts, and statement workflows remain valid.

alter table app_theatre_budget.contracts
  add column if not exists engagement_type text not null default 'independent_contractor',
  add column if not exists compensation_basis text not null default 'flat_fee',
  add column if not exists hr_onboarding_status text not null default 'not_started',
  add column if not exists hr_onboarding_reference text null;

update app_theatre_budget.contracts
set engagement_type = case
  when is_union then 'union_freelance_artist'
  else 'independent_contractor'
end
where (is_union and engagement_type = 'independent_contractor')
   or engagement_type is null
   or engagement_type not in ('independent_contractor', 'union_freelance_artist', 'temporary_employee');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'contracts_engagement_type_check'
  ) then
    alter table app_theatre_budget.contracts add constraint contracts_engagement_type_check
      check (engagement_type in ('independent_contractor', 'union_freelance_artist', 'temporary_employee'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'contracts_compensation_basis_check'
  ) then
    alter table app_theatre_budget.contracts add constraint contracts_compensation_basis_check
      check (compensation_basis in ('flat_fee', 'hourly'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'contracts_hr_onboarding_status_check'
  ) then
    alter table app_theatre_budget.contracts add constraint contracts_hr_onboarding_status_check
      check (hr_onboarding_status in ('not_started', 'submitted_to_hr', 'onboarding', 'complete', 'not_required'));
  end if;
end;
$$;

alter table app_theatre_budget.contract_installments
  add column if not exists payment_channel text not null default 'check_request';

update app_theatre_budget.contract_installments installment
set payment_channel = 'payroll'
from app_theatre_budget.contracts contract
where contract.id = installment.contract_id
  and contract.engagement_type = 'temporary_employee';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'contract_installments_payment_channel_check'
  ) then
    alter table app_theatre_budget.contract_installments add constraint contract_installments_payment_channel_check
      check (payment_channel in ('check_request', 'payroll'));
  end if;
end;
$$;

create table if not exists app_theatre_budget.expense_claims (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null references app_theatre_budget.fiscal_years(id) on delete restrict,
  project_id uuid null references app_theatre_budget.projects(id) on delete restrict,
  organization_id uuid not null references app_theatre_budget.organizations(id) on delete restrict,
  credit_card_id uuid null references app_theatre_budget.credit_cards(id) on delete restrict,
  claim_number text not null,
  claim_type text not null,
  claim_month date null,
  status text not null default 'draft',
  authorized_amount numeric(12,2) null,
  settled_amount numeric(12,2) null,
  authorization_claim_id uuid null references app_theatre_budget.expense_claims(id) on delete restrict,
  overage_explanation text null,
  notes text null,
  entered_by_user_id uuid not null references app_theatre_budget.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fiscal_year_id, claim_number),
  constraint expense_claims_number_check check (claim_number ~ '^EC[0-9]{6}$'),
  constraint expense_claims_type_check check (claim_type in ('funding_request', 'monthly_reconciliation', 'reimbursement')),
  constraint expense_claims_status_check check (status in ('draft', 'submitted', 'approved', 'reconciled', 'posted', 'cancelled')),
  constraint expense_claims_scope_check check (project_id is not null or organization_id is not null),
  constraint expense_claims_reconciliation_link_check check (
    (claim_type = 'monthly_reconciliation' and authorization_claim_id is not null)
    or (claim_type <> 'monthly_reconciliation')
  ),
  constraint expense_claims_overage_explanation_check check (
    authorized_amount is null
    or settled_amount is null
    or settled_amount <= authorized_amount
    or nullif(btrim(overage_explanation), '') is not null
  )
);

create index if not exists idx_expense_claims_fy_type_status
  on app_theatre_budget.expense_claims (fiscal_year_id, claim_type, status, created_at desc);
create index if not exists idx_expense_claims_project
  on app_theatre_budget.expense_claims (project_id) where project_id is not null;
create index if not exists idx_expense_claims_organization
  on app_theatre_budget.expense_claims (organization_id);
create index if not exists idx_expense_claims_authorization
  on app_theatre_budget.expense_claims (authorization_claim_id) where authorization_claim_id is not null;

alter table app_theatre_budget.purchases
  add column if not exists expense_claim_id uuid null,
  add column if not exists expense_number text null,
  add column if not exists expense_stage text null,
  add column if not exists authorization_purchase_id uuid null,
  add column if not exists authorized_amount numeric(12,2) null,
  add column if not exists overage_explanation text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'purchases_expense_claim_id_fkey'
  ) then
    alter table app_theatre_budget.purchases add constraint purchases_expense_claim_id_fkey
      foreign key (expense_claim_id) references app_theatre_budget.expense_claims(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'purchases_authorization_purchase_id_fkey'
  ) then
    alter table app_theatre_budget.purchases add constraint purchases_authorization_purchase_id_fkey
      foreign key (authorization_purchase_id) references app_theatre_budget.purchases(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'purchases_expense_number_check'
  ) then
    alter table app_theatre_budget.purchases add constraint purchases_expense_number_check
      check (expense_number is null or expense_number ~ '^EX[0-9]{6}$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'purchases_expense_stage_check'
  ) then
    alter table app_theatre_budget.purchases add constraint purchases_expense_stage_check
      check (expense_stage is null or expense_stage in ('authorization', 'actual', 'reimbursement'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'purchases_expense_overage_explanation_check'
  ) then
    alter table app_theatre_budget.purchases add constraint purchases_expense_overage_explanation_check
      check (
        authorized_amount is null
        or posted_amount <= authorized_amount
        or nullif(btrim(overage_explanation), '') is not null
      );
  end if;
end;
$$;

create unique index if not exists uq_purchases_expense_number
  on app_theatre_budget.purchases (fiscal_year_id, expense_number)
  where expense_number is not null;
create index if not exists idx_purchases_expense_claim
  on app_theatre_budget.purchases (expense_claim_id, expense_stage);
create index if not exists idx_purchases_authorization_purchase
  on app_theatre_budget.purchases (authorization_purchase_id)
  where authorization_purchase_id is not null;

alter table app_theatre_budget.expense_claims enable row level security;

drop policy if exists expense_claims_select_scoped on app_theatre_budget.expense_claims;
create policy expense_claims_select_scoped on app_theatre_budget.expense_claims
for select to authenticated using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id, organization_id, project_id, null,
    array['admin','project_manager','buyer','viewer']::app_theatre_budget.app_role[]
  )
);

drop policy if exists expense_claims_insert_scoped on app_theatre_budget.expense_claims;
create policy expense_claims_insert_scoped on app_theatre_budget.expense_claims
for insert to authenticated with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id, organization_id, project_id, null,
    array['admin','project_manager','buyer']::app_theatre_budget.app_role[]
  )
);

drop policy if exists expense_claims_update_scoped on app_theatre_budget.expense_claims;
create policy expense_claims_update_scoped on app_theatre_budget.expense_claims
for update to authenticated using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id, organization_id, project_id, null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
) with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id, organization_id, project_id, null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

drop policy if exists expense_claims_delete_scoped on app_theatre_budget.expense_claims;
create policy expense_claims_delete_scoped on app_theatre_budget.expense_claims
for delete to authenticated using (app_theatre_budget.is_admin_user());

grant select, insert, update, delete on app_theatre_budget.expense_claims to authenticated;

notify pgrst, 'reload schema';
