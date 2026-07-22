begin;

update app_production_management.integration_controls
set enabled = false, updated_at = now(), detail = 'Disabled by Phase 5A rollback.'
where integration_key = 'lighting_designer_budget_viewer';

update app_theatre_budget.user_access_scopes scope
set active = false
where scope.id in (
  select team.derived_access_scope_id
  from app_theatre_budget.production_team_assignments team
  where team.source_app = 'production_management'
    and team.source_access_scope_managed
    and team.derived_access_scope_id is not null
);

update app_theatre_budget.production_team_assignments
set active = false, updated_at = now()
where source_app = 'production_management';

drop trigger if exists phase5a_budget_project_link_reconciliation on app_production_management.external_links;
drop trigger if exists phase5a_lighting_designer_budget_access on app_production_management.role_assignments;

drop function if exists app_production_management.trigger_project_budget_access_reconciliation();
drop function if exists app_production_management.trigger_lighting_designer_budget_access();
drop function if exists app_production_management.reconcile_all_lighting_designer_budget_access();
drop function if exists app_production_management.reconcile_lighting_designer_budget_access(uuid);
drop index if exists app_theatre_budget.uq_budget_team_source_assignment;

-- Source columns, control state, reconciliation logs, and inactive assignment
-- rows are retained so rollback never destroys audit or access-history data.

commit;
