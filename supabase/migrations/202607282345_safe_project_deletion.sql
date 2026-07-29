begin;

create or replace function app_theatre_budget.delete_project_cascade(
  p_project_id uuid,
  p_confirmation_name text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public
as $function$
declare
  v_project_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not app_theatre_budget.is_admin_user() then
    raise exception 'Only admins can delete projects.';
  end if;

  select project.name
    into v_project_name
  from app_theatre_budget.projects project
  where project.id = p_project_id
  for update;

  if v_project_name is null then
    raise exception 'Project was not found or has already been deleted.';
  end if;

  if lower(trim(v_project_name)) = 'external procurement' then
    raise exception 'The External Procurement system project cannot be deleted.';
  end if;

  if trim(coalesce(p_confirmation_name, '')) <> trim(v_project_name) then
    raise exception 'The confirmation name does not match the project name.';
  end if;

  -- Clear records that reference project budget lines with restrictive foreign
  -- keys before the project delete cascades through the remaining hierarchy.
  delete from app_theatre_budget.contracts
  where project_id = p_project_id;

  delete from app_theatre_budget.cc_statement_months
  where project_id = p_project_id;

  delete from app_theatre_budget.purchases
  where project_id = p_project_id;

  delete from app_theatre_budget.projects
  where id = p_project_id;

  if not found then
    raise exception 'Project deletion was not applied.';
  end if;

  return v_project_name;
end;
$function$;

revoke all on function app_theatre_budget.delete_project_cascade(uuid, text) from public, anon;
grant execute on function app_theatre_budget.delete_project_cascade(uuid, text) to authenticated;

commit;
