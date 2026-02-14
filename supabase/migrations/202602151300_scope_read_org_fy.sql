-- Ensure scoped users can read organization/fiscal-year metadata used by UI joins.

create or replace function public.is_admin_user()
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
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role = 'admin'
  );
$$;

drop policy if exists "members can read organizations" on public.organizations;
create policy "members can read organizations"
on public.organizations
for select
to authenticated
using (public.is_org_member(id));

drop policy if exists "members can read fiscal years" on public.fiscal_years;
create policy "members can read fiscal years"
on public.fiscal_years
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.fiscal_year_id = fiscal_years.id
      and public.is_project_member(p.id)
  )
);

drop policy if exists "admins can manage organizations" on public.organizations;
create policy "admins can manage organizations"
on public.organizations
for all
to authenticated
using ((select public.is_admin_user()))
with check ((select public.is_admin_user()));

drop policy if exists "admins can manage fiscal years" on public.fiscal_years;
create policy "admins can manage fiscal years"
on public.fiscal_years
for all
to authenticated
using ((select public.is_admin_user()))
with check ((select public.is_admin_user()));
