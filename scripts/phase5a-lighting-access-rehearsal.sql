\set ON_ERROR_STOP on

do $$
begin
  if (select enabled from app_production_management.integration_controls where integration_key = 'lighting_designer_budget_viewer') then
    raise exception 'Lighting Designer integration must be disabled by default after migration.';
  end if;
  if has_function_privilege('authenticated', 'app_production_management.reconcile_lighting_designer_budget_access(uuid)', 'execute') then
    raise exception 'Authenticated unexpectedly has entitlement bridge execution.';
  end if;
  if not has_function_privilege('service_role', 'app_production_management.reconcile_lighting_designer_budget_access(uuid)', 'execute') then
    raise exception 'Service role lacks entitlement bridge execution.';
  end if;
end;
$$;

begin;

do $$
declare
  test_auth_user_id uuid;
  test_email text;
  pm_project_id uuid := gen_random_uuid();
  budget_project_id uuid := gen_random_uuid();
  person_id uuid := gen_random_uuid();
  role_id uuid := gen_random_uuid();
  assignment_id uuid := gen_random_uuid();
  result jsonb;
  team_record record;
  scope_record record;
  app_membership_count integer;
begin
  select auth_user.id, auth_user.email
  into test_auth_user_id, test_email
  from auth.users auth_user
  where nullif(trim(auth_user.email), '') is not null
    and auth_user.deleted_at is null
    and not exists (
      select 1 from core.app_memberships membership
      where membership.user_id = auth_user.id
        and membership.app_id = 'theatre_budget'
        and membership.is_active
    )
  order by auth_user.created_at
  limit 1;

  if test_auth_user_id is null then
    raise exception 'No isolated auth user is available for the Lighting Designer rehearsal.';
  end if;

  insert into app_production_management.projects (id, title, slug, status)
  values (pm_project_id, 'Phase Five Lighting Project', 'phase-five-lighting-project', 'active');

  insert into app_theatre_budget.projects (id, name, status)
  values (budget_project_id, 'Phase Five Lighting Budget', 'active');

  insert into app_production_management.people (id, full_name, email, person_type)
  values (person_id, 'Phase Five Lighting Designer', test_email, 'person');

  insert into app_production_management.project_roles (id, project_id, name, role_group)
  values (role_id, pm_project_id, 'Lighting Designer', 'creative_team');

  insert into app_production_management.role_assignments (
    id, project_id, role_id, person_id, status
  ) values (
    assignment_id, pm_project_id, role_id, person_id, 'accepted'
  );

  insert into app_production_management.external_links (
    local_entity_type, local_entity_id, external_app, external_schema,
    external_table, external_id, sync_direction, sync_status
  ) values (
    'project', pm_project_id, 'theatre_budget', 'app_theatre_budget',
    'projects', budget_project_id::text, 'read_only', 'linked'
  );

  if exists (
    select 1 from app_theatre_budget.production_team_assignments
    where source_app = 'production_management' and source_assignment_id = assignment_id
  ) then
    raise exception 'Disabled control allowed an entitlement write.';
  end if;

  update app_production_management.integration_controls
  set enabled = true, updated_at = now()
  where integration_key = 'lighting_designer_budget_viewer';

  result := app_production_management.reconcile_lighting_designer_budget_access(assignment_id);
  if result ->> 'status' <> 'granted' then
    raise exception 'Expected granted entitlement, got %', result;
  end if;

  select * into team_record
  from app_theatre_budget.production_team_assignments
  where source_app = 'production_management' and source_assignment_id = assignment_id;

  if team_record.project_id <> budget_project_id
    or team_record.user_id <> test_auth_user_id
    or team_record.budget_access_role <> 'viewer'
    or not team_record.active then
    raise exception 'Production-team assignment was not narrowed to the linked project viewer role.';
  end if;

  select * into scope_record
  from app_theatre_budget.user_access_scopes
  where id = team_record.derived_access_scope_id;
  if scope_record.user_id <> test_auth_user_id
    or scope_record.project_id <> budget_project_id
    or scope_record.scope_role <> 'viewer'
    or scope_record.fiscal_year_id is not null
    or scope_record.organization_id is not null
    or scope_record.production_category_id is not null
    or not scope_record.active then
    raise exception 'Derived Budget scope exceeded the linked project viewer boundary.';
  end if;

  select count(*) into app_membership_count
  from core.app_memberships
  where user_id = test_auth_user_id and app_id = 'theatre_budget' and is_active;
  if app_membership_count <> 0 then
    raise exception 'Lighting Designer sync created app-wide Theatre Budget membership.';
  end if;

  update app_production_management.role_assignments
  set status = 'withdrawn'
  where id = assignment_id;

  if (select active from app_theatre_budget.production_team_assignments where id = team_record.id) then
    raise exception 'Withdrawn Lighting Designer retained an active team assignment.';
  end if;
  if (select active from app_theatre_budget.user_access_scopes where id = scope_record.id) then
    raise exception 'Withdrawn Lighting Designer retained an active managed scope.';
  end if;

  update app_production_management.role_assignments
  set status = 'accepted'
  where id = assignment_id;
  if not (select active from app_theatre_budget.user_access_scopes where id = scope_record.id) then
    raise exception 'Reactivated Lighting Designer did not regain the same project scope.';
  end if;

  delete from app_production_management.external_links
  where local_entity_type = 'project'
    and local_entity_id = pm_project_id
    and external_app = 'theatre_budget'
    and external_table = 'projects';

  if (select active from app_theatre_budget.production_team_assignments where id = team_record.id) then
    raise exception 'Unlinked project retained an active integration team assignment.';
  end if;
  if (select active from app_theatre_budget.user_access_scopes where id = scope_record.id) then
    raise exception 'Unlinked project retained active integration-managed Budget access.';
  end if;
end;
$$;

rollback;

select 'phase5a_lighting_access_rehearsal_passed' as result;
