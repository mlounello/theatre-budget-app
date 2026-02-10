-- Repair budget line RLS for admin setup workflows.
-- Root issue seen in production: "new row violates row-level security policy for table project_budget_lines".

create or replace function public.is_any_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  );
$$;

drop policy if exists "pm or admin can manage budget lines" on public.project_budget_lines;
create policy "pm or admin can manage budget lines"
on public.project_budget_lines
for all
using (
  public.has_project_role(project_id, array['admin','project_manager']::public.app_role[])
  or public.is_any_admin()
)
with check (
  public.has_project_role(project_id, array['admin','project_manager']::public.app_role[])
  or public.is_any_admin()
);
