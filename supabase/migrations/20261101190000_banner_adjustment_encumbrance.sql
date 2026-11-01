-- Preserve Banner rule classes so accounting adjustments can post to YTD
-- without incorrectly liquidating the remaining PO encumbrance.

alter table app_theatre_budget.purchase_invoice_transactions
  add column if not exists rule_class_code text null,
  add column if not exists relieves_encumbrance boolean not null default true;

update app_theatre_budget.purchase_invoice_transactions
set rule_class_code = nullif(upper(split_part(source_line_key, '|', 10)), '')
where source_line_key like 'banner|%'
  and rule_class_code is null;

update app_theatre_budget.purchase_invoice_transactions
set relieves_encumbrance = false
where rule_class_code like 'AD%'
  and relieves_encumbrance;

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
  new.rule_class_code := nullif(upper(trim(new.rule_class_code)), '');
  if coalesce(new.rule_class_code, '') like 'AD%' then
    new.relieves_encumbrance := false;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists purchase_invoice_transactions_validate on app_theatre_budget.purchase_invoice_transactions;
create trigger purchase_invoice_transactions_validate
before insert or update of purchase_id, purchase_allocation_id, document_number, transaction_date, description, amount, rule_class_code, relieves_encumbrance, voided_at
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
  v_relieved numeric(12, 2);
  v_encumbered numeric(12, 2);
  v_procurement_status text;
begin
  select purchase.invoice_tracking_enabled, purchase.estimated_amount, purchase.procurement_status
    into v_tracking, v_total, v_procurement_status
  from app_theatre_budget.purchases purchase
  where purchase.id = p_purchase_id
  for update;

  if not found or not coalesce(v_tracking, false) then return; end if;

  select
    coalesce(sum(transaction.amount), 0)::numeric(12, 2),
    coalesce(sum(transaction.amount) filter (where transaction.relieves_encumbrance), 0)::numeric(12, 2)
    into v_posted, v_relieved
  from app_theatre_budget.purchase_invoice_transactions transaction
  where transaction.purchase_id = p_purchase_id
    and transaction.voided_at is null;

  select coalesce(sum(greatest(allocation.amount - coalesce(posting.encumbrance_relief_amount, 0), 0)), 0)::numeric(12, 2)
    into v_encumbered
  from app_theatre_budget.purchase_allocations allocation
  left join lateral (
    select coalesce(sum(transaction.amount) filter (where transaction.relieves_encumbrance), 0)::numeric(12, 2) as encumbrance_relief_amount
    from app_theatre_budget.purchase_invoice_transactions transaction
    where transaction.purchase_allocation_id = allocation.id
      and transaction.voided_at is null
  ) posting on true
  where allocation.purchase_id = p_purchase_id;

  if not exists (
    select 1 from app_theatre_budget.purchase_allocations allocation where allocation.purchase_id = p_purchase_id
  ) then
    v_encumbered := greatest(coalesce(v_total, 0) - v_relieved, 0);
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

-- Tracked POs report every accounting line in YTD, while only liquidating
-- entries reduce the associated allocation's remaining encumbrance.
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
    when purchase.invoice_tracking_enabled then greatest(allocation.amount - coalesce(posting.encumbrance_relief_amount, 0), 0)
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
  select
    coalesce(sum(transaction.amount), 0) as posted_amount,
    coalesce(sum(transaction.amount) filter (where transaction.relieves_encumbrance), 0) as encumbrance_relief_amount
  from app_theatre_budget.purchase_invoice_transactions transaction
  where transaction.purchase_allocation_id = allocation.id
    and transaction.voided_at is null
) posting on true;

alter view app_theatre_budget.v_purchase_allocation_financials set (security_invoker = true);
grant select on app_theatre_budget.v_purchase_allocation_financials to authenticated;

do $$
declare
  v_purchase_id uuid;
begin
  for v_purchase_id in
    select distinct transaction.purchase_id
    from app_theatre_budget.purchase_invoice_transactions transaction
    join app_theatre_budget.purchases purchase on purchase.id = transaction.purchase_id
    where purchase.invoice_tracking_enabled
  loop
    perform app_theatre_budget.recalculate_partial_po(v_purchase_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
