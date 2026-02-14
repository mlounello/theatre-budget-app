-- Add receiving document codes per purchase (one purchase can have many docs)

create table if not exists public.purchase_receiving_docs (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  doc_code text not null,
  received_on date,
  note text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references public.users (id) on delete set null
);

create index if not exists idx_purchase_receiving_docs_purchase_id on public.purchase_receiving_docs (purchase_id);
create index if not exists idx_purchase_receiving_docs_created_at on public.purchase_receiving_docs (created_at);

alter table public.purchase_receiving_docs enable row level security;

drop policy if exists "members can read purchase receiving docs" on public.purchase_receiving_docs;
create policy "members can read purchase receiving docs"
on public.purchase_receiving_docs
for select
to public
using (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_receiving_docs.purchase_id
      and public.is_project_member(p.project_id)
  )
);

drop policy if exists "buyer pm admin can manage purchase receiving docs" on public.purchase_receiving_docs;
create policy "buyer pm admin can manage purchase receiving docs"
on public.purchase_receiving_docs
for all
to authenticated
using (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_receiving_docs.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager','buyer']::public.app_role[])
  )
)
with check (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_receiving_docs.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager','buyer']::public.app_role[])
  )
);

grant select, insert, update, delete on public.purchase_receiving_docs to authenticated;
