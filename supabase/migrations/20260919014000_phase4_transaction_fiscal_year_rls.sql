-- Phase 4 Gate 2: make transaction fiscal year authoritative in scoped RLS.

create or replace function app_theatre_budget.can_access_financial_scope(
  target_fiscal_year_id uuid,
  target_organization_id uuid,
  target_project_id uuid,
  target_production_category_id uuid,
  allowed_roles app_theatre_budget.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_theatre_budget, core
as $$
  with project_scope as (
    select project.fiscal_year_id, project.organization_id
    from app_theatre_budget.projects project
    where project.id = target_project_id
  ), resolved_scope as (
    select
      coalesce(target_fiscal_year_id, project_scope.fiscal_year_id) as fiscal_year_id,
      coalesce(target_organization_id, project_scope.organization_id) as organization_id
    from (select 1) seed
    left join project_scope on true
  )
  select
    app_theatre_budget.is_admin_user()
    or exists (
      select 1
      from app_theatre_budget.project_memberships membership
      where target_project_id is not null
        and membership.project_id = target_project_id
        and membership.user_id = auth.uid()
        and membership.role = any(allowed_roles)
    )
    or exists (
      select 1
      from app_theatre_budget.user_access_scopes scope
      cross join resolved_scope resolved
      where scope.user_id = auth.uid()
        and scope.active = true
        and scope.scope_role = any(allowed_roles)
        and (scope.fiscal_year_id is null or scope.fiscal_year_id = resolved.fiscal_year_id)
        and (scope.organization_id is null or scope.organization_id = resolved.organization_id)
        and (scope.project_id is null or scope.project_id = target_project_id)
        and (
          scope.production_category_id is null
          or scope.production_category_id = target_production_category_id
        )
        and (
          scope.fiscal_year_id is not null
          or scope.organization_id is not null
          or scope.project_id is not null
          or scope.production_category_id is not null
        )
    );
$$;

revoke all on function app_theatre_budget.can_access_financial_scope(
  uuid, uuid, uuid, uuid, app_theatre_budget.app_role[]
) from public, anon;
grant execute on function app_theatre_budget.can_access_financial_scope(
  uuid, uuid, uuid, uuid, app_theatre_budget.app_role[]
) to authenticated;

create or replace function app_theatre_budget.can_access_organization_purchase(
  target_organization_id uuid,
  allowed_roles app_theatre_budget.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_theatre_budget, core
as $$
  select app_theatre_budget.can_access_financial_scope(
    organization.fiscal_year_id,
    organization.id,
    null,
    null,
    allowed_roles
  )
  from app_theatre_budget.organizations organization
  where organization.id = target_organization_id;
$$;

drop policy if exists core_member_read_purchases on app_theatre_budget.purchases;
drop policy if exists member_read_purchases on app_theatre_budget.purchases;
drop policy if exists purchases_select_member on app_theatre_budget.purchases;
drop policy if exists purchases_select_procurement_tracker_external_org on app_theatre_budget.purchases;
drop policy if exists purchases_insert_buyer_pm_admin on app_theatre_budget.purchases;
drop policy if exists purchases_update_pm_admin on app_theatre_budget.purchases;
drop policy if exists purchases_delete_admin on app_theatre_budget.purchases;

create policy purchases_select_scoped
on app_theatre_budget.purchases
for select to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    production_category_id,
    array['admin','project_manager','buyer','viewer','procurement_tracker']::app_theatre_budget.app_role[]
  )
);

create policy purchases_insert_scoped
on app_theatre_budget.purchases
for insert to authenticated
with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    production_category_id,
    array['admin','project_manager','buyer']::app_theatre_budget.app_role[]
  )
);

create policy purchases_update_scoped
on app_theatre_budget.purchases
for update to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    production_category_id,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
)
with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    production_category_id,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

create policy purchases_delete_scoped
on app_theatre_budget.purchases
for delete to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    production_category_id,
    array['admin']::app_theatre_budget.app_role[]
  )
);

drop policy if exists member_read_income_lines on app_theatre_budget.income_lines;
drop policy if exists "members can read income lines" on app_theatre_budget.income_lines;
drop policy if exists "pm admin can insert income lines" on app_theatre_budget.income_lines;
drop policy if exists "pm admin can update income lines" on app_theatre_budget.income_lines;
drop policy if exists "pm admin can delete income lines" on app_theatre_budget.income_lines;

create policy income_lines_select_scoped
on app_theatre_budget.income_lines
for select to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    production_category_id,
    array['admin','project_manager','buyer','viewer']::app_theatre_budget.app_role[]
  )
);

create policy income_lines_insert_scoped
on app_theatre_budget.income_lines
for insert to authenticated
with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    production_category_id,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

create policy income_lines_update_scoped
on app_theatre_budget.income_lines
for update to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    production_category_id,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
)
with check (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    production_category_id,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

create policy income_lines_delete_scoped
on app_theatre_budget.income_lines
for delete to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    production_category_id,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

drop policy if exists member_read_cc_statement_months on app_theatre_budget.cc_statement_months;
drop policy if exists "members can read statement months" on app_theatre_budget.cc_statement_months;

create policy cc_statement_months_select_scoped
on app_theatre_budget.cc_statement_months
for select to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    project_id,
    null,
    array['admin','project_manager','viewer']::app_theatre_budget.app_role[]
  )
);

drop policy if exists member_read_cc_statement_lines on app_theatre_budget.cc_statement_lines;
drop policy if exists "members can read statement lines" on app_theatre_budget.cc_statement_lines;

create policy cc_statement_lines_select_scoped
on app_theatre_budget.cc_statement_lines
for select to authenticated
using (
  app_theatre_budget.can_access_financial_scope(
    fiscal_year_id,
    organization_id,
    null,
    null,
    array['admin','project_manager','viewer']::app_theatre_budget.app_role[]
  )
);

notify pgrst, 'reload schema';
