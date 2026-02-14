-- Phase 4 Step 2: tune RLS helper/policy expressions to avoid per-row auth re-evaluation.
-- Keeps behavior the same; only wraps auth.uid() in a scalar subselect pattern.

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid)
  select exists (
    select 1
    from public.project_memberships pm
    join me on me.uid is not null
    where pm.user_id = me.uid
      and pm.role = 'admin'
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    join me on me.uid is not null
    where uas.user_id = me.uid
      and uas.active = true
      and uas.scope_role = 'admin'
  );
$$;

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid)
  select public.is_admin_user()
  or exists (
    select 1
    from public.project_memberships pm
    join me on me.uid is not null
    where pm.project_id = target_project_id
      and pm.user_id = me.uid
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    join public.projects p on p.id = target_project_id
    join me on me.uid is not null
    where uas.user_id = me.uid
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
  with me as (select auth.uid() as uid)
  select public.is_admin_user()
  or exists (
    select 1
    from public.project_memberships pm
    join me on me.uid is not null
    where pm.project_id = target_project_id
      and pm.user_id = me.uid
      and pm.role = any(allowed_roles)
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    join public.projects p on p.id = target_project_id
    join me on me.uid is not null
    where uas.user_id = me.uid
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
  with me as (select auth.uid() as uid)
  select public.is_admin_user()
  or exists (
    select 1
    from public.projects p
    join public.project_memberships pm on pm.project_id = p.id
    join me on me.uid is not null
    where p.organization_id = target_org_id
      and pm.user_id = me.uid
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    left join public.organizations o on o.id = target_org_id
    join me on me.uid is not null
    where uas.user_id = me.uid
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
  with me as (select auth.uid() as uid)
  select public.is_admin_user()
  or exists (
    select 1
    from public.projects p
    join public.project_memberships pm on pm.project_id = p.id
    join me on me.uid is not null
    where p.organization_id = target_org_id
      and pm.user_id = me.uid
      and pm.role = any(allowed_roles)
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    left join public.organizations o on o.id = target_org_id
    join me on me.uid is not null
    where uas.user_id = me.uid
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

-- Keep policy names stable; tune auth uid comparison pattern.
drop policy if exists "users can read own access scopes" on public.user_access_scopes;
create policy "users can read own access scopes"
on public.user_access_scopes
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin_user()
);

drop policy if exists "purchase_events_insert_member" on public.purchase_events;
create policy "purchase_events_insert_member"
on public.purchase_events
for insert
to authenticated
with check (
  changed_by_user_id = (select auth.uid())
  and exists (
    select 1
    from public.purchases p
    where p.id = purchase_events.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager','buyer']::public.app_role[])
  )
);
