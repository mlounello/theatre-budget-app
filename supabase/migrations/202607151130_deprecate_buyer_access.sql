-- Retire buyer access for the current workflow.
-- Keep the enum value for backward compatibility, but normalize existing
-- assignment rows to viewer so the app has one production-user access level.

delete from app_theatre_budget.user_access_scopes buyer_scope
where buyer_scope.scope_role = 'buyer'::app_theatre_budget.app_role
  and exists (
    select 1
    from app_theatre_budget.user_access_scopes viewer_scope
    where viewer_scope.user_id = buyer_scope.user_id
      and viewer_scope.scope_role = 'viewer'::app_theatre_budget.app_role
      and coalesce(viewer_scope.fiscal_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(buyer_scope.fiscal_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(viewer_scope.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(buyer_scope.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(viewer_scope.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(buyer_scope.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(viewer_scope.production_category_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(buyer_scope.production_category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

update app_theatre_budget.user_access_scopes
set scope_role = 'viewer'::app_theatre_budget.app_role
where scope_role = 'buyer'::app_theatre_budget.app_role;

update app_theatre_budget.project_memberships
set role = 'viewer'::app_theatre_budget.app_role
where role = 'buyer'::app_theatre_budget.app_role;

update app_theatre_budget.production_team_assignments
set
  budget_access_role = 'viewer',
  updated_at = now()
where budget_access_role = 'buyer';
