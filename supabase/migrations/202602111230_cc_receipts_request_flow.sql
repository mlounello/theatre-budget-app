-- Buyers can submit request receipts; PM/Admin can reconcile to pending_cc.
-- Also provisions storage bucket for uploaded receipt files.

-- Purchase receipts RLS: include buyer role for create/update/delete.
drop policy if exists "pm admin can manage purchase receipts" on public.purchase_receipts;
create policy "buyer pm admin can manage purchase receipts"
on public.purchase_receipts
for all
to authenticated
using (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_receipts.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager','buyer']::public.app_role[])
  )
)
with check (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_receipts.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager','buyer']::public.app_role[])
  )
);

-- Storage bucket for uploaded receipts.
insert into storage.buckets (id, name, public)
values ('purchase-receipts', 'purchase-receipts', true)
on conflict (id) do nothing;

drop policy if exists "authenticated can read purchase receipts bucket" on storage.objects;
create policy "authenticated can read purchase receipts bucket"
on storage.objects
for select
to authenticated
using (bucket_id = 'purchase-receipts');

drop policy if exists "authenticated can upload purchase receipts bucket" on storage.objects;
create policy "authenticated can upload purchase receipts bucket"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'purchase-receipts');

drop policy if exists "authenticated can update own purchase receipts bucket" on storage.objects;
create policy "authenticated can update own purchase receipts bucket"
on storage.objects
for update
to authenticated
using (bucket_id = 'purchase-receipts')
with check (bucket_id = 'purchase-receipts');

drop policy if exists "authenticated can delete own purchase receipts bucket" on storage.objects;
create policy "authenticated can delete own purchase receipts bucket"
on storage.objects
for delete
to authenticated
using (bucket_id = 'purchase-receipts');
