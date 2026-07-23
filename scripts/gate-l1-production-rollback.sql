-- Emergency rollback for Gate L1 only.
--
-- This restores the pre-Gate-L1 Theatre Budget function definition and
-- execute grants. It intentionally restores the lint findings and should be
-- used only if a legitimate Production workflow regresses after activation.
-- It does not insert, update, or delete Theatre Budget business rows.

create or replace function app_theatre_budget.ensure_project_category_line(
  p_project_id uuid,
  p_production_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_line_id uuid;
  v_cat_name text;
  v_next_sort integer;
begin
  if auth.uid() is null then
    raise exception 'You must be authenticated.';
  end if;

  select pc.name
  into v_cat_name
  from app_theatre_budget.production_categories pc
  where pc.id = p_production_category_id;

  if v_cat_name is null then
    raise exception 'Invalid production category.';
  end if;

  select pbl.id
  into v_line_id
  from app_theatre_budget.project_budget_lines pbl
  where pbl.project_id = p_project_id
    and pbl.production_category_id = p_production_category_id
  order by pbl.sort_order asc, pbl.created_at asc
  limit 1;

  if v_line_id is null then
    select pbl.id
    into v_line_id
    from app_theatre_budget.project_budget_lines pbl
    where pbl.project_id = p_project_id
      and lower(trim(coalesce(pbl.category, ''))) = lower(trim(v_cat_name))
    order by (pbl.account_code_id is null) desc, pbl.sort_order asc, pbl.created_at asc
    limit 1;

    if v_line_id is not null then
      update app_theatre_budget.project_budget_lines
      set production_category_id = p_production_category_id
      where id = v_line_id;
    end if;
  end if;

  if v_line_id is null then
    select coalesce(max(pbl.sort_order), 0) + 1
    into v_next_sort
    from app_theatre_budget.project_budget_lines pbl
    where pbl.project_id = p_project_id;

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

grant execute on function app_theatre_budget.ensure_project_category_line(uuid, uuid)
  to public, anon, authenticated, service_role;
grant execute on function app_theatre_budget.seed_all_project_budget_lines_from_account_codes()
  to public, anon, authenticated, service_role;
grant execute on function app_theatre_budget.seed_project_budget_lines_for_account_code(uuid)
  to public, anon, authenticated, service_role;
grant execute on function app_theatre_budget.seed_project_budget_lines_for_project(uuid)
  to public, anon, authenticated, service_role;
