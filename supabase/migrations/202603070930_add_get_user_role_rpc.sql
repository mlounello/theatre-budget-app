create schema if not exists app_theatre_budget;

create or replace function app_theatre_budget.get_user_role(p_app_id text default null)
returns text
language plpgsql
stable
security definer
set search_path = app_theatre_budget, core, public
as $$
declare
  v_uid uuid := auth.uid();
  v_app_id text := coalesce(nullif(trim(p_app_id), ''), 'theatre_budget');
  v_role text;
begin
  if v_uid is null then
    return 'none';
  end if;

  -- Primary authority for shared auth / multi-app setup.
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

  -- Legacy fallback: project memberships.
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

  if v_role in ('admin', 'project_manager', 'buyer', 'viewer', 'procurement_tracker') then
    return v_role;
  end if;

  -- Legacy fallback: scoped role rows.
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

  if v_role in ('admin', 'project_manager', 'buyer', 'viewer', 'procurement_tracker') then
    return v_role;
  end if;

  return 'none';
end;
$$;

grant execute on function app_theatre_budget.get_user_role(text) to authenticated;
