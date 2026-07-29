begin;

create table app_theatre_budget.admin_impersonation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references app_theatre_budget.users (id) on delete restrict,
  target_user_id uuid not null references app_theatre_budget.users (id) on delete restrict,
  event_type text not null check (event_type in ('started', 'exited', 'expired')),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_admin_impersonation_audit_actor
  on app_theatre_budget.admin_impersonation_audit (actor_user_id, created_at desc);
create index idx_admin_impersonation_audit_target
  on app_theatre_budget.admin_impersonation_audit (target_user_id, created_at desc);

alter table app_theatre_budget.admin_impersonation_audit enable row level security;

create policy admin_impersonation_audit_admin_read
on app_theatre_budget.admin_impersonation_audit
for select to authenticated
using (app_theatre_budget.is_admin_user());

create policy admin_impersonation_audit_admin_insert
on app_theatre_budget.admin_impersonation_audit
for insert to authenticated
with check (
  app_theatre_budget.is_admin_user()
  and actor_user_id = auth.uid()
);

grant select, insert on app_theatre_budget.admin_impersonation_audit to authenticated;

notify pgrst, 'reload schema';

commit;
