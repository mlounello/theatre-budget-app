-- Fix procurement_tracker visibility by avoiding direct projects-table joins inside RLS policies.
-- Use a SECURITY DEFINER helper to determine whether a purchase belongs to External Procurement.

create or replace function public.is_external_procurement_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and regexp_replace(lower(trim(p.name)), '\\s+', ' ', 'g') = 'external procurement'
  );
$$;

revoke all on function public.is_external_procurement_project(uuid) from public;
grant execute on function public.is_external_procurement_project(uuid) to authenticated;

drop policy if exists purchases_select_procurement_tracker_external_org on public.purchases;
create policy purchases_select_procurement_tracker_external_org
on public.purchases
for select
to authenticated
using (
  exists (
    select 1
    from public.user_access_scopes uas
    where uas.user_id = (select auth.uid())
      and uas.active = true
      and uas.scope_role = 'procurement_tracker'::public.app_role
      and uas.organization_id is not null
      and uas.organization_id = purchases.organization_id
      and public.is_external_procurement_project(purchases.project_id)
  )
);

drop policy if exists purchase_receiving_docs_select_procurement_tracker_external_org on public.purchase_receiving_docs;
create policy purchase_receiving_docs_select_procurement_tracker_external_org
on public.purchase_receiving_docs
for select
to authenticated
using (
  exists (
    select 1
    from public.purchases p
    join public.user_access_scopes uas on uas.organization_id = p.organization_id
    where p.id = purchase_receiving_docs.purchase_id
      and uas.user_id = (select auth.uid())
      and uas.active = true
      and uas.scope_role = 'procurement_tracker'::public.app_role
      and public.is_external_procurement_project(p.project_id)
  )
);
