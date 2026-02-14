-- Phase 1: canonical access model + duplicate RLS cleanup.
-- Admin: full access
-- PM: project membership scoped
-- Buyer/Viewer: scope-aware via user_access_scopes + role

create table if not exists public.user_access_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  scope_role public.app_role not null,
  fiscal_year_id uuid references public.fiscal_years (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  production_category_id uuid references public.production_categories (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_access_scopes_user on public.user_access_scopes (user_id);
create index if not exists idx_user_access_scopes_project on public.user_access_scopes (project_id);
create index if not exists idx_user_access_scopes_org on public.user_access_scopes (organization_id);
create index if not exists idx_user_access_scopes_fy on public.user_access_scopes (fiscal_year_id);
create index if not exists idx_user_access_scopes_category on public.user_access_scopes (production_category_id);

-- Collapse exact duplicate scopes before enforcing unique index.
delete from public.user_access_scopes uas
where uas.id in (
  select duplicate.id
  from (
    select
      id,
      row_number() over (
        partition by
          user_id,
          scope_role,
          coalesce(fiscal_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
          coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
          coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
          coalesce(production_category_id, '00000000-0000-0000-0000-000000000000'::uuid)
        order by created_at, id
      ) as rn
    from public.user_access_scopes
  ) as duplicate
  where duplicate.rn > 1
);

-- Enforce uniqueness even when nullable scope dimensions are null.
create unique index if not exists uq_user_access_scopes_identity
on public.user_access_scopes (
  user_id,
  scope_role,
  coalesce(fiscal_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(production_category_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

alter table public.user_access_scopes enable row level security;

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

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_user()
  or exists (
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
  select public.is_admin_user()
  or exists (
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
  select public.is_admin_user()
  or exists (
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
  select public.is_admin_user()
  or exists (
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

-- User scopes policies
drop policy if exists "users can read own access scopes" on public.user_access_scopes;
drop policy if exists "admins can manage access scopes" on public.user_access_scopes;

create policy "users can read own access scopes"
on public.user_access_scopes
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_user()
);

create policy "admins can manage access scopes"
on public.user_access_scopes
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

grant select, insert, update, delete on public.user_access_scopes to authenticated;

-- Canonical projects policies (remove duplicates from prior migrations).
drop policy if exists "project members can read projects" on public.projects;
drop policy if exists "members can read projects" on public.projects;
drop policy if exists "admins can manage projects" on public.projects;
drop policy if exists "project admins can manage projects" on public.projects;

create policy "members can read projects"
on public.projects
for select
to authenticated
using (public.is_project_member(id));

create policy "project admins can manage projects"
on public.projects
for all
to authenticated
using (public.has_project_role(id, array['admin']::public.app_role[]))
with check (public.has_project_role(id, array['admin']::public.app_role[]));

-- Canonical purchases policies (scope-aware helper driven).
drop policy if exists "members can read purchases" on public.purchases;
drop policy if exists "buyer pm admin can create purchases" on public.purchases;
drop policy if exists "pm admin can update purchases" on public.purchases;
drop policy if exists "admin can delete purchases" on public.purchases;
drop policy if exists "purchases_select_member" on public.purchases;
drop policy if exists "purchases_insert_buyer_pm_admin" on public.purchases;
drop policy if exists "purchases_update_pm_admin" on public.purchases;
drop policy if exists "purchases_delete_admin" on public.purchases;

create policy "purchases_select_member"
on public.purchases
for select
to authenticated
using (public.is_project_member(project_id));

create policy "purchases_insert_buyer_pm_admin"
on public.purchases
for insert
to authenticated
with check (public.has_project_role(project_id, array['admin','project_manager','buyer']::public.app_role[]));

create policy "purchases_update_pm_admin"
on public.purchases
for update
to authenticated
using (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]))
with check (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]));

create policy "purchases_delete_admin"
on public.purchases
for delete
to authenticated
using (public.has_project_role(project_id, array['admin']::public.app_role[]));

-- Canonical purchase_events policies (scope-aware helper driven).
drop policy if exists "members can read purchase events" on public.purchase_events;
drop policy if exists "buyer pm admin can create purchase events" on public.purchase_events;
drop policy if exists "purchase_events_select_member" on public.purchase_events;
drop policy if exists "purchase_events_insert_member" on public.purchase_events;

create policy "purchase_events_select_member"
on public.purchase_events
for select
to authenticated
using (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_events.purchase_id
      and public.is_project_member(p.project_id)
  )
);

create policy "purchase_events_insert_member"
on public.purchase_events
for insert
to authenticated
with check (
  changed_by_user_id = auth.uid()
  and exists (
    select 1
    from public.purchases p
    where p.id = purchase_events.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager','buyer']::public.app_role[])
  )
);

-- Vendors: one canonical manage policy.
drop policy if exists "pm admin can manage vendors" on public.vendors;
drop policy if exists "pm admin buyer can manage vendors" on public.vendors;

create policy "pm admin buyer can manage vendors"
on public.vendors
for all
to authenticated
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin','project_manager','buyer')
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin','project_manager','buyer')
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin','project_manager','buyer')
  )
  or exists (
    select 1
    from public.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and uas.scope_role in ('admin','project_manager','buyer')
  )
);

-- Users: ensure admin profile visibility policy remains canonical.
drop policy if exists "admins can read all profiles" on public.users;
create policy "admins can read all profiles"
on public.users
for select
to authenticated
using (public.is_admin_user());
