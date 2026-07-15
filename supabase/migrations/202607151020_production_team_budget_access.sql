-- Friendly production-team based budget access.
-- This table sits above project_memberships/user_access_scopes and records the
-- human assignment that created the budget visibility.

create table if not exists app_theatre_budget.production_team_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_theatre_budget.projects (id) on delete cascade,
  user_id uuid references app_theatre_budget.users (id) on delete set null,
  profile_name text not null,
  profile_email text,
  production_role text,
  production_category_id uuid references app_theatre_budget.production_categories (id) on delete set null,
  budget_access_role text not null default 'viewer',
  derived_access_scope_id uuid references app_theatre_budget.user_access_scopes (id) on delete set null,
  active boolean not null default true,
  last_invited_at timestamptz,
  created_by_user_id uuid references app_theatre_budget.users (id) on delete set null,
  updated_by_user_id uuid references app_theatre_budget.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (budget_access_role in ('none', 'viewer', 'buyer', 'project_manager'))
);

create index if not exists idx_production_team_assignments_project
  on app_theatre_budget.production_team_assignments (project_id, active);

create index if not exists idx_production_team_assignments_user
  on app_theatre_budget.production_team_assignments (user_id);

create index if not exists idx_production_team_assignments_email
  on app_theatre_budget.production_team_assignments (lower(profile_email));

alter table app_theatre_budget.production_team_assignments enable row level security;

drop policy if exists production_team_assignments_select_project_access
  on app_theatre_budget.production_team_assignments;
create policy production_team_assignments_select_project_access
on app_theatre_budget.production_team_assignments
for select
to authenticated
using (
  app_theatre_budget.is_admin_user()
  or app_theatre_budget.is_project_member(project_id)
  or exists (
    select 1
    from app_theatre_budget.project_memberships pm
    where pm.project_id = production_team_assignments.project_id
      and pm.user_id = auth.uid()
      and pm.role in ('admin', 'project_manager')
  )
);

drop policy if exists production_team_assignments_manage_pm_admin
  on app_theatre_budget.production_team_assignments;
create policy production_team_assignments_manage_pm_admin
on app_theatre_budget.production_team_assignments
for all
to authenticated
using (
  app_theatre_budget.is_admin_user()
  or app_theatre_budget.has_project_role(
    project_id,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
)
with check (
  app_theatre_budget.is_admin_user()
  or app_theatre_budget.has_project_role(
    project_id,
    array['admin','project_manager']::app_theatre_budget.app_role[]
  )
);

grant select, insert, update, delete on app_theatre_budget.production_team_assignments to authenticated;
