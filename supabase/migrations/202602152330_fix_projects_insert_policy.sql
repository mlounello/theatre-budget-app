-- Fix: projects INSERT policy should not require membership on the new row id.
-- Recreate canonical projects manage policies to keep behavior consistent across environments.

drop policy if exists "project admins can manage projects" on public.projects;
drop policy if exists "project admins can insert projects" on public.projects;
drop policy if exists "project admins can update projects" on public.projects;
drop policy if exists "project admins can delete projects" on public.projects;

create policy "project admins can insert projects"
on public.projects
for insert
to authenticated
with check (public.is_admin_user());

create policy "project admins can update projects"
on public.projects
for update
to authenticated
using (public.has_project_role(id, array['admin']::public.app_role[]))
with check (public.has_project_role(id, array['admin']::public.app_role[]));

create policy "project admins can delete projects"
on public.projects
for delete
to authenticated
using (public.has_project_role(id, array['admin']::public.app_role[]));
