-- Requisitions become actual/YTD expenses when Accounts Payable receives the
-- invoice. Payment remains a later operational milestone and must not post the
-- same purchase a second time.

create temporary table requisition_invoice_posting_backfill on commit drop as
select
  p.id,
  coalesce(
    nullif(p.encumbered_amount, 0),
    nullif(p.posted_amount, 0),
    nullif(p.requested_amount, 0),
    p.estimated_amount,
    0
  )::numeric(12, 2) as posting_amount
from app_theatre_budget.purchases p
where coalesce(p.is_credit_card, false) = false
  and (p.request_type = 'requisition' or p.request_type is null)
  and p.procurement_status in ('invoice_received', 'paid')
  and p.status <> 'cancelled';

update app_theatre_budget.purchases p
set
  status = 'posted',
  requested_amount = 0,
  encumbered_amount = 0,
  pending_cc_amount = 0,
  posted_amount = b.posting_amount,
  -- There is no historical invoice-received timestamp column. The row's last
  -- update is the closest available audit date for existing records.
  posted_date = coalesce(p.posted_date, p.updated_at::date, current_date),
  updated_at = now()
from requisition_invoice_posting_backfill b
where p.id = b.id;

do $$
declare
  expected_total numeric(14, 2);
  actual_total numeric(14, 2);
begin
  select coalesce(sum(posting_amount), 0)::numeric(14, 2)
  into expected_total
  from requisition_invoice_posting_backfill;

  select coalesce(sum(p.posted_amount), 0)::numeric(14, 2)
  into actual_total
  from app_theatre_budget.purchases p
  join requisition_invoice_posting_backfill b on b.id = p.id;

  if actual_total <> expected_total then
    raise exception
      'Invoice-received requisition backfill changed the financial total (expected %, found %).',
      expected_total,
      actual_total;
  end if;
end
$$;

