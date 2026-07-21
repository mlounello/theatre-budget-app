-- Phase 3: contain Theatre Budget authorization inside the shared Supabase project.
--
-- This migration changes authorization metadata only. It does not update or delete
-- application rows. The two institutional planning tables were the only tables in
-- this schema with RLS disabled.

begin;

create or replace function app_theatre_budget.can_read_institutional_budget(
  p_fiscal_year_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select core.is_member('theatre_budget')
      or exists (
        select 1
        from app_theatre_budget.user_access_scopes uas
        where uas.user_id = auth.uid()
          and uas.active = true
          and uas.scope_role in (
            'admin'::app_theatre_budget.app_role,
            'project_manager'::app_theatre_budget.app_role,
            'viewer'::app_theatre_budget.app_role,
            'buyer'::app_theatre_budget.app_role
          )
          -- Institutional access must be explicitly scoped to a fiscal year or org.
          and (uas.fiscal_year_id is not null or uas.organization_id is not null)
          and uas.project_id is null
          and uas.production_category_id is null
          and (uas.fiscal_year_id is null or uas.fiscal_year_id = p_fiscal_year_id)
          and (uas.organization_id is null or uas.organization_id = p_organization_id)
      );
$function$;

create or replace function app_theatre_budget.can_manage_institutional_budget(
  p_fiscal_year_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select core.has_role('theatre_budget', array['admin', 'project_manager']::text[])
      or exists (
        select 1
        from app_theatre_budget.user_access_scopes uas
        where uas.user_id = auth.uid()
          and uas.active = true
          and uas.scope_role in (
            'admin'::app_theatre_budget.app_role,
            'project_manager'::app_theatre_budget.app_role
          )
          -- Project/category assignments never imply institutional plan management.
          and (uas.fiscal_year_id is not null or uas.organization_id is not null)
          and uas.project_id is null
          and uas.production_category_id is null
          and (uas.fiscal_year_id is null or uas.fiscal_year_id = p_fiscal_year_id)
          and (uas.organization_id is null or uas.organization_id = p_organization_id)
      );
$function$;

revoke all on function app_theatre_budget.can_read_institutional_budget(uuid, uuid)
  from public, anon;
revoke all on function app_theatre_budget.can_manage_institutional_budget(uuid, uuid)
  from public, anon;
grant execute on function app_theatre_budget.can_read_institutional_budget(uuid, uuid)
  to authenticated, service_role;
grant execute on function app_theatre_budget.can_manage_institutional_budget(uuid, uuid)
  to authenticated, service_role;

alter table app_theatre_budget.budget_plans enable row level security;
alter table app_theatre_budget.budget_plan_months enable row level security;

drop policy if exists budget_plans_select_access on app_theatre_budget.budget_plans;
create policy budget_plans_select_access
on app_theatre_budget.budget_plans
for select
to authenticated
using (
  app_theatre_budget.can_read_institutional_budget(fiscal_year_id, organization_id)
);

drop policy if exists budget_plans_insert_access on app_theatre_budget.budget_plans;
create policy budget_plans_insert_access
on app_theatre_budget.budget_plans
for insert
to authenticated
with check (
  app_theatre_budget.can_manage_institutional_budget(fiscal_year_id, organization_id)
);

drop policy if exists budget_plans_update_access on app_theatre_budget.budget_plans;
create policy budget_plans_update_access
on app_theatre_budget.budget_plans
for update
to authenticated
using (
  app_theatre_budget.can_manage_institutional_budget(fiscal_year_id, organization_id)
)
with check (
  app_theatre_budget.can_manage_institutional_budget(fiscal_year_id, organization_id)
);

drop policy if exists budget_plans_delete_access on app_theatre_budget.budget_plans;
create policy budget_plans_delete_access
on app_theatre_budget.budget_plans
for delete
to authenticated
using (
  app_theatre_budget.can_manage_institutional_budget(fiscal_year_id, organization_id)
);

drop policy if exists budget_plan_months_select_access on app_theatre_budget.budget_plan_months;
create policy budget_plan_months_select_access
on app_theatre_budget.budget_plan_months
for select
to authenticated
using (
  exists (
    select 1
    from app_theatre_budget.budget_plans bp
    where bp.id = budget_plan_months.budget_plan_id
      and app_theatre_budget.can_read_institutional_budget(
        bp.fiscal_year_id,
        bp.organization_id
      )
  )
);

drop policy if exists budget_plan_months_insert_access on app_theatre_budget.budget_plan_months;
create policy budget_plan_months_insert_access
on app_theatre_budget.budget_plan_months
for insert
to authenticated
with check (
  exists (
    select 1
    from app_theatre_budget.budget_plans bp
    where bp.id = budget_plan_months.budget_plan_id
      and app_theatre_budget.can_manage_institutional_budget(
        bp.fiscal_year_id,
        bp.organization_id
      )
  )
);

drop policy if exists budget_plan_months_update_access on app_theatre_budget.budget_plan_months;
create policy budget_plan_months_update_access
on app_theatre_budget.budget_plan_months
for update
to authenticated
using (
  exists (
    select 1
    from app_theatre_budget.budget_plans bp
    where bp.id = budget_plan_months.budget_plan_id
      and app_theatre_budget.can_manage_institutional_budget(
        bp.fiscal_year_id,
        bp.organization_id
      )
  )
)
with check (
  exists (
    select 1
    from app_theatre_budget.budget_plans bp
    where bp.id = budget_plan_months.budget_plan_id
      and app_theatre_budget.can_manage_institutional_budget(
        bp.fiscal_year_id,
        bp.organization_id
      )
  )
);

drop policy if exists budget_plan_months_delete_access on app_theatre_budget.budget_plan_months;
create policy budget_plan_months_delete_access
on app_theatre_budget.budget_plan_months
for delete
to authenticated
using (
  exists (
    select 1
    from app_theatre_budget.budget_plans bp
    where bp.id = budget_plan_months.budget_plan_id
      and app_theatre_budget.can_manage_institutional_budget(
        bp.fiscal_year_id,
        bp.organization_id
      )
  )
);

-- Global administration comes only from the app-wide membership authority.
-- A project admin remains an admin of that project through has_project_role().
create or replace function app_theatre_budget.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select core.has_role('theatre_budget', array['admin']::text[]);
$function$;

-- Preserve project-specific access while preventing a project assignment from
-- becoming a global app-admin role in server-side UI authorization.
create or replace function app_theatre_budget.get_user_role(p_app_id text default null)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_uid uuid := auth.uid();
  v_app_id text := coalesce(nullif(trim(p_app_id), ''), 'theatre_budget');
  v_role text;
begin
  if v_uid is null then
    return 'none';
  end if;

  if core.is_platform_owner(v_uid) then
    return 'admin';
  end if;

  select lower(am.role::text)
    into v_role
  from core.app_memberships am
  where am.user_id = v_uid
    and am.is_active = true
    and am.app_id::text = v_app_id
  order by
    case lower(am.role::text)
      when 'admin' then 5
      when 'project_manager' then 4
      when 'buyer' then 3
      when 'viewer' then 2
      when 'procurement_tracker' then 1
      else 0
    end desc
  limit 1;

  if v_role in ('admin', 'project_manager', 'buyer', 'viewer', 'procurement_tracker') then
    return v_role;
  end if;

  select lower(pm.role::text)
    into v_role
  from app_theatre_budget.project_memberships pm
  where pm.user_id = v_uid
  order by
    case lower(pm.role::text)
      when 'admin' then 5
      when 'project_manager' then 4
      when 'buyer' then 3
      when 'viewer' then 2
      when 'procurement_tracker' then 1
      else 0
    end desc
  limit 1;

  if v_role in ('admin', 'project_manager') then
    return 'project_manager';
  end if;
  if v_role in ('buyer', 'viewer', 'procurement_tracker') then
    return v_role;
  end if;

  select lower(uas.scope_role::text)
    into v_role
  from app_theatre_budget.user_access_scopes uas
  where uas.user_id = v_uid
    and uas.active = true
  order by
    case lower(uas.scope_role::text)
      when 'admin' then 5
      when 'project_manager' then 4
      when 'buyer' then 3
      when 'viewer' then 2
      when 'procurement_tracker' then 1
      else 0
    end desc
  limit 1;

  if v_role in ('admin', 'project_manager') then
    return 'project_manager';
  end if;
  if v_role in ('buyer', 'viewer', 'procurement_tracker') then
    return v_role;
  end if;

  return 'none';
end;
$function$;

-- Project creation is a global administrative operation. The prior function
-- accepted every authenticated user and promoted them to project admin.
create or replace function app_theatre_budget.create_project_with_admin(
  p_name text,
  p_season text default null,
  p_use_template boolean default false,
  p_template_name text default 'Play/Musical Default',
  p_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public, core
as $function$
declare
  v_project_id uuid;
  v_next_sort integer := 0;
  v_cat record;
begin
  if auth.uid() is null then
    raise exception 'You must be authenticated to create a project.';
  end if;

  if not core.has_role('theatre_budget', array['admin']::text[]) then
    raise exception 'Only a Theatre Budget administrator can create a project.';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Project name is required.';
  end if;

  insert into app_theatre_budget.users (id, full_name)
  values (
    auth.uid(),
    coalesce(
      (auth.jwt() -> 'user_metadata' ->> 'full_name'),
      (auth.jwt() ->> 'email'),
      'User'
    )
  )
  on conflict (id) do update
  set full_name = excluded.full_name;

  insert into app_theatre_budget.projects (name, season, organization_id)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_season, '')), ''),
    p_organization_id
  )
  returning id into v_project_id;

  insert into app_theatre_budget.project_memberships (project_id, user_id, role)
  values (v_project_id, auth.uid(), 'admin')
  on conflict (project_id, user_id) do update set role = excluded.role;

  for v_cat in
    select pc.id, pc.name
    from app_theatre_budget.production_categories pc
    where pc.active = true
    order by pc.sort_order asc, pc.name asc
  loop
    insert into app_theatre_budget.project_budget_lines (
      project_id,
      budget_code,
      category,
      line_name,
      allocated_amount,
      sort_order,
      active,
      account_code_id,
      production_category_id
    )
    values (
      v_project_id,
      'UNASSIGNED',
      v_cat.name,
      v_cat.name,
      0,
      v_next_sort,
      true,
      null,
      v_cat.id
    )
    on conflict (project_id, budget_code, category, line_name) do nothing;

    v_next_sort := v_next_sort + 1;
  end loop;

  return v_project_id;
