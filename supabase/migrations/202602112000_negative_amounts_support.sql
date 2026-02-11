-- Allow negative allocation amounts to support returns/credits.

alter table public.purchase_allocations
drop constraint if exists purchase_allocations_amount_check;
