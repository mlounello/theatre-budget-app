-- Safe rollback for Phase 6. Selections and audit history are retained, while
-- any category scopes created by Phase 6 are deactivated before Phase 5A is
-- restored.

update app_theatre_budget.user_access_scopes scope
set active = false
where scope.active
  and exists (
    select 1
    from app_theatre_budget.production_team_budget_scopes child
    where child.derived_access_scope_id = scope.id
      and child.source_access_scope_managed
  )
  and not exists (
    select 1
    from app_theatre_budget.production_team_assignments team
    where team.active
      and team.derived_access_scope_id = scope.id
  );

update app_theatre_budget.production_team_budget_scopes
set active = false, updated_at = now()
where active;

update app_theatre_budget.production_team_assignments
set active = false, updated_at = now()
where source_app = 'production_management' and active;

update app_production_management.integration_controls
set enabled = false,
    detail = 'Phase 6 role/category Viewer reconciliation disabled by rollback.',
    updated_at = now()
where integration_key = 'role_assignment_budget_viewer';

drop trigger if exists phase6_role_assignment_budget_access
  on app_production_management.role_assignments;
drop trigger if exists phase6_budget_access_selection_reconciliation
  on app_production_management.role_assignment_budget_access;
drop trigger if exists phase6_budget_project_link_reconciliation
  on app_production_management.external_links;

revoke execute on function app_production_management.configure_role_assignment_budget_access(uuid, uuid[], uuid)
  from authenticated;

drop trigger if exists phase5a_lighting_designer_budget_access
  on app_production_management.role_assignments;
create trigger phase5a_lighting_designer_budget_access
after insert or update of project_id, role_id, person_id, status or delete
on app_production_management.role_assignments
for each row execute function app_production_management.trigger_lighting_designer_budget_access();

drop trigger if exists phase5a_budget_project_link_reconciliation
  on app_production_management.external_links;
create trigger phase5a_budget_project_link_reconciliation
after insert or update or delete
on app_production_management.external_links
for each row execute function app_production_management.trigger_project_budget_access_reconciliation();

update app_production_management.integration_controls
set enabled = true,
    detail = 'Phase 5A Lighting Designer compatibility bridge restored by Phase 6 rollback.',
    updated_at = now()
where integration_key = 'lighting_designer_budget_viewer';

select app_production_management.reconcile_all_lighting_designer_budget_access();
