-- Fix cc statement RLS for shared-auth/core memberships in app schema.

drop policy if exists "pm admin can insert statement months" on app_theatre_budget.cc_statement_months;
drop policy if exists "pm admin can update statement months" on app_theatre_budget.cc_statement_months;
drop policy if exists "pm admin can delete statement months" on app_theatre_budget.cc_statement_months;

create policy "pm admin can insert statement months"
on app_theatre_budget.cc_statement_months
for insert
to authenticated
with check (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
);

create policy "pm admin can update statement months"
on app_theatre_budget.cc_statement_months
for update
to authenticated
using (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
)
with check (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
);

create policy "pm admin can delete statement months"
on app_theatre_budget.cc_statement_months
for delete
to authenticated
using (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
);

drop policy if exists "pm admin can insert statement lines" on app_theatre_budget.cc_statement_lines;
drop policy if exists "pm admin can update statement lines" on app_theatre_budget.cc_statement_lines;
drop policy if exists "pm admin can delete statement lines" on app_theatre_budget.cc_statement_lines;

create policy "pm admin can insert statement lines"
on app_theatre_budget.cc_statement_lines
for insert
to authenticated
with check (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
);

create policy "pm admin can update statement lines"
on app_theatre_budget.cc_statement_lines
for update
to authenticated
using (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
)
with check (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
);

create policy "pm admin can delete statement lines"
on app_theatre_budget.cc_statement_lines
for delete
to authenticated
using (
  exists (
    select 1
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'theatre_budget'
      and am.is_active = true
      and lower(am.role) in ('admin', 'project_manager')
  )
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin'::app_theatre_budget.app_role, 'project_manager'::app_theatre_budget.app_role)
  )
);
