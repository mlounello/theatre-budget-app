-- Phase 6: configurable Production Management role-assignment -> Theatre Budget
-- project/category Viewer access. The migration is disabled-first.

create table if not exists app_production_management.role_assignment_budget_access (
  id uuid primary key default gen_random_uuid(),
  role_assignment_id uuid not null references app_production_management.role_assignments (id) on delete cascade,
  production_category_id uuid not null references app_theatre_budget.production_categories (id) on delete restrict,
  access_role text not null default 'viewer' check (access_role = 'viewer'),
  active boolean not null default true,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_assignment_id, production_category_id)
);

create index if not exists idx_pm_role_budget_access_assignment
  on app_production_management.role_assignment_budget_access (role_assignment_id, active);

alter table app_production_management.role_assignment_budget_access enable row level security;

drop policy if exists role_budget_access_manage_project_staff
  on app_production_management.role_assignment_budget_access;
create policy role_budget_access_manage_project_staff
on app_production_management.role_assignment_budget_access
for all
to authenticated
using (
  app_production_management.has_app_role(array['admin', 'producer'])
  or exists (
    select 1
    from app_production_management.role_assignments assignment
    where assignment.id = role_assignment_budget_access.role_assignment_id
      and app_production_management.has_project_role(
        assignment.project_id,
        array['project_manager', 'producer']
      )
  )
)
with check (
  app_production_management.has_app_role(array['admin', 'producer'])
  or exists (
    select 1
    from app_production_management.role_assignments assignment
    where assignment.id = role_assignment_budget_access.role_assignment_id
      and app_production_management.has_project_role(
        assignment.project_id,
        array['project_manager', 'producer']
      )
  )
);

grant select, insert, update, delete
  on app_production_management.role_assignment_budget_access to authenticated;
grant select, insert, update, delete
  on app_production_management.role_assignment_budget_access to service_role;

create table if not exists app_theatre_budget.production_team_budget_scopes (
  id uuid primary key default gen_random_uuid(),
  production_team_assignment_id uuid not null
    references app_theatre_budget.production_team_assignments (id) on delete cascade,
  production_category_id uuid not null
    references app_theatre_budget.production_categories (id) on delete restrict,
  derived_access_scope_id uuid
    references app_theatre_budget.user_access_scopes (id) on delete set null,
  source_access_scope_managed boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_team_assignment_id, production_category_id)
);

create index if not exists idx_budget_team_scopes_assignment
  on app_theatre_budget.production_team_budget_scopes (production_team_assignment_id, active);
create index if not exists idx_budget_team_scopes_derived_scope
  on app_theatre_budget.production_team_budget_scopes (derived_access_scope_id)
  where derived_access_scope_id is not null;

alter table app_theatre_budget.production_team_budget_scopes enable row level security;

drop policy if exists production_team_budget_scopes_select_project_access
  on app_theatre_budget.production_team_budget_scopes;
create policy production_team_budget_scopes_select_project_access
on app_theatre_budget.production_team_budget_scopes
for select
to authenticated
using (
  exists (
    select 1
    from app_theatre_budget.production_team_assignments team
    where team.id = production_team_budget_scopes.production_team_assignment_id
      and (
        app_theatre_budget.is_admin_user()
        or app_theatre_budget.is_project_member(team.project_id)
        or app_theatre_budget.has_project_role(
          team.project_id,
          array['admin', 'project_manager']::app_theatre_budget.app_role[]
        )
      )
  )
);

drop policy if exists production_team_budget_scopes_manage_pm_admin
  on app_theatre_budget.production_team_budget_scopes;
create policy production_team_budget_scopes_manage_pm_admin
on app_theatre_budget.production_team_budget_scopes
for all
to authenticated
using (
  exists (
    select 1
    from app_theatre_budget.production_team_assignments team
    where team.id = production_team_budget_scopes.production_team_assignment_id
      and (
        app_theatre_budget.is_admin_user()
        or app_theatre_budget.has_project_role(
          team.project_id,
          array['admin', 'project_manager']::app_theatre_budget.app_role[]
        )
      )
  )
)
with check (
  exists (
    select 1
    from app_theatre_budget.production_team_assignments team
    where team.id = production_team_budget_scopes.production_team_assignment_id
      and (
        app_theatre_budget.is_admin_user()
        or app_theatre_budget.has_project_role(
          team.project_id,
          array['admin', 'project_manager']::app_theatre_budget.app_role[]
        )
      )
  )
);

grant select, insert, update, delete
  on app_theatre_budget.production_team_budget_scopes to authenticated;
