-- Unlink account code creation from project budget-line allocation structure.
-- Account codes remain available for Banner reconciliation only.

-- Stop auto-seeding project lines whenever account codes change.
drop trigger if exists on_account_code_seed_projects on public.account_codes;

-- New projects should default to production-category lines, not account-code lines.
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
  v_next_sort integer := 0;
  v_cat record;
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

  for v_cat in
    select pc.id, pc.name
    from public.production_categories pc
    where pc.active = true
    order by pc.sort_order asc, pc.name asc
  loop
    insert into public.project_budget_lines (
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
$$;

grant execute on function public.create_project_with_admin(text, text, boolean, text, uuid) to authenticated;

create or replace function public.create_project_with_admin(
  p_name text,
  p_season text default null,
  p_use_template boolean default false,
  p_template_name text default 'Play/Musical Default'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_project_with_admin(
    p_name => p_name,
    p_season => p_season,
    p_use_template => p_use_template,
    p_template_name => p_template_name,
    p_organization_id => null
  );
end;
$$;

grant execute on function public.create_project_with_admin(text, text, boolean, text) to authenticated;
