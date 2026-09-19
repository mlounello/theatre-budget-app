\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 2: income trigger rollback test'

begin;
set local search_path = app_theatre_budget, public;

do $$
declare
  v_project_id uuid;
  v_project_fiscal_year_id uuid;
  v_other_fiscal_year_id uuid;
  v_income_id uuid;
  v_assigned_fiscal_year_id uuid;
begin
  select project.id, project.fiscal_year_id
  into v_project_id, v_project_fiscal_year_id
  from projects project
  order by project.created_at, project.id
  limit 1;

  select fiscal_year.id
  into v_other_fiscal_year_id
  from fiscal_years fiscal_year
  where fiscal_year.id <> v_project_fiscal_year_id
  order by fiscal_year.start_date
  limit 1;

  insert into income_lines (project_id, line_name, amount)
  values (v_project_id, '[PHASE4 TEST - ROLLBACK] legacy income writer', 1)
  returning id, fiscal_year_id into v_income_id, v_assigned_fiscal_year_id;

  if v_assigned_fiscal_year_id is distinct from v_project_fiscal_year_id then
    raise exception 'Legacy income writer did not receive project fiscal year.';
  end if;

  insert into income_lines (project_id, fiscal_year_id, line_name, amount)
  values (
    v_project_id,
    v_other_fiscal_year_id,
    '[PHASE4 TEST - ROLLBACK] conflicting income writer',
    1
  )
  returning id, fiscal_year_id into v_income_id, v_assigned_fiscal_year_id;

  if v_assigned_fiscal_year_id is not null then
    raise exception 'Conflicting income fiscal year was accepted.';
  end if;

  if not exists (
    select 1 from fiscal_year_assignment_conflicts conflict
    where conflict.entity_table = 'income_lines'
      and conflict.entity_id = v_income_id
      and conflict.conflict_type = 'explicit_fiscal_year_mismatch'
      and conflict.status = 'open'
  ) then
    raise exception 'Conflicting income did not create an open conflict.';
  end if;
end;
$$;

rollback;
