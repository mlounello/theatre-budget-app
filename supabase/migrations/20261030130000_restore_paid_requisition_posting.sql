-- Restore the prior accounting policy: a requisition remains encumbered while
-- its invoice is being processed and becomes an actual/YTD expense only when
-- the requisition is marked Paid.

create temporary table requisition_invoice_received_rollback on commit drop as
select
  p.id,
  coalesce(
    nullif(p.posted_amount, 0),
    nullif(p.encumbered_amount, 0),
    nullif(p.requested_amount, 0),
    p.estimated_amount,
    0
  )::numeric(12, 2) as encumbered_amount
from app_theatre_budget.purchases p
where coalesce(p.is_credit_card, false) = false
  and (p.request_type = 'requisition' or p.request_type is null)
  and p.procurement_status = 'invoice_received'
  and p.status <> 'cancelled';

update app_theatre_budget.purchases p
set
  status = 'encumbered',
  requested_amount = 0,
  encumbered_amount = b.encumbered_amount,
  pending_cc_amount = 0,
  posted_amount = 0,
  posted_date = null,
  updated_at = now()
from requisition_invoice_received_rollback b
where p.id = b.id;

do $$
declare
  expected_total numeric(14, 2);
  actual_total numeric(14, 2);
begin
  select coalesce(sum(encumbered_amount), 0)::numeric(14, 2)
  into expected_total
  from requisition_invoice_received_rollback;

  select coalesce(sum(p.encumbered_amount), 0)::numeric(14, 2)
  into actual_total
  from app_theatre_budget.purchases p
  join requisition_invoice_received_rollback b on b.id = p.id;

  if actual_total <> expected_total then
    raise exception
      'Invoice-received requisition rollback changed the financial total (expected %, found %).',
      expected_total,
      actual_total;
  end if;
end
$$;

