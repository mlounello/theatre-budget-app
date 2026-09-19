-- Phase 4 Gate 2: explicit, nullable fiscal year on income.
-- Date-only historical assignments are reported for review, not silently accepted.

alter table app_theatre_budget.income_lines
  add column if not exists fiscal_year_id uuid null
    references app_theatre_budget.fiscal_years(id) on delete restrict;

create index if not exists idx_income_lines_fiscal_year_id
  on app_theatre_budget.income_lines (fiscal_year_id);

create or replace function app_theatre_budget.assign_income_fiscal_year()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
declare
  v_project_fiscal_year_id uuid;
  v_organization_fiscal_year_id uuid;
  v_explicit_fiscal_year_id uuid := new.fiscal_year_id;
  v_resolved_fiscal_year_id uuid;
begin
  if new.project_id is not null then
    select project.fiscal_year_id
    into v_project_fiscal_year_id
    from app_theatre_budget.projects project
    where project.id = new.project_id;
  end if;

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
      'income_lines', new.id, 'project_organization_mismatch',
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
      'income_lines', new.id, 'explicit_fiscal_year_mismatch',
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
      'income_lines', new.id, 'unresolved',
      v_project_fiscal_year_id, v_organization_fiscal_year_id,
      v_explicit_fiscal_year_id, null,
      jsonb_build_object('operation', tg_op)
    );
  else
    update app_theatre_budget.fiscal_year_assignment_conflicts
    set status = 'auto_resolved', updated_at = now()
    where entity_table = 'income_lines'
      and entity_id = new.id
      and status = 'open';
  end if;

  return new;
end;
$$;

revoke all on function app_theatre_budget.assign_income_fiscal_year()
  from public, anon;
grant execute on function app_theatre_budget.assign_income_fiscal_year()
  to authenticated;

drop trigger if exists income_lines_assign_fiscal_year
  on app_theatre_budget.income_lines;
create trigger income_lines_assign_fiscal_year
before insert or update of project_id, organization_id, fiscal_year_id
on app_theatre_budget.income_lines
for each row execute function app_theatre_budget.assign_income_fiscal_year();

-- Backfill only rows with an explicit project or FY-specific organization source.
update app_theatre_budget.income_lines income
set fiscal_year_id = coalesce(
  (select project.fiscal_year_id
   from app_theatre_budget.projects project
   where project.id = income.project_id),
  (select organization.fiscal_year_id
   from app_theatre_budget.organizations organization
   where organization.id = income.organization_id)
)
where income.fiscal_year_id is null
  and coalesce(
    (select project.fiscal_year_id
     from app_theatre_budget.projects project
     where project.id = income.project_id),
    (select organization.fiscal_year_id
     from app_theatre_budget.organizations organization
     where organization.id = income.organization_id)
  ) is not null;

-- Date-only rows remain null and are surfaced for explicit review.
insert into app_theatre_budget.fiscal_year_assignment_conflicts (
  entity_table,
  entity_id,
  conflict_type,
  project_fiscal_year_id,
  organization_fiscal_year_id,
  explicit_fiscal_year_id,
  proposed_fiscal_year_id,
  details,
  status
)
select
  'income_lines',
  income.id,
  'date_review_required',
  null,
  null,
  null,
  proposed_fiscal_year.id,
  jsonb_build_object(
    'received_on', income.received_on,
    'created_at', income.created_at,
    'reason', 'No explicit project or FY-specific organization fiscal year'
  ),
  'open'
from app_theatre_budget.income_lines income
left join lateral (
  select fiscal_year.id
  from app_theatre_budget.fiscal_years fiscal_year
  where coalesce(income.received_on, income.created_at::date)
    between fiscal_year.start_date and fiscal_year.end_date
  order by fiscal_year.start_date desc
  limit 1
) proposed_fiscal_year on true
where income.fiscal_year_id is null
on conflict (entity_table, entity_id) where status = 'open'
do update set
  conflict_type = excluded.conflict_type,
  proposed_fiscal_year_id = excluded.proposed_fiscal_year_id,
  details = excluded.details,
  updated_at = now();

notify pgrst, 'reload schema';
