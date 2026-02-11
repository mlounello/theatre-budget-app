-- Link individual CC receipts to statement months.

alter table public.purchase_receipts
add column if not exists cc_statement_month_id uuid references public.cc_statement_months (id) on delete set null;

create index if not exists idx_purchase_receipts_cc_statement_month_id
on public.purchase_receipts (cc_statement_month_id);
