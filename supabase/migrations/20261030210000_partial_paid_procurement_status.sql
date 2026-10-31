-- Represent requisition POs that have both posted activity and a remaining encumbrance.

alter table app_theatre_budget.purchases
  drop constraint if exists purchases_procurement_status_check;

alter table app_theatre_budget.purchases
  add constraint purchases_procurement_status_check check (
    procurement_status in (
      'requested',
      'ordered',
      'partial_received',
      'fully_received',
      'invoice_sent',
      'invoice_received',
      'partial_paid',
      'paid',
      'cancelled',
      'receipts_uploaded',
      'statement_paid',
      'posted_to_account'
    )
  );

update app_theatre_budget.purchases
set procurement_status = 'partial_paid'
where request_type = 'requisition'
  and coalesce(invoice_tracking_enabled, false)
  and posted_amount > 0
  and encumbered_amount > 0
  and procurement_status <> 'cancelled';

comment on column app_theatre_budget.purchases.procurement_status is
  'Operational workflow state. partial_paid means the PO has posted activity and a remaining unpaid encumbrance.';
