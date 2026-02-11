-- Link credit-card purchases directly to a statement month.

alter table public.purchases
add column if not exists cc_statement_month_id uuid references public.cc_statement_months (id) on delete set null;

create index if not exists idx_purchases_cc_statement_month_id on public.purchases (cc_statement_month_id);
