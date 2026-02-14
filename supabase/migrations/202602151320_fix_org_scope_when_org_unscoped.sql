-- Organizations are globally available across fiscal years.
-- If an organization has fiscal_year_id null, FY-scoped users should still be able to read it.

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
      and (
        uas.fiscal_year_id is null
        or o.fiscal_year_id is null
        or uas.fiscal_year_id = o.fiscal_year_id
      )
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
      and (
        uas.fiscal_year_id is null
        or o.fiscal_year_id is null
        or uas.fiscal_year_id = o.fiscal_year_id
      )
  );
$$;
