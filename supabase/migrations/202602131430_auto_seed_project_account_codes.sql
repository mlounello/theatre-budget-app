-- Auto-seed project budget lines from account codes for all projects.
-- Goal: every project has every active account code with default $0 allocation.

create or replace function public.seed_project_budget_lines_for_account_code(
  p_account_code_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  with target_code as (
    select ac.id, ac.code, ac.category, ac.name
    from public.account_codes ac
    where ac.id = p_account_code_id
      and ac.active = true
  ),
  missing as (
    select
      p.id as project_id,
      tc.id as account_code_id,
      tc.code,
      coalesce(nullif(trim(tc.category), ''), 'Uncategorized') as category,
      coalesce(nullif(trim(tc.name), ''), tc.code) as line_name,
      row_number() over (partition by p.id order by tc.code) as rn
    from public.projects p
    cross join target_code tc
    where not exists (
      select 1
      from public.project_budget_lines pbl
      where pbl.project_id = p.id
        and pbl.account_code_id = tc.id
    )
  ),
  base_sort as (
    select p.id as project_id, coalesce(max(pbl.sort_order), 0) as max_sort
    from public.projects p
    left join public.project_budget_lines pbl on pbl.project_id = p.id
    group by p.id
  )
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
  select
    m.project_id,
    m.code,
    m.category,
    m.line_name,
    0,
    bs.max_sort + m.rn,
    true,
    m.account_code_id,
    pc.id
  from missing m
  join base_sort bs on bs.project_id = m.project_id
  left join public.production_categories pc on lower(trim(pc.name)) = lower(trim(m.category));

  get diagnostics v_inserted = row_count;
  return coalesce(v_inserted, 0);
end;
$$;

grant execute on function public.seed_project_budget_lines_for_account_code(uuid) to authenticated;

create or replace function public.seed_project_budget_lines_for_project(
  p_project_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  with active_codes as (
    select ac.id, ac.code, ac.category, ac.name
    from public.account_codes ac
    where ac.active = true
  ),
  missing as (
    select
      p.id as project_id,
      ac.id as account_code_id,
      ac.code,
      coalesce(nullif(trim(ac.category), ''), 'Uncategorized') as category,
      coalesce(nullif(trim(ac.name), ''), ac.code) as line_name,
      row_number() over (partition by p.id order by ac.code) as rn
    from public.projects p
    cross join active_codes ac
    where p.id = p_project_id
      and not exists (
        select 1
        from public.project_budget_lines pbl
        where pbl.project_id = p.id
          and pbl.account_code_id = ac.id
      )
  ),
  base_sort as (
    select p.id as project_id, coalesce(max(pbl.sort_order), 0) as max_sort
    from public.projects p
    left join public.project_budget_lines pbl on pbl.project_id = p.id
    where p.id = p_project_id
    group by p.id
  )
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
  select
    m.project_id,
    m.code,
    m.category,
    m.line_name,
    0,
    bs.max_sort + m.rn,
    true,
    m.account_code_id,
    pc.id
  from missing m
  join base_sort bs on bs.project_id = m.project_id
  left join public.production_categories pc on lower(trim(pc.name)) = lower(trim(m.category));

  get diagnostics v_inserted = row_count;
  return coalesce(v_inserted, 0);
end;
$$;

grant execute on function public.seed_project_budget_lines_for_project(uuid) to authenticated;

create or replace function public.seed_all_project_budget_lines_from_account_codes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  with active_codes as (
    select ac.id, ac.code, ac.category, ac.name
    from public.account_codes ac
    where ac.active = true
  ),
  missing as (
    select
      p.id as project_id,
      ac.id as account_code_id,
      ac.code,
      coalesce(nullif(trim(ac.category), ''), 'Uncategorized') as category,
      coalesce(nullif(trim(ac.name), ''), ac.code) as line_name,
      row_number() over (partition by p.id order by ac.code) as rn
    from public.projects p
    cross join active_codes ac
    where not exists (
      select 1
      from public.project_budget_lines pbl
      where pbl.project_id = p.id
        and pbl.account_code_id = ac.id
    )
  ),
  base_sort as (
    select p.id as project_id, coalesce(max(pbl.sort_order), 0) as max_sort
    from public.projects p
    left join public.project_budget_lines pbl on pbl.project_id = p.id
    group by p.id
  )
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
  select
    m.project_id,
    m.code,
    m.category,
    m.line_name,
    0,
    bs.max_sort + m.rn,
    true,
    m.account_code_id,
    pc.id
  from missing m
  join base_sort bs on bs.project_id = m.project_id
  left join public.production_categories pc on lower(trim(pc.name)) = lower(trim(m.category));

  get diagnostics v_inserted = row_count;
  return coalesce(v_inserted, 0);
end;
$$;

grant execute on function public.seed_all_project_budget_lines_from_account_codes() to authenticated;

-- Backfill now for all existing projects.
select public.seed_all_project_budget_lines_from_account_codes();

-- Auto-seed when account codes are inserted/activated.
create or replace function public.handle_account_code_project_seed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    tg_op = 'INSERT'
    and new.active = true
  ) then
    perform public.seed_project_budget_lines_for_account_code(new.id);
  elsif (
    tg_op = 'UPDATE'
    and new.active = true
    and (
      old.active is distinct from new.active
      or old.code is distinct from new.code
      or old.category is distinct from new.category
      or old.name is distinct from new.name
    )
  ) then
    perform public.seed_project_budget_lines_for_account_code(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_account_code_seed_projects on public.account_codes;
create trigger on_account_code_seed_projects
after insert or update on public.account_codes
for each row execute procedure public.handle_account_code_project_seed();

-- Ensure new projects always get all active account codes at $0.
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

  -- Always seed all active account codes for every new project with $0 allocations.
  perform public.seed_project_budget_lines_for_project(v_project_id);

  return v_project_id;
end;
$$;

grant execute on function public.create_project_with_admin(text, text, boolean, text, uuid) to authenticated;

-- Backward-compatible 4-arg signature used by legacy fallback code paths.
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
