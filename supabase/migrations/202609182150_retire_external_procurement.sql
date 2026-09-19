-- Retire the legacy External Procurement placeholder project.
-- The project row is intentionally retained as a hidden historical marker; all
-- purchases are detached and become direct fiscal-year organization purchases.
-- Legacy February-April 2026 rows belong to FY26. September 2026 rows belong
-- to FY27 and are moved from the old global organizations to their FY27 copies.

do $$
declare
  v_fy26_id uuid;
  v_fy27_id uuid;
  v_fy26_events_id uuid;
  v_fy27_events_id uuid;
  v_fy27_theatre_productions_id uuid;
  v_missing_organization integer;
  v_missing_account integer;
  v_wrong_fiscal_year integer;
begin
  select id into v_fy26_id
  from app_theatre_budget.fiscal_years
  where name = 'FY26';

  select id into v_fy27_id
  from app_theatre_budget.fiscal_years
  where name = 'FY27';

  if v_fy26_id is null or v_fy27_id is null then
    raise exception 'External Procurement conversion requires FY26 and FY27.';
  end if;

  insert into app_theatre_budget.organizations (
    fiscal_year_id,
    name,
    org_code,
    sort_order,
    project_tracking_required
  )
  select
    v_fy26_id,
    coalesce(
      (select name from app_theatre_budget.organizations where org_code = 'SJ5000' order by fiscal_year_id nulls first limit 1),
      'University Events'
    ),
    'SJ5000',
    coalesce(
      (select sort_order from app_theatre_budget.organizations where org_code = 'SJ5000' order by fiscal_year_id nulls first limit 1),
      0
    ),
    false
  where not exists (
    select 1
    from app_theatre_budget.organizations
    where fiscal_year_id = v_fy26_id
      and org_code = 'SJ5000'
  );

  select id into v_fy26_events_id
  from app_theatre_budget.organizations
  where fiscal_year_id = v_fy26_id and org_code = 'SJ5000';

  select id into v_fy27_events_id
  from app_theatre_budget.organizations
  where fiscal_year_id = v_fy27_id and org_code = 'SJ5000';

  select id into v_fy27_theatre_productions_id
  from app_theatre_budget.organizations
  where fiscal_year_id = v_fy27_id and org_code = '2AC230';

  if v_fy26_events_id is null or v_fy27_events_id is null or v_fy27_theatre_productions_id is null then
    raise exception 'External Procurement conversion could not resolve its FY26/FY27 organization destinations.';
  end if;

  update app_theatre_budget.purchases p
  set organization_id = v_fy26_events_id
  from app_theatre_budget.projects project
  where project.id = p.project_id
    and lower(trim(project.name)) = 'external procurement'
    and p.organization_id is null
    and p.created_at < '2026-07-01'::timestamptz;

  update app_theatre_budget.purchases p
  set organization_id = case legacy_organization.org_code
    when 'SJ5000' then v_fy27_events_id
    when '2AC230' then v_fy27_theatre_productions_id
    else p.organization_id
  end
  from app_theatre_budget.projects project,
       app_theatre_budget.organizations legacy_organization
  where project.id = p.project_id
    and legacy_organization.id = p.organization_id
    and lower(trim(project.name)) = 'external procurement'
    and legacy_organization.fiscal_year_id is null
    and p.created_at >= '2026-07-01'::timestamptz;

  select
    count(*) filter (where p.organization_id is null),
    count(*) filter (where p.banner_account_code_id is null),
    count(*) filter (where organization.fiscal_year_id is null)
  into v_missing_organization, v_missing_account, v_wrong_fiscal_year
  from app_theatre_budget.purchases p
  join app_theatre_budget.projects project on project.id = p.project_id
  left join app_theatre_budget.organizations organization on organization.id = p.organization_id
  where lower(trim(project.name)) = 'external procurement';

  if v_missing_organization > 0 or v_missing_account > 0 or v_wrong_fiscal_year > 0 then
    raise exception
      'External Procurement conversion blocked: % row(s) lack an organization, % row(s) lack a Banner account code, and % row(s) lack a fiscal-year organization.',
      v_missing_organization,
      v_missing_account,
      v_wrong_fiscal_year;
  end if;

  update app_theatre_budget.organizations organization
  set project_tracking_required = false
  where organization.id in (v_fy26_events_id, v_fy27_events_id);

  delete from app_theatre_budget.purchase_allocations allocation
  where allocation.purchase_id in (
    select p.id
    from app_theatre_budget.purchases p
    join app_theatre_budget.projects project on project.id = p.project_id
    where lower(trim(project.name)) = 'external procurement'
  );

  update app_theatre_budget.purchases p
  set
    project_id = null,
    budget_line_id = null,
    budget_tracked = true
  from app_theatre_budget.projects project
  where project.id = p.project_id
    and lower(trim(project.name)) = 'external procurement';
end;
$$;
