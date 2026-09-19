-- Phase 4 Gate 2: additive fiscal-year and organization ownership for Credit Cards.
-- Existing project-only reads and the required project_budget_line_id remain unchanged.

alter table app_theatre_budget.cc_statement_months
  add column if not exists fiscal_year_id uuid null
    references app_theatre_budget.fiscal_years(id) on delete restrict,
  add column if not exists organization_id uuid null
    references app_theatre_budget.organizations(id) on delete restrict;

alter table app_theatre_budget.cc_statement_lines
  add column if not exists fiscal_year_id uuid null
    references app_theatre_budget.fiscal_years(id) on delete restrict,
  add column if not exists organization_id uuid null
    references app_theatre_budget.organizations(id) on delete restrict,
  add column if not exists banner_account_code_id uuid null
    references app_theatre_budget.account_codes(id) on delete restrict;

create index if not exists idx_cc_statement_months_fiscal_year_id
  on app_theatre_budget.cc_statement_months (fiscal_year_id);
create index if not exists idx_cc_statement_months_organization_id
  on app_theatre_budget.cc_statement_months (organization_id);
create index if not exists idx_cc_statement_lines_fiscal_year_id
  on app_theatre_budget.cc_statement_lines (fiscal_year_id);
create index if not exists idx_cc_statement_lines_organization_id
  on app_theatre_budget.cc_statement_lines (organization_id);
create index if not exists idx_cc_statement_lines_banner_account_code_id
  on app_theatre_budget.cc_statement_lines (banner_account_code_id);

create or replace function app_theatre_budget.assign_cc_statement_month_fiscal_year()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
declare
  v_project_fiscal_year_id uuid;
  v_project_organization_id uuid;
  v_organization_fiscal_year_id uuid;
  v_explicit_fiscal_year_id uuid := new.fiscal_year_id;
  v_resolved_fiscal_year_id uuid;
begin
  if new.project_id is not null then
    select project.fiscal_year_id, project.organization_id
    into v_project_fiscal_year_id, v_project_organization_id
    from app_theatre_budget.projects project
    where project.id = new.project_id;
  end if;

  new.organization_id := coalesce(new.organization_id, v_project_organization_id);

  if new.organization_id is not null then
    select organization.fiscal_year_id
    into v_organization_fiscal_year_id
    from app_theatre_budget.organizations organization
    where organization.id = new.organization_id;
  end if;

  if v_project_fiscal_year_id is not null
     and v_organization_fiscal_year_id is not null
     and v_project_fiscal_year_id <> v_organization_fiscal_year_id then
    new.fiscal_year_id := null;
    perform app_theatre_budget.record_fiscal_year_assignment_conflict(
      'cc_statement_months', new.id, 'project_organization_mismatch',
      v_project_fiscal_year_id, v_organization_fiscal_year_id,
      v_explicit_fiscal_year_id, null,
      jsonb_build_object('operation', tg_op)
    );
    return new;
  end if;

  v_resolved_fiscal_year_id := coalesce(
    v_project_fiscal_year_id,
    v_organization_fiscal_year_id
  );

  if v_explicit_fiscal_year_id is not null
     and v_resolved_fiscal_year_id is not null
     and v_explicit_fiscal_year_id <> v_resolved_fiscal_year_id then
    new.fiscal_year_id := null;
    perform app_theatre_budget.record_fiscal_year_assignment_conflict(
      'cc_statement_months', new.id, 'explicit_fiscal_year_mismatch',
      v_project_fiscal_year_id, v_organization_fiscal_year_id,
      v_explicit_fiscal_year_id, v_resolved_fiscal_year_id,
      jsonb_build_object('operation', tg_op)
    );
    return new;
  end if;

  new.fiscal_year_id := coalesce(
    v_explicit_fiscal_year_id,
    v_resolved_fiscal_year_id
  );

  if new.fiscal_year_id is null then
    perform app_theatre_budget.record_fiscal_year_assignment_conflict(
      'cc_statement_months', new.id, 'unresolved',
      v_project_fiscal_year_id, v_organization_fiscal_year_id,
      v_explicit_fiscal_year_id, null,
      jsonb_build_object('operation', tg_op)
    );
  else
    update app_theatre_budget.fiscal_year_assignment_conflicts
    set status = 'auto_resolved', updated_at = now()
    where entity_table = 'cc_statement_months'
      and entity_id = new.id
      and status = 'open';
  end if;

  return new;
end;
$$;

create or replace function app_theatre_budget.assign_cc_statement_line_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
declare
  v_month_fiscal_year_id uuid;
  v_month_organization_id uuid;
  v_project_fiscal_year_id uuid;
  v_project_organization_id uuid;
  v_account_code_id uuid;
  v_explicit_fiscal_year_id uuid := new.fiscal_year_id;
