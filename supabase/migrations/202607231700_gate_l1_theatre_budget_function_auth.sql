-- Gate L1: narrow Theatre Budget maintenance RPCs and enforce project/category
-- authorization inside ensure_project_category_line.
--
-- This migration changes only function definitions and execute grants. It
-- does not insert, update, or delete Theatre Budget business rows.

revoke all on function app_theatre_budget.seed_all_project_budget_lines_from_account_codes()
  from public, anon, authenticated;
revoke all on function app_theatre_budget.seed_project_budget_lines_for_account_code(uuid)
  from public, anon, authenticated;
revoke all on function app_theatre_budget.seed_project_budget_lines_for_project(uuid)
  from public, anon, authenticated;

grant execute on function app_theatre_budget.seed_all_project_budget_lines_from_account_codes()
  to service_role;
grant execute on function app_theatre_budget.seed_project_budget_lines_for_account_code(uuid)
  to service_role;
grant execute on function app_theatre_budget.seed_project_budget_lines_for_project(uuid)
  to service_role;

create or replace function app_theatre_budget.ensure_project_category_line(
  p_project_id uuid,
  p_production_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, core
as $function$
declare
  actor_user_id uuid := auth.uid();
  v_line_id uuid;
  v_cat_name text;
  v_next_sort integer;
begin
  if actor_user_id is null then
    raise exception 'You must be authenticated.';
  end if;

  if not (
    core.is_platform_owner(actor_user_id)
    or core.has_role('theatre_budget', array['admin']::text[])
    or exists (
      select 1
      from app_theatre_budget.project_memberships membership
      where membership.project_id = p_project_id
        and membership.user_id = actor_user_id
        and membership.role in (
          'admin'::app_theatre_budget.app_role,
          'project_manager'::app_theatre_budget.app_role,
          'buyer'::app_theatre_budget.app_role
        )
    )
    or exists (
      select 1
      from app_theatre_budget.user_access_scopes scope
      join app_theatre_budget.projects project
        on project.id = p_project_id
      where scope.user_id = actor_user_id
        and scope.active = true
        and scope.scope_role in (
          'admin'::app_theatre_budget.app_role,
          'project_manager'::app_theatre_budget.app_role,
          'buyer'::app_theatre_budget.app_role
        )
        and (scope.project_id is null or scope.project_id = project.id)
        and (
          scope.organization_id is null
          or scope.organization_id = project.organization_id
        )
        and (
          scope.fiscal_year_id is null
          or scope.fiscal_year_id = project.fiscal_year_id
        )
        and (
          scope.production_category_id is null
          or scope.production_category_id = p_production_category_id
        )
        and (
          scope.project_id is not null
          or scope.organization_id is not null
          or scope.fiscal_year_id is not null
        )
    )
  ) then
    raise exception 'You do not have permission to manage this project budget line.';
  end if;

  perform 1
  from app_theatre_budget.projects project
  where project.id = p_project_id;
  if not found then
    raise exception 'Invalid project.';
  end if;

  select category.name
  into v_cat_name
  from app_theatre_budget.production_categories category
  where category.id = p_production_category_id;

  if v_cat_name is null then
    raise exception 'Invalid production category.';
  end if;

  select line.id
  into v_line_id
  from app_theatre_budget.project_budget_lines line
  where line.project_id = p_project_id
    and line.production_category_id = p_production_category_id
  order by line.sort_order asc, line.created_at asc
  limit 1;

  if v_line_id is null then
    select line.id
    into v_line_id
    from app_theatre_budget.project_budget_lines line
    where line.project_id = p_project_id
      and lower(trim(coalesce(line.category, ''))) = lower(trim(v_cat_name))
    order by
      (line.account_code_id is null) desc,
      line.sort_order asc,
      line.created_at asc
    limit 1;

    if v_line_id is not null then
      update app_theatre_budget.project_budget_lines
      set production_category_id = p_production_category_id
      where id = v_line_id;
    end if;
  end if;

  if v_line_id is null then
    select coalesce(max(line.sort_order), 0) + 1
    into v_next_sort
    from app_theatre_budget.project_budget_lines line
    where line.project_id = p_project_id;

    insert into app_theatre_budget.project_budget_lines (
      project_id,
      budget_code,
      category,
      line_name,
      allocated_amount,
      sort_order,
      active,
      production_category_id,
      account_code_id
    )
    values (
      p_project_id,
      'UNASSIGNED',
      v_cat_name,
      v_cat_name,
      0,
      coalesce(v_next_sort, 1),
      true,
      p_production_category_id,
      null
    )
    returning id into v_line_id;
  end if;

  return v_line_id;
end;
$function$;

alter function app_theatre_budget.ensure_project_category_line(uuid, uuid)
  owner to postgres;
revoke all on function app_theatre_budget.ensure_project_category_line(uuid, uuid)
  from public, anon;
grant execute on function app_theatre_budget.ensure_project_category_line(uuid, uuid)
  to authenticated, service_role;