grant select, insert, update, delete
  on app_theatre_budget.production_team_budget_scopes to service_role;

insert into app_production_management.integration_controls (integration_key, enabled, detail)
values (
  'role_assignment_budget_viewer',
  false,
  'Disabled-first Phase 6 control for explicit per-assignment project/category Viewer scopes.'
)
on conflict (integration_key) do nothing;

-- Preserve the one existing Phase 5A example as an explicit Lighting selection.
-- This does not create an Auth account, send email, or create a Viewer scope.
insert into app_production_management.role_assignment_budget_access (
  role_assignment_id,
  production_category_id,
  access_role,
  active
)
select distinct
  assignment.id,
  category.id,
  'viewer',
  true
from app_theatre_budget.production_team_assignments team
join app_production_management.role_assignments assignment
  on assignment.id = team.source_assignment_id
join app_production_management.project_roles role
  on role.id = assignment.role_id
join app_theatre_budget.production_categories category
  on lower(trim(category.name)) = 'lighting'
where team.source_app = 'production_management'
  and team.active
  and regexp_replace(lower(trim(role.name)), '[^a-z0-9]+', ' ', 'g') = 'lighting designer'
on conflict (role_assignment_id, production_category_id)
do update set active = true, access_role = 'viewer', updated_at = now();

