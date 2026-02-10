-- Admin-managed master data and org-aware project creation

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

-- Expand project creation function to optionally attach an organization.
create or replace function public.create_project_with_admin(
  p_name text,
  p_season text default null,
  p_use_template boolean default false,
  p_template_name text default 'Play/Musical Default',
  p_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_template_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be authenticated to create a project.';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Project name is required.';
  end if;

  insert into public.users (id, full_name)
  values (auth.uid(), coalesce((auth.jwt() -> 'user_metadata' ->> 'full_name'), (auth.jwt() ->> 'email'), 'User'))
  on conflict (id) do update
  set full_name = excluded.full_name;

  insert into public.projects (name, season, organization_id)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_season, '')), ''),
    p_organization_id
  )
  returning id into v_project_id;

  insert into public.project_memberships (project_id, user_id, role)
  values (v_project_id, auth.uid(), 'admin')
  on conflict (project_id, user_id) do update set role = excluded.role;

  if coalesce(p_use_template, false) then
    select bt.id
    into v_template_id
    from public.budget_templates bt
    where bt.name = coalesce(nullif(trim(coalesce(p_template_name, '')), ''), 'Play/Musical Default')
    limit 1;

    if v_template_id is not null then
      insert into public.project_budget_lines (
        project_id,
        budget_code,
        category,
        line_name,
        allocated_amount,
        sort_order
      )
      select
        v_project_id,
        btl.budget_code,
        btl.category,
        btl.line_name,
        btl.default_allocated_amount,
        btl.sort_order
      from public.budget_template_lines btl
      where btl.template_id = v_template_id
      on conflict (project_id, budget_code, category, line_name) do nothing;
    end if;
  end if;

  return v_project_id;
end;
$$;

grant execute on function public.create_project_with_admin(text, text, boolean, text, uuid) to authenticated;

-- Relax read visibility for master data so admins can manage before linking projects.
drop policy if exists "members can read fiscal years" on public.fiscal_years;
create policy "members can read fiscal years"
on public.fiscal_years
for select
using (
  public.is_any_admin()
  or exists (
    select 1
    from public.organizations o
    join public.projects p on p.organization_id = o.id
    join public.project_memberships pm on pm.project_id = p.id
    where o.fiscal_year_id = fiscal_years.id
      and pm.user_id = auth.uid()
  )
);

drop policy if exists "members can read organizations" on public.organizations;
create policy "members can read organizations"
on public.organizations
for select
using (
  public.is_any_admin()
  or exists (
    select 1
    from public.projects p
    join public.project_memberships pm on pm.project_id = p.id
    where p.organization_id = organizations.id
      and pm.user_id = auth.uid()
  )
);

-- Account code management for admins
alter table public.account_codes enable row level security;

drop policy if exists "members can read account codes" on public.account_codes;
create policy "members can read account codes"
on public.account_codes
for select
using (auth.uid() is not null);

drop policy if exists "admins can manage account codes" on public.account_codes;
create policy "admins can manage account codes"
on public.account_codes
for all
using (public.is_any_admin())
with check (public.is_any_admin());

grant select, insert, update, delete on public.account_codes to authenticated;
