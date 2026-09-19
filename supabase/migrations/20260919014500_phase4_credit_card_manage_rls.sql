-- Phase 4 Gate 2: scope Credit Card mutations by transaction fiscal year.

drop policy if exists "pm admin can insert statement months"
  on app_theatre_budget.cc_statement_months;
drop policy if exists "pm admin can update statement months"
  on app_theatre_budget.cc_statement_months;
drop policy if exists "pm admin can delete statement months"
  on app_theatre_budget.cc_statement_months;

create policy cc_statement_months_insert_scoped
on app_theatre_budget.cc_statement_months
for insert to authenticated
with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

create policy cc_statement_months_update_scoped
on app_theatre_budget.cc_statement_months
for update to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
)
with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

create policy cc_statement_months_delete_scoped
on app_theatre_budget.cc_statement_months
for delete to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

drop policy if exists "pm admin can insert statement lines"
  on app_theatre_budget.cc_statement_lines;
drop policy if exists "pm admin can update statement lines"
  on app_theatre_budget.cc_statement_lines;
drop policy if exists "pm admin can delete statement lines"
  on app_theatre_budget.cc_statement_lines;

create policy cc_statement_lines_insert_scoped
on app_theatre_budget.cc_statement_lines
for insert to authenticated
with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    null,
    null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

create policy cc_statement_lines_update_scoped
on app_theatre_budget.cc_statement_lines
for update to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    null,
    null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
)
with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    null,
    null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

create policy cc_statement_lines_delete_scoped
on app_theatre_budget.cc_statement_lines
for delete to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    null,
    null,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

notify pgrst, 'reload schema';
