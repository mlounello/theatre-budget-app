begin;

create table if not exists app_production_management.integration_controls (
  integration_key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  detail text not null default ''
);

insert into app_production_management.integration_controls (integration_key, enabled, detail)
values (
  'lighting_designer_budget_viewer',
  false,
  'Requires an explicit Production Management project to Theatre Budget project link.'
)
on conflict (integration_key) do nothing;

alter table app_production_management.integration_controls enable row level security;
revoke all on app_production_management.integration_controls from public, anon, authenticated;
grant select, update on app_production_management.integration_controls to service_role;

alter table app_theatre_budget.production_team_assignments
  add column if not exists source_app text,
  add column if not exists source_project_id uuid,
  add column if not exists source_assignment_id uuid,
  add column if not exists source_person_id uuid,
  add column if not exists source_access_scope_managed boolean not null default false;

create unique index if not exists uq_budget_team_source_assignment
  on app_theatre_budget.production_team_assignments (source_app, source_assignment_id)
  where source_app is not null and source_assignment_id is not null;

create or replace function app_production_management.reconcile_lighting_designer_budget_access(
  target_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, auth, public
as $$
declare
  feature_enabled boolean := false;
  assignment_record record;
  existing_team_record record;
  budget_project_id uuid;
  budget_user_id uuid;
  scope_id uuid;
  scope_was_active boolean := false;
  scope_managed boolean := false;
  assignment_active boolean := false;
  normalized_role text := '';
begin
  select control.enabled into feature_enabled
  from app_production_management.integration_controls control
  where control.integration_key = 'lighting_designer_budget_viewer';

  if not coalesce(feature_enabled, false) then
    return jsonb_build_object('status', 'disabled', 'assignment_id', target_assignment_id);
  end if;

  select
    assignment.id,
    assignment.project_id,
    assignment.person_id,
    assignment.status,
    role.name as role_name,
    person.full_name,
    person.email
  into assignment_record
  from app_production_management.role_assignments assignment
  join app_production_management.project_roles role on role.id = assignment.role_id
  join app_production_management.people person on person.id = assignment.person_id
  where assignment.id = target_assignment_id;

  select * into existing_team_record
  from app_theatre_budget.production_team_assignments team
  where team.source_app = 'production_management'
    and team.source_assignment_id = target_assignment_id
  limit 1;

  if assignment_record.id is not null then
    normalized_role := regexp_replace(lower(trim(assignment_record.role_name)), '[^a-z0-9]+', ' ', 'g');
    assignment_active := assignment_record.status not in ('declined', 'withdrawn')
      and normalized_role = 'lighting designer';
  end if;

  if not assignment_active then
    if existing_team_record.id is not null then
      update app_theatre_budget.production_team_assignments
      set active = false, updated_at = now()
      where id = existing_team_record.id;

      if existing_team_record.source_access_scope_managed
        and existing_team_record.derived_access_scope_id is not null
        and not exists (
          select 1
          from app_theatre_budget.production_team_assignments other_team
          where other_team.id <> existing_team_record.id
            and other_team.active
            and other_team.derived_access_scope_id = existing_team_record.derived_access_scope_id
        ) then
        update app_theatre_budget.user_access_scopes
        set active = false
        where id = existing_team_record.derived_access_scope_id;
      end if;
    end if;

    return jsonb_build_object('status', 'disabled', 'assignment_id', target_assignment_id, 'reason', 'not_active_lighting_designer');
  end if;

  select link.external_id::uuid into budget_project_id
  from app_production_management.external_links link
  where link.local_entity_type = 'project'
    and link.local_entity_id = assignment_record.project_id
    and link.external_app = 'theatre_budget'
    and link.external_schema = 'app_theatre_budget'
    and link.external_table = 'projects'
    and link.sync_status <> 'disabled'
  order by link.created_at desc
  limit 1;

  if budget_project_id is null or not exists (
    select 1 from app_theatre_budget.projects project where project.id = budget_project_id
  ) then
    if existing_team_record.id is not null then
      update app_theatre_budget.production_team_assignments set active = false, updated_at = now()
      where id = existing_team_record.id;
      if existing_team_record.source_access_scope_managed and existing_team_record.derived_access_scope_id is not null then
        update app_theatre_budget.user_access_scopes set active = false
        where id = existing_team_record.derived_access_scope_id;
      end if;
    end if;

    insert into app_production_management.integration_reconciliation_log (
      integration_key, source_entity_id, target_entity_id, status, detail
    ) values (
      'lighting_designer_budget_viewer', target_assignment_id, assignment_record.person_id,
      'not_ready', 'No explicit Theatre Budget project link exists; no access was granted.'
    );
    return jsonb_build_object('status', 'not_ready', 'reason', 'missing_budget_project_link');
  end if;

  if nullif(trim(coalesce(assignment_record.email, '')), '') is not null then
    select auth_user.id into budget_user_id
    from auth.users auth_user
    where lower(auth_user.email) = lower(trim(assignment_record.email))
      and auth_user.deleted_at is null
    order by auth_user.created_at
    limit 1;
  end if;

  if budget_user_id is not null then
    insert into app_theatre_budget.users (id, full_name)
    values (budget_user_id, assignment_record.full_name)
    on conflict (id) do update set
      full_name = case
        when nullif(trim(coalesce(app_theatre_budget.users.full_name, '')), '') is null then excluded.full_name
        else app_theatre_budget.users.full_name
      end;

    select access_scope.id, access_scope.active into scope_id, scope_was_active
    from app_theatre_budget.user_access_scopes access_scope
    where access_scope.user_id = budget_user_id
      and access_scope.scope_role = 'viewer'
      and access_scope.project_id = budget_project_id
      and access_scope.fiscal_year_id is null
      and access_scope.organization_id is null
      and access_scope.production_category_id is null
    order by access_scope.created_at
    limit 1;

    if scope_id is null then
      insert into app_theatre_budget.user_access_scopes (
        user_id, scope_role, project_id, fiscal_year_id, organization_id,
        production_category_id, active
      ) values (
        budget_user_id, 'viewer', budget_project_id, null, null, null, true
      ) returning id into scope_id;
      scope_managed := true;
    else
      update app_theatre_budget.user_access_scopes set active = true where id = scope_id;
      scope_managed := not scope_was_active;
    end if;
  end if;

  if existing_team_record.id is not null
    and existing_team_record.derived_access_scope_id is not null
    and existing_team_record.derived_access_scope_id is distinct from scope_id
    and existing_team_record.source_access_scope_managed then
    update app_theatre_budget.user_access_scopes set active = false
    where id = existing_team_record.derived_access_scope_id;
  end if;

  insert into app_theatre_budget.production_team_assignments (
    project_id, user_id, profile_name, profile_email, production_role,
    budget_access_role, derived_access_scope_id, active,
    source_app, source_project_id, source_assignment_id, source_person_id,
    source_access_scope_managed, updated_at
  ) values (
    budget_project_id, budget_user_id, assignment_record.full_name,
    nullif(lower(trim(coalesce(assignment_record.email, ''))), ''),
    assignment_record.role_name, 'viewer', scope_id, true,
    'production_management', assignment_record.project_id, target_assignment_id,
    assignment_record.person_id, scope_managed, now()
  )
  on conflict (source_app, source_assignment_id)
    where source_app is not null and source_assignment_id is not null
  do update set
    project_id = excluded.project_id,
    user_id = excluded.user_id,
    profile_name = excluded.profile_name,
    profile_email = excluded.profile_email,
    production_role = excluded.production_role,
    budget_access_role = 'viewer',
    derived_access_scope_id = excluded.derived_access_scope_id,
    active = true,
    source_project_id = excluded.source_project_id,
    source_person_id = excluded.source_person_id,
    source_access_scope_managed = excluded.source_access_scope_managed,
    updated_at = now();

  insert into app_production_management.integration_reconciliation_log (
    integration_key, source_entity_id, target_entity_id, status, detail, metadata
  ) values (
    'lighting_designer_budget_viewer', target_assignment_id, assignment_record.person_id,
    'updated',
    case when budget_user_id is null
      then 'Lighting Designer assignment recorded; Budget access awaits the matching magic-link/Google account.'
      else 'Project-specific Theatre Budget viewer access reconciled.' end,
    jsonb_build_object(
      'pm_project_id', assignment_record.project_id,
      'budget_project_id', budget_project_id,
      'account_linked', budget_user_id is not null,
      'scope_managed', scope_managed
    )
  );

  return jsonb_build_object(
    'status', case when budget_user_id is null then 'pending_account' else 'granted' end,
    'assignment_id', target_assignment_id,
    'budget_project_id', budget_project_id,
    'user_id', budget_user_id,
    'scope_id', scope_id
  );
end;
$$;

create or replace function app_production_management.reconcile_all_lighting_designer_budget_access()
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  assignment_id uuid;
  result jsonb;
  processed integer := 0;
  attention integer := 0;
begin
  for assignment_id in
    select id from app_production_management.role_assignments
    union
    select source_assignment_id
    from app_theatre_budget.production_team_assignments
    where source_app = 'production_management' and source_assignment_id is not null
  loop
    result := app_production_management.reconcile_lighting_designer_budget_access(assignment_id);
    processed := processed + 1;
    if result ->> 'status' in ('not_ready', 'failed') then attention := attention + 1; end if;
  end loop;
  return jsonb_build_object('processed', processed, 'attention', attention);
end;
$$;

create or replace function app_production_management.trigger_lighting_designer_budget_access()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
begin
  perform app_production_management.reconcile_lighting_designer_budget_access(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists phase5a_lighting_designer_budget_access on app_production_management.role_assignments;
create trigger phase5a_lighting_designer_budget_access
after insert or update of project_id, role_id, person_id, status or delete
on app_production_management.role_assignments
for each row execute function app_production_management.trigger_lighting_designer_budget_access();

create or replace function app_production_management.trigger_project_budget_access_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  pm_project_id uuid;
  link_entity_type text;
  link_external_app text;
  link_external_schema text;
  link_external_table text;
  assignment_id uuid;
begin
  if tg_op = 'DELETE' then
    pm_project_id := old.local_entity_id;
    link_entity_type := old.local_entity_type;
    link_external_app := old.external_app;
    link_external_schema := old.external_schema;
    link_external_table := old.external_table;
  else
    pm_project_id := new.local_entity_id;
    link_entity_type := new.local_entity_type;
    link_external_app := new.external_app;
    link_external_schema := new.external_schema;
    link_external_table := new.external_table;
  end if;

  if link_entity_type <> 'project'
    or link_external_app <> 'theatre_budget'
    or link_external_schema <> 'app_theatre_budget'
    or link_external_table <> 'projects' then
    return coalesce(new, old);
  end if;

  for assignment_id in
    select id from app_production_management.role_assignments where project_id = pm_project_id
  loop
    perform app_production_management.reconcile_lighting_designer_budget_access(assignment_id);
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists phase5a_budget_project_link_reconciliation on app_production_management.external_links;
create trigger phase5a_budget_project_link_reconciliation
after insert or update or delete on app_production_management.external_links
for each row
execute function app_production_management.trigger_project_budget_access_reconciliation();

alter table app_production_management.integration_controls owner to postgres;
alter function app_production_management.reconcile_lighting_designer_budget_access(uuid) owner to postgres;
alter function app_production_management.reconcile_all_lighting_designer_budget_access() owner to postgres;
alter function app_production_management.trigger_lighting_designer_budget_access() owner to postgres;
alter function app_production_management.trigger_project_budget_access_reconciliation() owner to postgres;

grant usage on schema app_production_management, app_theatre_budget, auth to postgres;
grant select on app_production_management.integration_controls,
  app_production_management.role_assignments,
  app_production_management.project_roles,
  app_production_management.people,
  app_production_management.external_links to postgres;
grant select on auth.users to postgres;
grant select, insert, update on app_theatre_budget.users,
  app_theatre_budget.user_access_scopes,
  app_theatre_budget.production_team_assignments to postgres;
grant select on app_theatre_budget.projects to postgres;
grant insert on app_production_management.integration_reconciliation_log to postgres;

revoke all on function app_production_management.reconcile_lighting_designer_budget_access(uuid) from public, anon, authenticated;
revoke all on function app_production_management.reconcile_all_lighting_designer_budget_access() from public, anon, authenticated;
revoke all on function app_production_management.trigger_lighting_designer_budget_access() from public, anon, authenticated;
revoke all on function app_production_management.trigger_project_budget_access_reconciliation() from public, anon, authenticated;
grant execute on function app_production_management.reconcile_lighting_designer_budget_access(uuid) to service_role;
grant execute on function app_production_management.reconcile_all_lighting_designer_budget_access() to service_role;

commit;
