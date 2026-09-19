-- Allow fiscal-year organization budgets to opt into projectless purchasing.

alter table app_theatre_budget.organizations
  add column if not exists project_tracking_required boolean not null default true;

alter table app_theatre_budget.purchases
  alter column project_id drop not null;

alter table app_theatre_budget.purchases
  drop constraint if exists purchases_budget_line_required_when_tracked;

alter table app_theatre_budget.purchases
  add constraint purchases_budget_line_required_when_tracked
  check (
    not budget_tracked
    or budget_line_id is not null
    or (
      project_id is null
      and organization_id is not null
      and banner_account_code_id is not null
    )
  );

alter table app_theatre_budget.purchases
  drop constraint if exists purchases_project_or_organization_required;

alter table app_theatre_budget.purchases
  add constraint purchases_project_or_organization_required
  check (project_id is not null or organization_id is not null);

create or replace function app_theatre_budget.can_access_organization_purchase(
  target_organization_id uuid,
  allowed_roles app_theatre_budget.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_theatre_budget, core
as $$
  select
    app_theatre_budget.is_admin_user()
    or exists (
      select 1
      from app_theatre_budget.organizations o
      join app_theatre_budget.user_access_scopes uas
        on uas.user_id = auth.uid()
       and uas.active = true
       and uas.scope_role = any(allowed_roles)
       and (uas.organization_id is null or uas.organization_id = o.id)
       and (uas.fiscal_year_id is null or uas.fiscal_year_id = o.fiscal_year_id)
       and uas.project_id is null
      where o.id = target_organization_id
    );
$$;

revoke all on function app_theatre_budget.can_access_organization_purchase(uuid, app_theatre_budget.app_role[]) from public, anon;
grant execute on function app_theatre_budget.can_access_organization_purchase(uuid, app_theatre_budget.app_role[]) to authenticated;

drop policy if exists "purchases_select_member" on app_theatre_budget.purchases;
create policy "purchases_select_member"
on app_theatre_budget.purchases
for select to authenticated
using (
  (project_id is not null and app_theatre_budget.is_project_member(project_id))
  or (
    project_id is null
    and organization_id is not null
    and app_theatre_budget.can_access_organization_purchase(
      organization_id,
      array['admin','project_manager','viewer','procurement_tracker']::app_theatre_budget.app_role[]
    )
  )
);

drop policy if exists "purchases_insert_buyer_pm_admin" on app_theatre_budget.purchases;
create policy "purchases_insert_buyer_pm_admin"
on app_theatre_budget.purchases
for insert to authenticated
with check (
  (project_id is not null and app_theatre_budget.has_project_role(project_id, array['admin','project_manager','buyer']::app_theatre_budget.app_role[]))
  or (
    project_id is null
    and organization_id is not null
    and app_theatre_budget.can_access_organization_purchase(
      organization_id,
      array['admin','project_manager','buyer']::app_theatre_budget.app_role[]
    )
  )
);

drop policy if exists "purchases_update_pm_admin" on app_theatre_budget.purchases;
create policy "purchases_update_pm_admin"
on app_theatre_budget.purchases
for update to authenticated
using (
  (project_id is not null and app_theatre_budget.has_project_role(project_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
  or (project_id is null and organization_id is not null and app_theatre_budget.can_access_organization_purchase(organization_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
)
with check (
  (project_id is not null and app_theatre_budget.has_project_role(project_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
  or (project_id is null and organization_id is not null and app_theatre_budget.can_access_organization_purchase(organization_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
);

drop policy if exists "purchases_delete_admin" on app_theatre_budget.purchases;
create policy "purchases_delete_admin"
on app_theatre_budget.purchases
for delete to authenticated
using (
  (project_id is not null and app_theatre_budget.has_project_role(project_id, array['admin']::app_theatre_budget.app_role[]))
  or (project_id is null and organization_id is not null and app_theatre_budget.can_access_organization_purchase(organization_id, array['admin']::app_theatre_budget.app_role[]))
);

drop policy if exists "purchase_events_select_member" on app_theatre_budget.purchase_events;
create policy "purchase_events_select_member"
on app_theatre_budget.purchase_events
for select to authenticated
using (
  exists (
    select 1 from app_theatre_budget.purchases p
    where p.id = purchase_events.purchase_id
      and (
        (p.project_id is not null and app_theatre_budget.is_project_member(p.project_id))
        or (p.project_id is null and p.organization_id is not null and app_theatre_budget.can_access_organization_purchase(p.organization_id, array['admin','project_manager','viewer','procurement_tracker']::app_theatre_budget.app_role[]))
      )
  )
);

drop policy if exists "purchase_events_insert_member" on app_theatre_budget.purchase_events;
create policy "purchase_events_insert_member"
on app_theatre_budget.purchase_events
for insert to authenticated
with check (
  changed_by_user_id = auth.uid()
  and exists (
    select 1 from app_theatre_budget.purchases p
    where p.id = purchase_events.purchase_id
      and (
        (p.project_id is not null and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager','buyer']::app_theatre_budget.app_role[]))
        or (p.project_id is null and p.organization_id is not null and app_theatre_budget.can_access_organization_purchase(p.organization_id, array['admin','project_manager','buyer']::app_theatre_budget.app_role[]))
      )
  )
);

drop policy if exists institutional_commitments_manage_pm_admin on app_theatre_budget.institutional_budget_commitments;
create policy institutional_commitments_manage_pm_admin
on app_theatre_budget.institutional_budget_commitments
for all to authenticated
using (
  app_theatre_budget.is_admin_user()
  or exists (
    select 1 from app_theatre_budget.purchases p
    where p.id = institutional_budget_commitments.purchase_id
      and (
        (p.project_id is not null and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
        or (p.project_id is null and p.organization_id is not null and app_theatre_budget.can_access_organization_purchase(p.organization_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
      )
  )
)
with check (
  app_theatre_budget.is_admin_user()
  or exists (
    select 1 from app_theatre_budget.purchases p
    where p.id = institutional_budget_commitments.purchase_id
      and (
        (p.project_id is not null and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
        or (p.project_id is null and p.organization_id is not null and app_theatre_budget.can_access_organization_purchase(p.organization_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
      )
  )
);

drop policy if exists "members can read purchase receipts" on app_theatre_budget.purchase_receipts;
create policy "members can read purchase receipts"
on app_theatre_budget.purchase_receipts
for select to authenticated
using (
  exists (
    select 1 from app_theatre_budget.purchases p
    where p.id = purchase_receipts.purchase_id
      and (
        (p.project_id is not null and app_theatre_budget.is_project_member(p.project_id))
        or (p.project_id is null and p.organization_id is not null and app_theatre_budget.can_access_organization_purchase(p.organization_id, array['admin','project_manager','viewer']::app_theatre_budget.app_role[]))
      )
  )
);

drop policy if exists "pm admin can manage purchase receipts" on app_theatre_budget.purchase_receipts;
create policy "pm admin can manage purchase receipts"
on app_theatre_budget.purchase_receipts
for all to authenticated
using (
  exists (
    select 1 from app_theatre_budget.purchases p
    where p.id = purchase_receipts.purchase_id
      and (
        (p.project_id is not null and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
        or (p.project_id is null and p.organization_id is not null and app_theatre_budget.can_access_organization_purchase(p.organization_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
      )
  )
)
with check (
  exists (
    select 1 from app_theatre_budget.purchases p
    where p.id = purchase_receipts.purchase_id
      and (
        (p.project_id is not null and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
        or (p.project_id is null and p.organization_id is not null and app_theatre_budget.can_access_organization_purchase(p.organization_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
      )
  )
);

drop policy if exists "members can read purchase receiving docs" on app_theatre_budget.purchase_receiving_docs;
create policy "members can read purchase receiving docs"
on app_theatre_budget.purchase_receiving_docs
for select to authenticated
using (
  exists (
    select 1 from app_theatre_budget.purchases p
    where p.id = purchase_receiving_docs.purchase_id
      and (
        (p.project_id is not null and app_theatre_budget.is_project_member(p.project_id))
        or (p.project_id is null and p.organization_id is not null and app_theatre_budget.can_access_organization_purchase(p.organization_id, array['admin','project_manager','viewer']::app_theatre_budget.app_role[]))
      )
  )
);

drop policy if exists "buyer pm admin can manage purchase receiving docs" on app_theatre_budget.purchase_receiving_docs;
create policy "buyer pm admin can manage purchase receiving docs"
on app_theatre_budget.purchase_receiving_docs
for all to authenticated
using (
  exists (
    select 1 from app_theatre_budget.purchases p
    where p.id = purchase_receiving_docs.purchase_id
      and (
        (p.project_id is not null and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager','buyer']::app_theatre_budget.app_role[]))
        or (p.project_id is null and p.organization_id is not null and app_theatre_budget.can_access_organization_purchase(p.organization_id, array['admin','project_manager','buyer']::app_theatre_budget.app_role[]))
      )
  )
)
with check (
  exists (
    select 1 from app_theatre_budget.purchases p
    where p.id = purchase_receiving_docs.purchase_id
      and (
        (p.project_id is not null and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager','buyer']::app_theatre_budget.app_role[]))
        or (p.project_id is null and p.organization_id is not null and app_theatre_budget.can_access_organization_purchase(p.organization_id, array['admin','project_manager','buyer']::app_theatre_budget.app_role[]))
      )
  )
);
