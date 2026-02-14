-- Phase 3: project team assignment helpers.
-- PM can manage buyer/viewer/pm memberships on projects they manage.
-- PM cannot create/remove admin memberships.

create or replace function public.assign_project_membership(
  p_project_id uuid,
  p_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if p_project_id is null or p_user_id is null then
    raise exception 'Project and user are required.';
  end if;

  select pm.role
  into v_actor_role
  from public.project_memberships pm
  where pm.project_id = p_project_id
    and pm.user_id = auth.uid()
  limit 1;

  if v_actor_role is null then
    raise exception 'Only project managers/admins can manage project memberships.';
  end if;

  if v_actor_role = 'project_manager' and p_role = 'admin' then
    raise exception 'Project managers cannot assign admin role.';
  end if;

  if v_actor_role not in ('admin', 'project_manager') then
    raise exception 'Only project managers/admins can manage project memberships.';
  end if;

  insert into public.project_memberships (project_id, user_id, role)
  values (p_project_id, p_user_id, p_role)
  on conflict (project_id, user_id)
  do update set role = excluded.role;
end;
$$;

create or replace function public.remove_project_membership(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role public.app_role;
  v_target_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if p_project_id is null or p_user_id is null then
    raise exception 'Project and user are required.';
  end if;

  select pm.role
  into v_actor_role
  from public.project_memberships pm
  where pm.project_id = p_project_id
    and pm.user_id = auth.uid()
  limit 1;

  if v_actor_role is null or v_actor_role not in ('admin', 'project_manager') then
    raise exception 'Only project managers/admins can manage project memberships.';
  end if;

  select pm.role
  into v_target_role
  from public.project_memberships pm
  where pm.project_id = p_project_id
    and pm.user_id = p_user_id
  limit 1;

  if v_target_role is null then
    return;
  end if;

  if v_actor_role = 'project_manager' and v_target_role = 'admin' then
    raise exception 'Project managers cannot remove admin memberships.';
  end if;

  delete from public.project_memberships
  where project_id = p_project_id
    and user_id = p_user_id;
end;
$$;

grant execute on function public.assign_project_membership(uuid, uuid, public.app_role) to authenticated;
grant execute on function public.remove_project_membership(uuid, uuid) to authenticated;