begin
  select statement.fiscal_year_id, statement.organization_id
  into v_month_fiscal_year_id, v_month_organization_id
  from app_theatre_budget.cc_statement_months statement
  where statement.id = new.statement_month_id;

  if new.project_budget_line_id is not null then
    select project.fiscal_year_id, project.organization_id, budget_line.account_code_id
    into v_project_fiscal_year_id, v_project_organization_id, v_account_code_id
    from app_theatre_budget.project_budget_lines budget_line
    join app_theatre_budget.projects project on project.id = budget_line.project_id
    where budget_line.id = new.project_budget_line_id;
  end if;

  if v_month_fiscal_year_id is not null
     and v_project_fiscal_year_id is not null
     and v_month_fiscal_year_id <> v_project_fiscal_year_id then
    new.fiscal_year_id := null;
    perform app_theatre_budget.record_fiscal_year_assignment_conflict(
      'cc_statement_lines', new.id, 'project_organization_mismatch',
      v_project_fiscal_year_id, null,
      v_explicit_fiscal_year_id, v_month_fiscal_year_id,
      jsonb_build_object('operation', tg_op, 'source', 'statement_month')
    );
    return new;
  end if;

  if v_explicit_fiscal_year_id is not null
     and coalesce(v_project_fiscal_year_id, v_month_fiscal_year_id) is not null
     and v_explicit_fiscal_year_id <> coalesce(v_project_fiscal_year_id, v_month_fiscal_year_id) then
    new.fiscal_year_id := null;
    perform app_theatre_budget.record_fiscal_year_assignment_conflict(
      'cc_statement_lines', new.id, 'explicit_fiscal_year_mismatch',
      v_project_fiscal_year_id, null,
      v_explicit_fiscal_year_id,
      coalesce(v_project_fiscal_year_id, v_month_fiscal_year_id),
      jsonb_build_object('operation', tg_op)
    );
    return new;
  end if;

  new.fiscal_year_id := coalesce(
    v_explicit_fiscal_year_id,
    v_project_fiscal_year_id,
    v_month_fiscal_year_id
  );
  new.organization_id := coalesce(
    new.organization_id,
    v_project_organization_id,
    v_month_organization_id
  );
  new.banner_account_code_id := coalesce(
    new.banner_account_code_id,
    v_account_code_id
  );

  if new.fiscal_year_id is null then
    perform app_theatre_budget.record_fiscal_year_assignment_conflict(
      'cc_statement_lines', new.id, 'unresolved',
      v_project_fiscal_year_id, null,
      v_explicit_fiscal_year_id, v_month_fiscal_year_id,
      jsonb_build_object('operation', tg_op)
    );
  else
    update app_theatre_budget.fiscal_year_assignment_conflicts
    set status = 'auto_resolved', updated_at = now()
    where entity_table = 'cc_statement_lines'
      and entity_id = new.id
      and status = 'open';
  end if;

  return new;
end;
$$;

revoke all on function app_theatre_budget.assign_cc_statement_month_fiscal_year()
  from public, anon;
grant execute on function app_theatre_budget.assign_cc_statement_month_fiscal_year()
  to authenticated;
revoke all on function app_theatre_budget.assign_cc_statement_line_scope()
  from public, anon;
grant execute on function app_theatre_budget.assign_cc_statement_line_scope()
  to authenticated;

drop trigger if exists cc_statement_months_assign_fiscal_year
  on app_theatre_budget.cc_statement_months;
create trigger cc_statement_months_assign_fiscal_year
before insert or update of project_id, organization_id, fiscal_year_id
on app_theatre_budget.cc_statement_months
for each row execute function app_theatre_budget.assign_cc_statement_month_fiscal_year();

drop trigger if exists cc_statement_lines_assign_scope
  on app_theatre_budget.cc_statement_lines;
create trigger cc_statement_lines_assign_scope
before insert or update of statement_month_id, project_budget_line_id,
  fiscal_year_id, organization_id, banner_account_code_id
on app_theatre_budget.cc_statement_lines
for each row execute function app_theatre_budget.assign_cc_statement_line_scope();

-- Existing unscoped statement months remain null and enter the review queue.
insert into app_theatre_budget.fiscal_year_assignment_conflicts (
  entity_table,
  entity_id,
  conflict_type,
  proposed_fiscal_year_id,
  details,
  status
)
select
  'cc_statement_months',
  statement.id,
  'date_review_required',
  proposed_fiscal_year.id,
  jsonb_build_object(
    'statement_month', statement.statement_month,
    'reason', 'No explicit project, organization, or fiscal year on statement month'
  ),
  'open'
from app_theatre_budget.cc_statement_months statement
left join lateral (
  select fiscal_year.id
  from app_theatre_budget.fiscal_years fiscal_year
  where statement.statement_month between fiscal_year.start_date and fiscal_year.end_date
  order by fiscal_year.start_date desc
  limit 1
) proposed_fiscal_year on true
where statement.fiscal_year_id is null
on conflict (entity_table, entity_id) where status = 'open'
do update set
  conflict_type = excluded.conflict_type,
  proposed_fiscal_year_id = excluded.proposed_fiscal_year_id,
  details = excluded.details,
  updated_at = now();

notify pgrst, 'reload schema';
