-- Security Advisor error-level fixes (safe/idempotent)

-- 1) Ensure RLS is enabled where policies exist / table is exposed.
alter table if exists public.users enable row level security;
alter table if exists public.budget_templates enable row level security;
alter table if exists public.budget_template_lines enable row level security;
alter table if exists public.stg_procurement_import enable row level security;

-- 2) Ensure users table has explicit self policies (in case environment drift removed prior migration effects).
drop policy if exists "users can read own profile" on public.users;
create policy "users can read own profile"
on public.users
for select
to authenticated
using (id = auth.uid());

drop policy if exists "users can update own profile" on public.users;
create policy "users can update own profile"
on public.users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "users can insert own profile" on public.users;
create policy "users can insert own profile"
on public.users
for insert
to authenticated
with check (id = auth.uid());

-- 3) Templates should be readable by signed-in users, writable by admins.
drop policy if exists "members can read budget templates" on public.budget_templates;
create policy "members can read budget templates"
on public.budget_templates
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "admins can manage budget templates" on public.budget_templates;
create policy "admins can manage budget templates"
on public.budget_templates
for all
to authenticated
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
);

drop policy if exists "members can read budget template lines" on public.budget_template_lines;
create policy "members can read budget template lines"
on public.budget_template_lines
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "admins can manage budget template lines" on public.budget_template_lines;
create policy "admins can manage budget template lines"
on public.budget_template_lines
for all
to authenticated
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
);

-- 4) Staging table should not be open; restrict to admins only.
drop policy if exists "admins can manage staging procurement import" on public.stg_procurement_import;
create policy "admins can manage staging procurement import"
on public.stg_procurement_import
for all
to authenticated
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
);

-- 5) Ensure portfolio view runs as invoker (not definer).
alter view if exists public.v_portfolio_summary set (security_invoker = true);
