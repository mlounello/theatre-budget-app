-- Track Banner invoice and credit lines without duplicating or prematurely posting a PO.

alter table app_theatre_budget.purchases
  add column if not exists invoice_tracking_enabled boolean not null default false;

create table if not exists app_theatre_budget.purchase_invoice_transactions (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references app_theatre_budget.purchases(id) on delete cascade,
  purchase_allocation_id uuid not null references app_theatre_budget.purchase_allocations(id) on delete restrict,
  document_number text not null,
  transaction_date date not null,
  description text null,
  amount numeric(12, 2) not null check (amount <> 0),
  source_line_key text null,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  voided_at timestamptz null,
  voided_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_purchase_invoice_transactions_purchase
  on app_theatre_budget.purchase_invoice_transactions (purchase_id, transaction_date, document_number);

create index if not exists idx_purchase_invoice_transactions_allocation
  on app_theatre_budget.purchase_invoice_transactions (purchase_allocation_id)
  where voided_at is null;

create unique index if not exists uq_purchase_invoice_transactions_source_line
  on app_theatre_budget.purchase_invoice_transactions (purchase_id, source_line_key)
  where source_line_key is not null;

alter table app_theatre_budget.purchase_invoice_transactions enable row level security;

drop policy if exists purchase_invoice_transactions_select_scoped on app_theatre_budget.purchase_invoice_transactions;
drop policy if exists purchase_invoice_transactions_insert_scoped on app_theatre_budget.purchase_invoice_transactions;
drop policy if exists purchase_invoice_transactions_update_scoped on app_theatre_budget.purchase_invoice_transactions;

create policy purchase_invoice_transactions_select_scoped
on app_theatre_budget.purchase_invoice_transactions
for select to authenticated using (
  exists (
    select 1
    from app_theatre_budget.purchases purchase
    join app_theatre_budget.purchase_allocations allocation
      on allocation.id = purchase_invoice_transactions.purchase_allocation_id
     and allocation.purchase_id = purchase.id
    where purchase.id = purchase_invoice_transactions.purchase_id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        allocation.organization_id,
        allocation.project_id,
        allocation.production_category_id,
        array['admin','project_manager','buyer','viewer']::app_theatre_budget.app_role[]
      )
  )
);

create policy purchase_invoice_transactions_insert_scoped
on app_theatre_budget.purchase_invoice_transactions
for insert to authenticated with check (
  exists (
    select 1
    from app_theatre_budget.purchases purchase
    join app_theatre_budget.purchase_allocations allocation
      on allocation.id = purchase_invoice_transactions.purchase_allocation_id
     and allocation.purchase_id = purchase.id
    where purchase.id = purchase_invoice_transactions.purchase_id
      and purchase.request_type = 'requisition'
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        allocation.organization_id,
        allocation.project_id,
        allocation.production_category_id,
        array['admin','project_manager']::app_theatre_budget.app_role[]
      )
  )
);

create policy purchase_invoice_transactions_update_scoped
on app_theatre_budget.purchase_invoice_transactions
for update to authenticated
using (
  exists (
    select 1
    from app_theatre_budget.purchases purchase
    join app_theatre_budget.purchase_allocations allocation
      on allocation.id = purchase_invoice_transactions.purchase_allocation_id
     and allocation.purchase_id = purchase.id
    where purchase.id = purchase_invoice_transactions.purchase_id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        allocation.organization_id,
        allocation.project_id,
        allocation.production_category_id,
        array['admin','project_manager']::app_theatre_budget.app_role[]
      )
  )
)
with check (
  exists (
    select 1
    from app_theatre_budget.purchases purchase
    join app_theatre_budget.purchase_allocations allocation
      on allocation.id = purchase_invoice_transactions.purchase_allocation_id
     and allocation.purchase_id = purchase.id
    where purchase.id = purchase_invoice_transactions.purchase_id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        allocation.organization_id,
        allocation.project_id,
        allocation.production_category_id,
        array['admin','project_manager']::app_theatre_budget.app_role[]
      )
  )
);

grant select, insert, update on app_theatre_budget.purchase_invoice_transactions to authenticated;

create or replace function app_theatre_budget.validate_purchase_invoice_transaction()
returns trigger
language plpgsql
set search_path = app_theatre_budget, public
as $$
declare
  v_allocation_purchase_id uuid;
  v_request_type text;
