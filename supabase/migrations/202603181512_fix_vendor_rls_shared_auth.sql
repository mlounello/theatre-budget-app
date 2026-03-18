-- Fix vendor RLS for shared-auth/core memberships in app schema.

drop policy if exists "pm admin buyer can insert vendors" on app_theatre_budget.vendors;
drop policy if exists "pm admin buyer can update vendors" on app_theatre_budget.vendors;
drop policy if exists "pm admin buyer can delete vendors" on app_theatre_budget.vendors;
drop policy if exists "pm admin buyer can manage vendors" on app_theatre_budget.vendors;

create policy "pm admin buyer can insert vendors"
on app_theatre_budget.vendors
for insert
to authenticated
with check (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager', 'buyer')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in (
        'admin'::app_theatre_budget.app_role,
        'project_manager'::app_theatre_budget.app_role,
        'buyer'::app_theatre_budget.app_role
      )
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in (
        'admin'::app_theatre_budget.app_role,
        'project_manager'::app_theatre_budget.app_role,
        'buyer'::app_theatre_budget.app_role
      )
  )
);

create policy "pm admin buyer can update vendors"
on app_theatre_budget.vendors
for update
to authenticated
using (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager', 'buyer')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in (
        'admin'::app_theatre_budget.app_role,
        'project_manager'::app_theatre_budget.app_role,
        'buyer'::app_theatre_budget.app_role
      )
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in (
        'admin'::app_theatre_budget.app_role,
        'project_manager'::app_theatre_budget.app_role,
        'buyer'::app_theatre_budget.app_role
      )
  )
)
with check (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager', 'buyer')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in (
        'admin'::app_theatre_budget.app_role,
        'project_manager'::app_theatre_budget.app_role,
        'buyer'::app_theatre_budget.app_role
      )
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in (
        'admin'::app_theatre_budget.app_role,
        'project_manager'::app_theatre_budget.app_role,
        'buyer'::app_theatre_budget.app_role
      )
  )
);

create policy "pm admin buyer can delete vendors"
on app_theatre_budget.vendors
for delete
to authenticated
using (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager', 'buyer')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in (
        'admin'::app_theatre_budget.app_role,
        'project_manager'::app_theatre_budget.app_role,
        'buyer'::app_theatre_budget.app_role
      )
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in (
        'admin'::app_theatre_budget.app_role,
        'project_manager'::app_theatre_budget.app_role,
        'buyer'::app_theatre_budget.app_role
      )
  )
);