create or replace function app_production_management.reconcile_role_assignment_budget_access(
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
  team_record record;
  selection_record record;
  child_record record;
  budget_project_id uuid;
  budget_user_id uuid;
  team_id uuid;
  scope_id uuid;
  scope_was_active boolean := false;
  scope_managed boolean := false;
  active_assignment boolean := false;
  selected_count integer := 0;
  reconciled_count integer := 0;
  stale_count integer := 0;
begin
  select control.enabled into feature_enabled
  from app_production_management.integration_controls control
  where control.integration_key = 'role_assignment_budget_viewer';

  if not coalesce(feature_enabled, false) then
    return jsonb_build_object('status', 'disabled', 'assignment_id', target_assignment_id);
  end if;

  select
    assignment.id,
    assignment.project_id,
    assignment.person_id,
    assignment.status,
    role.name as role_name,
    role.department as role_department,
    person.full_name,
    person.email
  into assignment_record
  from app_production_management.role_assignments assignment
  join app_production_management.project_roles role on role.id = assignment.role_id
  join app_production_management.people person on person.id = assignment.person_id
  where assignment.id = target_assignment_id;

  select * into team_record
  from app_theatre_budget.production_team_assignments team
  where team.source_app = 'production_management'
    and team.source_assignment_id = target_assignment_id
  limit 1;

  select count(*) into selected_count
  from app_production_management.role_assignment_budget_access selection
  join app_theatre_budget.production_categories category
    on category.id = selection.production_category_id
  where selection.role_assignment_id = target_assignment_id
    and selection.active
    and selection.access_role = 'viewer'
    and category.active;

  active_assignment := assignment_record.id is not null
    and assignment_record.status not in ('declined', 'withdrawn')
    and selected_count > 0;

  select link.external_id::uuid into budget_project_id
  from app_production_management.external_links link
  where assignment_record.id is not null
    and link.local_entity_type = 'project'
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
    active_assignment := false;
  end if;

  if not active_assignment then
    if team_record.id is not null then
      update app_theatre_budget.production_team_assignments
      set active = false, updated_at = now()
      where id = team_record.id;

      for child_record in
        select *
        from app_theatre_budget.production_team_budget_scopes child
        where child.production_team_assignment_id = team_record.id
          and child.active
      loop
        update app_theatre_budget.production_team_budget_scopes
        set active = false, updated_at = now()
        where id = child_record.id;

        if child_record.source_access_scope_managed
          and child_record.derived_access_scope_id is not null
          and not exists (
            select 1
            from app_theatre_budget.production_team_budget_scopes other_child
            where other_child.id <> child_record.id
              and other_child.active
              and other_child.derived_access_scope_id = child_record.derived_access_scope_id
          ) then
          update app_theatre_budget.user_access_scopes
          set active = false
          where id = child_record.derived_access_scope_id;
        end if;
      end loop;
    end if;

    return jsonb_build_object(
      'status', case
        when assignment_record.id is null then 'removed'
        when selected_count = 0 then 'no_access_selected'
        when budget_project_id is null then 'missing_budget_project_link'
        else 'inactive_assignment'
      end,
      'assignment_id', target_assignment_id
    );
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
  end if;

  -- Retire only the project-wide scope created by the Phase 5A compatibility
  -- bridge. Manually-created or shared scopes are deliberately left alone.
  if team_record.id is not null
    and team_record.source_access_scope_managed
    and team_record.derived_access_scope_id is not null
    and not exists (
      select 1
      from app_theatre_budget.production_team_assignments other_team
      where other_team.id <> team_record.id
        and other_team.active
        and other_team.derived_access_scope_id = team_record.derived_access_scope_id
    ) then
    update app_theatre_budget.user_access_scopes
    set active = false
    where id = team_record.derived_access_scope_id;
  end if;

  insert into app_theatre_budget.production_team_assignments (
    project_id,
    user_id,
    profile_name,
    profile_email,
    production_role,
    production_category_id,
    budget_access_role,
    derived_access_scope_id,
    active,
    source_app,
    source_project_id,
    source_assignment_id,
    source_person_id,
    source_access_scope_managed,
    updated_at
  ) values (
    budget_project_id,
    budget_user_id,
    assignment_record.full_name,
    nullif(lower(trim(coalesce(assignment_record.email, ''))), ''),
    assignment_record.role_name,
    null,
    'viewer',
    null,
    true,
    'production_management',
    assignment_record.project_id,
    target_assignment_id,
    assignment_record.person_id,
    false,
    now()
  )
  on conflict (source_app, source_assignment_id)
    where source_app is not null and source_assignment_id is not null
  do update set
    project_id = excluded.project_id,
    user_id = excluded.user_id,
    profile_name = excluded.profile_name,
    profile_email = excluded.profile_email,
    production_role = excluded.production_role,
    production_category_id = null,
    budget_access_role = 'viewer',
    derived_access_scope_id = null,
    active = true,
    source_project_id = excluded.source_project_id,
    source_person_id = excluded.source_person_id,
    source_access_scope_managed = false,
    updated_at = now()
  returning id into team_id;

  for selection_record in
    select selection.production_category_id, category.name
    from app_production_management.role_assignment_budget_access selection
    join app_theatre_budget.production_categories category
      on category.id = selection.production_category_id
    where selection.role_assignment_id = target_assignment_id
      and selection.active
      and selection.access_role = 'viewer'
      and category.active
    order by category.sort_order, category.name
  loop
    scope_id := null;
    scope_was_active := false;
    scope_managed := false;

    if budget_user_id is not null then
      select scope.id, scope.active into scope_id, scope_was_active
      from app_theatre_budget.user_access_scopes scope
      where scope.user_id = budget_user_id
        and scope.scope_role = 'viewer'
        and scope.project_id = budget_project_id
        and scope.production_category_id = selection_record.production_category_id
        and scope.fiscal_year_id is null
        and scope.organization_id is null
      order by scope.created_at
      limit 1;

      if scope_id is null then
        insert into app_theatre_budget.user_access_scopes (
          user_id,
          scope_role,
          project_id,
          production_category_id,
          fiscal_year_id,
          organization_id,
          active
        ) values (
          budget_user_id,
          'viewer',
          budget_project_id,
          selection_record.production_category_id,
          null,
          null,
          true
        ) returning id into scope_id;
        scope_managed := true;
      else
        update app_theatre_budget.user_access_scopes set active = true where id = scope_id;
        -- An already-active manual scope remains manual. If this bridge
        -- reactivates an inactive scope, it owns only that activation and will
        -- return the same row to inactive when the selection is removed.
        scope_managed := not scope_was_active;
      end if;
    end if;

    insert into app_theatre_budget.production_team_budget_scopes (
      production_team_assignment_id,
      production_category_id,
      derived_access_scope_id,
      source_access_scope_managed,
      active,
      updated_at
    ) values (
      team_id,
      selection_record.production_category_id,
      scope_id,
      scope_managed,
      true,
      now()
    )
    on conflict (production_team_assignment_id, production_category_id)
    do update set
      derived_access_scope_id = excluded.derived_access_scope_id,
      source_access_scope_managed = case
        when app_theatre_budget.production_team_budget_scopes.derived_access_scope_id
          is not distinct from excluded.derived_access_scope_id
        then app_theatre_budget.production_team_budget_scopes.source_access_scope_managed
          or excluded.source_access_scope_managed
        else excluded.source_access_scope_managed
      end,
      active = true,
      updated_at = now();

    reconciled_count := reconciled_count + 1;
  end loop;

  for child_record in
    select child.*
    from app_theatre_budget.production_team_budget_scopes child
    where child.production_team_assignment_id = team_id
      and child.active
      and not exists (
        select 1
        from app_production_management.role_assignment_budget_access selection
        join app_theatre_budget.production_categories category
          on category.id = selection.production_category_id
        where selection.role_assignment_id = target_assignment_id
          and selection.production_category_id = child.production_category_id
          and selection.active
          and selection.access_role = 'viewer'
          and category.active
      )
  loop
    update app_theatre_budget.production_team_budget_scopes
    set active = false, updated_at = now()
    where id = child_record.id;

    if child_record.source_access_scope_managed
      and child_record.derived_access_scope_id is not null
      and not exists (
        select 1
        from app_theatre_budget.production_team_budget_scopes other_child
        where other_child.id <> child_record.id
          and other_child.active
          and other_child.derived_access_scope_id = child_record.derived_access_scope_id
      ) then
      update app_theatre_budget.user_access_scopes
      set active = false
      where id = child_record.derived_access_scope_id;
    end if;
    stale_count := stale_count + 1;
  end loop;

  insert into app_production_management.integration_reconciliation_log (
    integration_key,
    source_entity_id,
    target_entity_id,
    status,
    detail,
    metadata
  ) values (
    'role_assignment_budget_viewer',
    target_assignment_id,
    assignment_record.person_id,
    'updated',
    case when budget_user_id is null
      then 'Budget category selections recorded; Viewer scopes await the matching magic-link/Google account.'
      else 'Project/category Theatre Budget Viewer scopes reconciled.'
    end,
    jsonb_build_object(
      'pm_project_id', assignment_record.project_id,
      'budget_project_id', budget_project_id,
      'account_linked', budget_user_id is not null,
      'selected_count', selected_count,
      'reconciled_count', reconciled_count,
      'deactivated_count', stale_count
    )
  );

  return jsonb_build_object(
    'status', case when budget_user_id is null then 'pending_account' else 'granted' end,
    'assignment_id', target_assignment_id,
    'budget_project_id', budget_project_id,
    'user_id', budget_user_id,
    'selected_count', selected_count,
    'reconciled_count', reconciled_count,
    'deactivated_count', stale_count
  );
end;
$$;

create or replace function app_production_management.reconcile_all_role_assignment_budget_access()
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
    result := app_production_management.reconcile_role_assignment_budget_access(assignment_id);
    processed := processed + 1;
    if result ->> 'status' in ('missing_budget_project_link', 'failed') then
      attention := attention + 1;
    end if;
  end loop;
  return jsonb_build_object('processed', processed, 'attention', attention);
end;
$$;

create or replace function app_production_management.configure_role_assignment_budget_access(
  target_assignment_id uuid,
  target_category_ids uuid[],
  actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  requested_ids uuid[] := coalesce(target_category_ids, array[]::uuid[]);
  requested_id uuid;
  assignment_project_id uuid;
  caller_user_id uuid := auth.uid();
  invalid_count integer := 0;
  result jsonb;
begin
  select assignment.project_id into assignment_project_id
  from app_production_management.role_assignments assignment
  where assignment.id = target_assignment_id;

  if assignment_project_id is null then
    raise exception 'Role assignment not found.';
  end if;

  if caller_user_id is null
    or (actor_user_id is not null and actor_user_id is distinct from caller_user_id)
    or not (
      app_production_management.has_app_role(array['admin', 'producer'])
      or app_production_management.has_project_role(
        assignment_project_id,
        array['project_manager', 'producer']
      )
    ) then
    raise exception 'You are not authorized to manage Budget access for this project.'
      using errcode = '42501';
  end if;

  select count(*) into invalid_count
  from unnest(requested_ids) requested(id)
  left join app_theatre_budget.production_categories category
    on category.id = requested.id and category.active
  where category.id is null;

  if invalid_count > 0 then
    raise exception 'One or more selected Budget departments are invalid or inactive.';
  end if;

  update app_production_management.role_assignment_budget_access
  set active = false,
      updated_by_user_id = caller_user_id,
      updated_at = now()
  where role_assignment_id = target_assignment_id
    and active
    and not (production_category_id = any(requested_ids));

  foreach requested_id in array requested_ids
  loop
    insert into app_production_management.role_assignment_budget_access (
      role_assignment_id,
      production_category_id,
      access_role,
      active,
      created_by_user_id,
      updated_by_user_id
    ) values (
      target_assignment_id,
      requested_id,
      'viewer',
      true,
      caller_user_id,
      caller_user_id
    )
    on conflict (role_assignment_id, production_category_id)
    do update set
      access_role = 'viewer',
      active = true,
      updated_by_user_id = caller_user_id,
      updated_at = now();
  end loop;

  result := app_production_management.reconcile_role_assignment_budget_access(target_assignment_id);
  return result || jsonb_build_object('configured_count', cardinality(requested_ids));
end;
$$;

create or replace function app_production_management.trigger_role_assignment_budget_access()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
begin
  perform app_production_management.reconcile_role_assignment_budget_access(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

create or replace function app_production_management.trigger_budget_access_selection_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
begin
  perform app_production_management.reconcile_role_assignment_budget_access(
    coalesce(new.role_assignment_id, old.role_assignment_id)
  );
  return coalesce(new, old);
end;
$$;

create or replace function app_production_management.trigger_role_budget_project_link_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  pm_project_id uuid;
  assignment_id uuid;
  entity_type text;
  external_app_name text;
  external_schema_name text;
  external_table_name text;
begin
  pm_project_id := coalesce(new.local_entity_id, old.local_entity_id);
  entity_type := coalesce(new.local_entity_type, old.local_entity_type);
  external_app_name := coalesce(new.external_app, old.external_app);
  external_schema_name := coalesce(new.external_schema, old.external_schema);
  external_table_name := coalesce(new.external_table, old.external_table);

  if entity_type <> 'project'
    or external_app_name <> 'theatre_budget'
    or external_schema_name <> 'app_theatre_budget'
    or external_table_name <> 'projects' then
    return coalesce(new, old);
  end if;

  for assignment_id in
    select id from app_production_management.role_assignments where project_id = pm_project_id
  loop
    perform app_production_management.reconcile_role_assignment_budget_access(assignment_id);
  end loop;
  return coalesce(new, old);
end;
$$;

-- Keep the Phase 5A compatibility triggers installed while this new control
-- remains disabled. During activation, the old control is disabled in the same
-- transaction that enables this one, so there is no access-maintenance gap.

drop trigger if exists phase6_role_assignment_budget_access
  on app_production_management.role_assignments;
create trigger phase6_role_assignment_budget_access
after insert or update of project_id, role_id, person_id, status or delete
on app_production_management.role_assignments
for each row execute function app_production_management.trigger_role_assignment_budget_access();

drop trigger if exists phase6_budget_access_selection_reconciliation
  on app_production_management.role_assignment_budget_access;
create trigger phase6_budget_access_selection_reconciliation
after insert or update or delete
on app_production_management.role_assignment_budget_access
for each row execute function app_production_management.trigger_budget_access_selection_reconciliation();

drop trigger if exists phase6_budget_project_link_reconciliation
  on app_production_management.external_links;
create trigger phase6_budget_project_link_reconciliation
after insert or update or delete
on app_production_management.external_links
for each row execute function app_production_management.trigger_role_budget_project_link_reconciliation();

alter table app_production_management.role_assignment_budget_access owner to postgres;
alter table app_theatre_budget.production_team_budget_scopes owner to postgres;
alter function app_production_management.reconcile_role_assignment_budget_access(uuid) owner to postgres;
alter function app_production_management.reconcile_all_role_assignment_budget_access() owner to postgres;
alter function app_production_management.configure_role_assignment_budget_access(uuid, uuid[], uuid) owner to postgres;
alter function app_production_management.trigger_role_assignment_budget_access() owner to postgres;
alter function app_production_management.trigger_budget_access_selection_reconciliation() owner to postgres;
alter function app_production_management.trigger_role_budget_project_link_reconciliation() owner to postgres;

revoke all on function app_production_management.reconcile_role_assignment_budget_access(uuid)
  from public, anon, authenticated;
revoke all on function app_production_management.reconcile_all_role_assignment_budget_access()
  from public, anon, authenticated;
revoke all on function app_production_management.configure_role_assignment_budget_access(uuid, uuid[], uuid)
  from public, anon, authenticated;
revoke all on function app_production_management.trigger_role_assignment_budget_access()
  from public, anon, authenticated;
revoke all on function app_production_management.trigger_budget_access_selection_reconciliation()
  from public, anon, authenticated;
revoke all on function app_production_management.trigger_role_budget_project_link_reconciliation()
  from public, anon, authenticated;

grant execute on function app_production_management.reconcile_role_assignment_budget_access(uuid)
  to service_role;
grant execute on function app_production_management.reconcile_all_role_assignment_budget_access()
  to service_role;
grant execute on function app_production_management.configure_role_assignment_budget_access(uuid, uuid[], uuid)
  to authenticated;