begin
  select allocation.purchase_id into v_allocation_purchase_id
  from app_theatre_budget.purchase_allocations allocation
  where allocation.id = new.purchase_allocation_id;

  if v_allocation_purchase_id is null or v_allocation_purchase_id is distinct from new.purchase_id then
    raise exception 'The invoice line allocation must belong to its PO.';
  end if;

  select purchase.request_type into v_request_type
  from app_theatre_budget.purchases purchase
  where purchase.id = new.purchase_id;

  if v_request_type is distinct from 'requisition' then
    raise exception 'Invoice and credit lines are available only for requisition POs.';
  end if;

  new.document_number := upper(trim(new.document_number));
  new.description := nullif(trim(new.description), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists purchase_invoice_transactions_validate on app_theatre_budget.purchase_invoice_transactions;
create trigger purchase_invoice_transactions_validate
before insert or update of purchase_id, purchase_allocation_id, document_number, transaction_date, description, amount, voided_at
on app_theatre_budget.purchase_invoice_transactions
for each row execute function app_theatre_budget.validate_purchase_invoice_transaction();

create or replace function app_theatre_budget.recalculate_partial_po(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = app_theatre_budget, public
as $$
declare
  v_tracking boolean;
  v_total numeric(12, 2);
  v_posted numeric(12, 2);
  v_encumbered numeric(12, 2);
  v_procurement_status text;
begin
  select purchase.invoice_tracking_enabled, purchase.estimated_amount, purchase.procurement_status
    into v_tracking, v_total, v_procurement_status
  from app_theatre_budget.purchases purchase
  where purchase.id = p_purchase_id
  for update;

  if not found or not coalesce(v_tracking, false) then return; end if;

  select coalesce(sum(transaction.amount), 0)::numeric(12, 2)
    into v_posted
  from app_theatre_budget.purchase_invoice_transactions transaction
  where transaction.purchase_id = p_purchase_id
    and transaction.voided_at is null;

  select coalesce(sum(greatest(allocation.amount - coalesce(posting.posted_amount, 0), 0)), 0)::numeric(12, 2)
    into v_encumbered
  from app_theatre_budget.purchase_allocations allocation
  left join lateral (
    select coalesce(sum(transaction.amount), 0)::numeric(12, 2) as posted_amount
    from app_theatre_budget.purchase_invoice_transactions transaction
    where transaction.purchase_allocation_id = allocation.id
      and transaction.voided_at is null
  ) posting on true
  where allocation.purchase_id = p_purchase_id;

  if not exists (
    select 1 from app_theatre_budget.purchase_allocations allocation where allocation.purchase_id = p_purchase_id
  ) then
    v_encumbered := greatest(coalesce(v_total, 0) - v_posted, 0);
  end if;

  update app_theatre_budget.purchases
  set requested_amount = 0,
      encumbered_amount = case when v_procurement_status = 'cancelled' then 0 else v_encumbered end,
      pending_cc_amount = 0,
      posted_amount = case when v_procurement_status = 'cancelled' then 0 else v_posted end,
      status = case
        when v_procurement_status = 'cancelled' then 'cancelled'::app_theatre_budget.purchase_status
        when v_encumbered > 0 then 'encumbered'::app_theatre_budget.purchase_status
        when v_posted <> 0 then 'posted'::app_theatre_budget.purchase_status
        else 'encumbered'::app_theatre_budget.purchase_status
      end,
      posted_date = case when v_posted <> 0 then coalesce(posted_date, current_date) else null end
  where id = p_purchase_id;
end;
$$;

revoke all on function app_theatre_budget.recalculate_partial_po(uuid) from public;

create or replace function app_theatre_budget.refresh_partial_po_from_transaction()
returns trigger
language plpgsql
security definer
set search_path = app_theatre_budget, public
as $$
declare
  v_purchase_id uuid;
begin
  v_purchase_id := coalesce(new.purchase_id, old.purchase_id);
  update app_theatre_budget.purchases
  set invoice_tracking_enabled = true
  where id = v_purchase_id and invoice_tracking_enabled = false;
  perform app_theatre_budget.recalculate_partial_po(v_purchase_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists purchase_invoice_transactions_refresh_purchase on app_theatre_budget.purchase_invoice_transactions;
create trigger purchase_invoice_transactions_refresh_purchase
after insert or update or delete on app_theatre_budget.purchase_invoice_transactions
for each row execute function app_theatre_budget.refresh_partial_po_from_transaction();

create or replace function app_theatre_budget.refresh_partial_po_from_allocation()
returns trigger
language plpgsql
security definer
set search_path = app_theatre_budget, public
as $$
begin
  perform app_theatre_budget.recalculate_partial_po(coalesce(new.purchase_id, old.purchase_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists purchase_allocations_refresh_partial_po on app_theatre_budget.purchase_allocations;
create trigger purchase_allocations_refresh_partial_po
after insert or update of amount or delete on app_theatre_budget.purchase_allocations
for each row execute function app_theatre_budget.refresh_partial_po_from_allocation();

create or replace function app_theatre_budget.refresh_partial_po_from_parent()
returns trigger
language plpgsql
security definer
set search_path = app_theatre_budget, public
as $$
begin
  if new.invoice_tracking_enabled then
    perform app_theatre_budget.recalculate_partial_po(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_refresh_partial_po on app_theatre_budget.purchases;
create trigger purchases_refresh_partial_po
after update of estimated_amount, procurement_status on app_theatre_budget.purchases
for each row execute function app_theatre_budget.refresh_partial_po_from_parent();

-- Correct the known partially invoiced costume PO from the attached Banner detail.
do $$
declare
  v_purchase_id uuid;
  v_allocation_id uuid;
begin
  select purchase.id into v_purchase_id
  from app_theatre_budget.purchases purchase
  where upper(coalesce(purchase.po_number, '')) = 'EP023217'
  order by purchase.created_at desc
  limit 1;

  if v_purchase_id is null then return; end if;

  select allocation.id into v_allocation_id
  from app_theatre_budget.purchase_allocations allocation
  where allocation.purchase_id = v_purchase_id
  order by allocation.created_at, allocation.id
  limit 1;

  if v_allocation_id is null then return; end if;

  insert into app_theatre_budget.purchase_invoice_transactions (
    purchase_id, purchase_allocation_id, document_number, transaction_date, description, amount, source_line_key
  )
  select
    v_purchase_id,
    v_allocation_id,
    line.document_number,
    line.transaction_date,
    'Amazon Capital Services',
    line.amount,
    line.source_line_key
  from (values
    ('I0547718', date '2026-10-20', -8.99::numeric, 'banner:I0547718:1'),
    ('I0547893', date '2026-10-26', 34.53::numeric, 'banner:I0547893:1'),
    ('I0547893', date '2026-10-26', 21.24::numeric, 'banner:I0547893:2'),
    ('I0547893', date '2026-10-26', 9.49::numeric, 'banner:I0547893:3'),
    ('I0547893', date '2026-10-26', 13.98::numeric, 'banner:I0547893:4'),
    ('I0547893', date '2026-10-26', 42.99::numeric, 'banner:I0547893:5'),
    ('I0547893', date '2026-10-26', 39.99::numeric, 'banner:I0547893:6'),
    ('I0547893', date '2026-10-26', 19.99::numeric, 'banner:I0547893:7'),
    ('I0547893', date '2026-10-26', 34.48::numeric, 'banner:I0547893:8'),
    ('I0547893', date '2026-10-26', 9.59::numeric, 'banner:I0547893:9'),
    ('I0547893', date '2026-10-26', 34.99::numeric, 'banner:I0547893:10'),
    ('I0547893', date '2026-10-26', 19.99::numeric, 'banner:I0547893:11'),
    ('I0547893', date '2026-10-26', 8.99::numeric, 'banner:I0547893:12'),
    ('I0547893', date '2026-10-26', 9.99::numeric, 'banner:I0547893:13'),
    ('I0547893', date '2026-10-26', 18.99::numeric, 'banner:I0547893:14'),
    ('I0547893', date '2026-10-26', 18.49::numeric, 'banner:I0547893:15'),
    ('I0547893', date '2026-10-26', 35.99::numeric, 'banner:I0547893:16'),
    ('I0547893', date '2026-10-26', 26.97::numeric, 'banner:I0547893:17'),
    ('I0547893', date '2026-10-26', 9.99::numeric, 'banner:I0547893:18'),
    ('I0547893', date '2026-10-26', 14.99::numeric, 'banner:I0547893:19'),
    ('I0547893', date '2026-10-26', 35.99::numeric, 'banner:I0547893:20'),
    ('I0547893', date '2026-10-26', 23.99::numeric, 'banner:I0547893:21')
  ) as line(document_number, transaction_date, amount, source_line_key)
  on conflict (purchase_id, source_line_key) where source_line_key is not null do nothing;

  update app_theatre_budget.purchases set invoice_tracking_enabled = true where id = v_purchase_id;
  perform app_theatre_budget.recalculate_partial_po(v_purchase_id);
end;
$$;

-- Shared allocation math: tracked POs use their real invoice/credit lines; legacy POs retain existing behavior.
create or replace view app_theatre_budget.v_purchase_allocation_financials as
select
  purchase.id as purchase_id,
  allocation.id as purchase_allocation_id,
  allocation.project_id,
  allocation.organization_id,
  purchase.fiscal_year_id,
  allocation.production_category_id,
  coalesce(allocation.account_code_id, purchase.banner_account_code_id) as account_code_id,
  allocation.amount as allocation_amount,
  case
    when purchase.status = 'cancelled' then 0
    when purchase.invoice_tracking_enabled then greatest(allocation.amount - coalesce(posting.posted_amount, 0), 0)
    when purchase.status = 'encumbered' then purchase.encumbered_amount * case when totals.allocation_total <> 0 then allocation.amount / totals.allocation_total else 0 end
    else 0
  end::numeric(12, 2) as encumbered_amount,
  case
    when purchase.status = 'cancelled' then 0
    when purchase.invoice_tracking_enabled then coalesce(posting.posted_amount, 0)
    when purchase.status = 'posted' then purchase.posted_amount * case when totals.allocation_total <> 0 then allocation.amount / totals.allocation_total else 0 end
    else 0
  end::numeric(12, 2) as posted_amount,
  case
    when purchase.status = 'pending_cc' then purchase.pending_cc_amount * case when totals.allocation_total <> 0 then allocation.amount / totals.allocation_total else 0 end
    else 0
  end::numeric(12, 2) as pending_cc_amount,
  case
    when purchase.status = 'requested' and purchase.request_type <> 'request' then purchase.requested_amount * case when totals.allocation_total <> 0 then allocation.amount / totals.allocation_total else 0 end
    else 0
  end::numeric(12, 2) as requested_amount,
  case
    when purchase.status = 'requested' and purchase.request_type = 'request' then purchase.requested_amount * case when totals.allocation_total <> 0 then allocation.amount / totals.allocation_total else 0 end
    else 0
  end::numeric(12, 2) as held_amount,
  purchase.request_type,
  purchase.status,
  coalesce(purchase.ordered_on, purchase.posted_date, purchase.received_on, purchase.paid_on, (purchase.created_at at time zone 'utc')::date) as plan_date
from app_theatre_budget.purchases purchase
join app_theatre_budget.purchase_allocations allocation on allocation.purchase_id = purchase.id
left join lateral (
  select coalesce(sum(sibling.amount), 0) as allocation_total
  from app_theatre_budget.purchase_allocations sibling
  where sibling.purchase_id = purchase.id
) totals on true
left join lateral (
  select coalesce(sum(transaction.amount), 0) as posted_amount
  from app_theatre_budget.purchase_invoice_transactions transaction
  where transaction.purchase_allocation_id = allocation.id
    and transaction.voided_at is null
) posting on true;

alter view app_theatre_budget.v_purchase_allocation_financials set (security_invoker = true);
grant select on app_theatre_budget.v_purchase_allocation_financials to authenticated;

create or replace view app_theatre_budget.v_actuals_by_category as
select
  financial.project_id,
  financial.organization_id,
  organization.name as organization_name,
  organization.org_code,
  financial.fiscal_year_id,
  fiscal_year.name as fiscal_year_name,
  coalesce(category.name, 'Uncategorized') as production_category,
  coalesce(sum(financial.requested_amount), 0)::numeric(12, 2) as requested_total,
  coalesce(sum(financial.encumbered_amount), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(financial.pending_cc_amount), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(financial.posted_amount), 0)::numeric(12, 2) as posted_total,
  coalesce(sum(financial.encumbered_amount + financial.pending_cc_amount + financial.posted_amount + financial.held_amount), 0)::numeric(12, 2) as obligated_total,
  coalesce(sum(financial.held_amount), 0)::numeric(12, 2) as held_total
from app_theatre_budget.v_purchase_allocation_financials financial
left join app_theatre_budget.production_categories category on category.id = financial.production_category_id
left join app_theatre_budget.organizations organization on organization.id = financial.organization_id
left join app_theatre_budget.fiscal_years fiscal_year on fiscal_year.id = financial.fiscal_year_id
group by financial.project_id, financial.organization_id, organization.name, organization.org_code,
  financial.fiscal_year_id, fiscal_year.name, coalesce(category.name, 'Uncategorized');

alter view app_theatre_budget.v_actuals_by_category set (security_invoker = true);

create or replace view app_theatre_budget.v_actuals_by_banner_code as
select
  financial.project_id,
  financial.organization_id,
  organization.name as organization_name,
  organization.org_code,
  financial.fiscal_year_id,
  fiscal_year.name as fiscal_year_name,
  coalesce(account.code, 'UNASSIGNED') as banner_account_code,
  coalesce(account.category, 'Unassigned') as banner_category,
  coalesce(account.name, 'Unassigned') as banner_name,
  coalesce(sum(financial.requested_amount), 0)::numeric(12, 2) as requested_total,
  coalesce(sum(financial.encumbered_amount), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(financial.pending_cc_amount), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(financial.posted_amount), 0)::numeric(12, 2) as posted_total,
  coalesce(sum(financial.encumbered_amount + financial.pending_cc_amount + financial.posted_amount + financial.held_amount), 0)::numeric(12, 2) as obligated_total,
  coalesce(sum(financial.held_amount), 0)::numeric(12, 2) as held_total
from app_theatre_budget.v_purchase_allocation_financials financial
left join app_theatre_budget.account_codes account on account.id = financial.account_code_id
left join app_theatre_budget.organizations organization on organization.id = financial.organization_id
left join app_theatre_budget.fiscal_years fiscal_year on fiscal_year.id = financial.fiscal_year_id
group by financial.project_id, financial.organization_id, organization.name, organization.org_code,
  financial.fiscal_year_id, fiscal_year.name,
  coalesce(account.code, 'UNASSIGNED'), coalesce(account.category, 'Unassigned'), coalesce(account.name, 'Unassigned');

alter view app_theatre_budget.v_actuals_by_banner_code set (security_invoker = true);

create or replace view app_theatre_budget.v_monthly_actuals_by_org_account as
with allocated_rows as (
  select
    financial.purchase_id,
    financial.organization_id,
    financial.account_code_id,
    financial.plan_date,
    financial.encumbered_amount + financial.pending_cc_amount + financial.posted_amount + financial.held_amount as obligated_amount
  from app_theatre_budget.v_purchase_allocation_financials financial
),
non_allocated_rows as (
  select
    purchase.id as purchase_id,
    coalesce(purchase.organization_id, project.organization_id) as organization_id,
    purchase.banner_account_code_id as account_code_id,
    coalesce(purchase.ordered_on, purchase.posted_date, purchase.received_on, purchase.paid_on, (purchase.created_at at time zone 'utc')::date) as plan_date,
    case
      when purchase.status = 'encumbered' then purchase.encumbered_amount
      when purchase.status = 'pending_cc' then purchase.pending_cc_amount
      when purchase.status = 'posted' then purchase.posted_amount
      when purchase.status = 'requested' and purchase.request_type = 'request' then purchase.requested_amount
      else 0
    end as obligated_amount
  from app_theatre_budget.purchases purchase
  left join app_theatre_budget.projects project on project.id = purchase.project_id
  where not exists (
    select 1 from app_theatre_budget.purchase_allocations allocation where allocation.purchase_id = purchase.id
  )
),
purchase_scope as (
  select * from allocated_rows
  union all
  select * from non_allocated_rows
)
select
  purchase.fiscal_year_id,
  scope.organization_id,
  scope.account_code_id,
  date_trunc('month', scope.plan_date)::date as month_start,
  coalesce(sum(scope.obligated_amount), 0)::numeric(12, 2) as obligated_amount
from purchase_scope scope
join app_theatre_budget.purchases purchase on purchase.id = scope.purchase_id
where scope.organization_id is not null and scope.account_code_id is not null
group by purchase.fiscal_year_id, scope.organization_id, scope.account_code_id, date_trunc('month', scope.plan_date)::date;

alter view app_theatre_budget.v_monthly_actuals_by_org_account set (security_invoker = true);

notify pgrst, 'reload schema';
