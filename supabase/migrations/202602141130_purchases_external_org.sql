-- Allow procurement rows to store explicit org for External Procurement tracking.

alter table public.purchases
add column if not exists organization_id uuid references public.organizations (id) on delete set null;

create index if not exists idx_purchases_organization_id on public.purchases (organization_id);
