-- Scoped access assignments for viewer/buyer/pm/admin UI filtering and governance.

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
create index if not exists idx_user_access_scopes_role on public.user_access_scopes (scope_role);
create index if not exists idx_user_access_scopes_project on public.user_access_scopes (project_id);
create index if not exists idx_user_access_scopes_org on public.user_access_scopes (organization_id);
create index if not exists idx_user_access_scopes_fy on public.user_access_scopes (fiscal_year_id);
create index if not exists idx_user_access_scopes_category on public.user_access_scopes (production_category_id);

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
  );
$$;

drop policy if exists "admins can read all profiles" on public.users;
create policy "admins can read all profiles"
on public.users
for select
to authenticated
using ((select public.is_admin_user()));

alter table public.user_access_scopes enable row level security;

drop policy if exists "users can read own access scopes" on public.user_access_scopes;
create policy "users can read own access scopes"
on public.user_access_scopes
for select
to authenticated
using (
  user_id = auth.uid()
  or (select public.is_admin_user())
);

drop policy if exists "admins can manage access scopes" on public.user_access_scopes;
create policy "admins can manage access scopes"
on public.user_access_scopes
for all
to authenticated
using ((select public.is_admin_user()))
with check ((select public.is_admin_user()));

grant select, insert, update, delete on public.user_access_scopes to authenticated;
