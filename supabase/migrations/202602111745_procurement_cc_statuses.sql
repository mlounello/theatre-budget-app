-- Allow CC workflow statuses in procurement_status for credit-card purchases.

alter table public.purchases
  drop constraint if exists purchases_procurement_status_check;

alter table public.purchases
  add constraint purchases_procurement_status_check check (
    procurement_status in (
      'requested',
      'ordered',
      'partial_received',
      'fully_received',
      'invoice_sent',
      'invoice_received',
      'paid',
      'cancelled',
      'receipts_uploaded',
      'statement_paid',
      'posted_to_account'
    )
  );
