-- In-app admin bootstrap helpers

with template_row as (
  insert into public.budget_templates (name, description)
  values ('Play/Musical Default', 'Starter template for typical theatre productions')
  on conflict (name) do update set description = excluded.description
  returning id
)
insert into public.budget_template_lines (
  template_id,
  budget_code,
  category,
  line_name,
  default_allocated_amount,
  sort_order
)
select
  template_row.id,
  line.budget_code,
  line.category,
  line.line_name,
  line.default_allocated_amount,
  line.sort_order
from template_row
cross join (
  values
    ('11300', 'Scenic', 'Scenic', 0::numeric, 1),
    ('11305', 'Costumes', 'Costumes', 0::numeric, 2),
    ('11301', 'Lighting', 'Lighting', 0::numeric, 3),
    ('11302', 'Sound', 'Sound', 0::numeric, 4),
    ('11304', 'Props', 'Props', 0::numeric, 5),
    ('11308', 'Miscellaneous', 'Miscellaneous', 0::numeric, 6),
    ('11309', 'Rights', 'Rights', 0::numeric, 7),
    ('11412', 'Hospitality', 'Meals with Guests', 0::numeric, 8),
    ('11220', 'Travel', 'Lodging', 0::numeric, 9)
) as line(budget_code, category, line_name, default_allocated_amount, sort_order)
on conflict (template_id, budget_code, category, line_name) do update
set
  default_allocated_amount = excluded.default_allocated_amount,
  sort_order = excluded.sort_order;

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

  insert into public.projects (name, season)
  values (trim(p_name), nullif(trim(coalesce(p_season, '')), ''))
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

grant execute on function public.create_project_with_admin(text, text, boolean, text) to authenticated;
