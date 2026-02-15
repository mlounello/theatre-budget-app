-- Add dedicated procurement_tracker role and org-scoped external procurement visibility.

alter type public.app_role add value if not exists 'procurement_tracker';

-- Scope guard: procurement_tracker rows are organization-only scopes.
alter table public.user_access_scopes
  drop constraint if exists user_access_scopes_procurement_tracker_org_only;

alter table public.user_access_scopes
  add constraint user_access_scopes_procurement_tracker_org_only
  check (
    scope_role <> 'procurement_tracker'::public.app_role
    or (
      organization_id is not null
      and fiscal_year_id is null
      and project_id is null
      and production_category_id is null
    )
  );

-- Purchases read policy for procurement trackers:
-- only External Procurement project rows, and only for scoped organizations.
drop policy if exists purchases_select_procurement_tracker_external_org on public.purchases;
create policy purchases_select_procurement_tracker_external_org
on public.purchases
for select
to authenticated
using (
  exists (
    select 1
    from public.user_access_scopes uas
    join public.projects p on p.id = purchases.project_id
    where uas.user_id = (select auth.uid())
      and uas.active = true
      and uas.scope_role = 'procurement_tracker'::public.app_role
      and uas.organization_id is not null
      and uas.organization_id = purchases.organization_id
      and lower(trim(p.name)) = 'external procurement'
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
    join public.projects pr on pr.id = p.project_id
    join public.user_access_scopes uas on uas.organization_id = p.organization_id
    where p.id = purchase_receiving_docs.purchase_id
      and uas.user_id = (select auth.uid())
      and uas.active = true
      and uas.scope_role = 'procurement_tracker'::public.app_role
      and lower(trim(pr.name)) = 'external procurement'
  )
);
