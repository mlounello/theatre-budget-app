-- Phase 4 Gate 3: apply the 26 user-approved date-based FY assignments.
-- No organization references are changed by this migration.

do $$
declare
  v_open_count integer;
  v_invalid_count integer;
begin
  select count(*) into v_open_count
  from app_theatre_budget.fiscal_year_assignment_conflicts
  where status = 'open'
    and entity_table in ('income_lines', 'cc_statement_months');

  if v_open_count <> 26 then
    raise exception 'Expected 26 reviewed conflicts, found %', v_open_count;
  end if;

  select count(*) into v_invalid_count
  from app_theatre_budget.fiscal_year_assignment_conflicts conflict
  where conflict.status = 'open'
    and conflict.entity_table in ('income_lines', 'cc_statement_months')
    and (
      conflict.conflict_type <> 'date_review_required'
      or conflict.proposed_fiscal_year_id is null
    );

  if v_invalid_count <> 0 then
    raise exception 'Found % conflict rows without an approved proposed fiscal year', v_invalid_count;
  end if;
end;
$$;

update app_theatre_budget.income_lines income
set fiscal_year_id = conflict.proposed_fiscal_year_id
from app_theatre_budget.fiscal_year_assignment_conflicts conflict
where conflict.entity_table = 'income_lines'
  and conflict.entity_id = income.id
  and conflict.status = 'open'
  and conflict.conflict_type = 'date_review_required'
  and conflict.proposed_fiscal_year_id is not null;

update app_theatre_budget.cc_statement_months statement
set fiscal_year_id = conflict.proposed_fiscal_year_id
from app_theatre_budget.fiscal_year_assignment_conflicts conflict
where conflict.entity_table = 'cc_statement_months'
  and conflict.entity_id = statement.id
  and conflict.status = 'open'
  and conflict.conflict_type = 'date_review_required'
  and conflict.proposed_fiscal_year_id is not null;

update app_theatre_budget.fiscal_year_assignment_conflicts conflict
set
  status = 'resolved',
  resolution_note = 'Gate 3: user-approved date-based fiscal-year assignment',
  resolved_fiscal_year_id = conflict.proposed_fiscal_year_id,
  updated_at = now()
where conflict.entity_table in ('income_lines', 'cc_statement_months')
  and conflict.status in ('open', 'auto_resolved')
  and conflict.conflict_type = 'date_review_required'
  and conflict.proposed_fiscal_year_id is not null;

do $$
begin
  if exists (
    select 1
    from app_theatre_budget.purchases
    where fiscal_year_id is null
  ) or exists (
    select 1
    from app_theatre_budget.income_lines
    where fiscal_year_id is null
  ) or exists (
    select 1
    from app_theatre_budget.cc_statement_months
    where fiscal_year_id is null
  ) or exists (
    select 1
    from app_theatre_budget.cc_statement_lines
    where fiscal_year_id is null
  ) then
    raise exception 'Transaction fiscal-year resolution remains incomplete';
  end if;
end;
$$;

notify pgrst, 'reload schema';
