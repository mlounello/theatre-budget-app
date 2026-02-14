-- Make core access helpers aware of user_access_scopes so scoped users can read/write without
-- requiring explicit project_memberships rows for every project.

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    join public.projects p on p.id = target_project_id
    where uas.user_id = auth.uid()
      and uas.active = true
      and (uas.project_id is null or uas.project_id = target_project_id)
      and (uas.organization_id is null or uas.organization_id = p.organization_id)
      and (uas.fiscal_year_id is null or uas.fiscal_year_id = p.fiscal_year_id)
      and (
        uas.production_category_id is null
        or uas.project_id is not null
        or uas.organization_id is not null
        or uas.fiscal_year_id is not null
      )
  );
$$;

create or replace function public.has_project_role(target_project_id uuid, allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
      and pm.role = any(allowed_roles)
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    join public.projects p on p.id = target_project_id
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role = any(allowed_roles)
      and (uas.project_id is null or uas.project_id = target_project_id)
      and (uas.organization_id is null or uas.organization_id = p.organization_id)
      and (uas.fiscal_year_id is null or uas.fiscal_year_id = p.fiscal_year_id)
      and (
        uas.production_category_id is null
        or uas.project_id is not null
        or uas.organization_id is not null
        or uas.fiscal_year_id is not null
      )
  );
$$;

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.project_memberships pm on pm.project_id = p.id
    where p.organization_id = target_org_id
      and pm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    left join public.organizations o on o.id = target_org_id
    where uas.user_id = auth.uid()
      and uas.active = true
      and (uas.organization_id is null or uas.organization_id = target_org_id)
      and (uas.fiscal_year_id is null or uas.fiscal_year_id = o.fiscal_year_id)
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.project_memberships pm on pm.project_id = p.id
    where p.organization_id = target_org_id
      and pm.user_id = auth.uid()
      and pm.role = any(allowed_roles)
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    left join public.organizations o on o.id = target_org_id
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role = any(allowed_roles)
      and (uas.organization_id is null or uas.organization_id = target_org_id)
      and (uas.fiscal_year_id is null or uas.fiscal_year_id = o.fiscal_year_id)
  );
$$;

drop policy if exists "pm admin can manage vendors" on public.vendors;
create policy "pm admin can manage vendors"
on public.vendors
for all
to authenticated
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin', 'project_manager')
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin', 'project_manager')
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin', 'project_manager')
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin', 'project_manager')
  )
);
