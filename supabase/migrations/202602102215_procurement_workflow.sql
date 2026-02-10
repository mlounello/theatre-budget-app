-- Add SienaWorks-style procurement tracking directly on purchases.

alter table public.purchases
add column if not exists requisition_number text,
add column if not exists po_number text,
add column if not exists invoice_number text,
add column if not exists procurement_status text not null default 'requested',
add column if not exists ordered_on date,
add column if not exists received_on date,
add column if not exists paid_on date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchases_procurement_status_check'
  ) then
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
        'cancelled'
      )
    );
  end if;
end $$;

update public.purchases
set procurement_status = case
  when status = 'posted' then 'paid'
  when status = 'pending_cc' then 'invoice_received'
  when status = 'encumbered' then 'ordered'
  when status = 'cancelled' then 'cancelled'
  else 'requested'
end
where procurement_status is null
  or procurement_status = '';

create table if not exists public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  note text,
  amount_received numeric(12, 2),
  fully_received boolean not null default false,
  attachment_url text,
  created_by_user_id uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_receipts_purchase_id on public.purchase_receipts (purchase_id);

alter table public.purchase_receipts enable row level security;

drop policy if exists "members can read purchase receipts" on public.purchase_receipts;
create policy "members can read purchase receipts"
on public.purchase_receipts
for select
using (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_receipts.purchase_id
      and public.is_project_member(p.project_id)
  )
);

drop policy if exists "pm admin can manage purchase receipts" on public.purchase_receipts;
create policy "pm admin can manage purchase receipts"
on public.purchase_receipts
for all
using (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_receipts.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager']::public.app_role[])
  )
)
with check (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_receipts.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager']::public.app_role[])
  )
);

grant select, insert, update, delete on public.purchase_receipts to authenticated;
