-- Phase 3: allow PMs to manage buyer/viewer scopes for their own projects.

-- Users table: PM/Admin can read profiles of users in their managed projects.
drop policy if exists "pm admin can read managed project profiles" on public.users;

create policy "pm admin can read managed project profiles"
on public.users
for select
to authenticated
using (
  exists (
    select 1
    from public.project_memberships actor_pm
    join public.project_memberships target_pm on target_pm.project_id = actor_pm.project_id
    where actor_pm.user_id = auth.uid()
      and actor_pm.role in ('admin', 'project_manager')
      and target_pm.user_id = users.id
  )
);

-- User access scopes: PM/Admin can read scopes for projects they manage.
drop policy if exists "users can read own access scopes" on public.user_access_scopes;
create policy "users can read own access scopes"
on public.user_access_scopes
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_user()
  or (
    project_id is not null
    and exists (
      select 1
      from public.project_memberships pm
      where pm.user_id = auth.uid()
        and pm.project_id = user_access_scopes.project_id
        and pm.role in ('admin', 'project_manager')
    )
  )
);

-- User access scopes: PM can manage only buyer/viewer rows for projects they manage.
drop policy if exists "admins can manage access scopes" on public.user_access_scopes;
create policy "admins can manage access scopes"
on public.user_access_scopes
for all
to authenticated
using (
  public.is_admin_user()
  or (
    scope_role in ('buyer', 'viewer')
    and project_id is not null
    and exists (
      select 1
      from public.project_memberships pm
      where pm.user_id = auth.uid()
        and pm.project_id = user_access_scopes.project_id
        and pm.role in ('admin', 'project_manager')
    )
  )
)
with check (
  public.is_admin_user()
  or (
    scope_role in ('buyer', 'viewer')
    and project_id is not null
    and exists (
      select 1
      from public.project_memberships pm
      where pm.user_id = auth.uid()
        and pm.project_id = user_access_scopes.project_id
        and pm.role in ('admin', 'project_manager')
    )
  )
);