end;
$function$;

create or replace function app_theatre_budget.create_project_with_admin(
  p_name text,
  p_season text default null,
  p_use_template boolean default false,
  p_template_name text default 'Play/Musical Default'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public, core
as $function$
begin
  return app_theatre_budget.create_project_with_admin(
    p_name => p_name,
    p_season => p_season,
    p_use_template => p_use_template,
    p_template_name => p_template_name,
    p_organization_id => null
  );
end;
$function$;

revoke all on function app_theatre_budget.is_admin_user() from public, anon;
revoke all on function app_theatre_budget.get_user_role(text) from public, anon;
revoke all on function app_theatre_budget.has_project_role(
  uuid,
  app_theatre_budget.app_role[]
) from public, anon;
revoke all on function app_theatre_budget.is_project_member(uuid) from public, anon;
revoke all on function app_theatre_budget.create_project_with_admin(
  text,
  text,
  boolean,
  text,
  uuid
) from public, anon;
revoke all on function app_theatre_budget.create_project_with_admin(
  text,
  text,
  boolean,
  text
) from public, anon;

grant execute on function app_theatre_budget.is_admin_user()
  to authenticated, service_role;
grant execute on function app_theatre_budget.get_user_role(text)
  to authenticated, service_role;
grant execute on function app_theatre_budget.has_project_role(
  uuid,
  app_theatre_budget.app_role[]
) to authenticated, service_role;
grant execute on function app_theatre_budget.is_project_member(uuid)
  to authenticated, service_role;
grant execute on function app_theatre_budget.create_project_with_admin(
  text,
  text,
  boolean,
  text,
  uuid
) to authenticated, service_role;
grant execute on function app_theatre_budget.create_project_with_admin(
  text,
  text,
  boolean,
  text
) to authenticated, service_role;

commit;
