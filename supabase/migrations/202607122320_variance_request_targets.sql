-- Add explicit target buckets for bulk institutional variances.
-- This preserves the existing single-target variance flow while allowing one
-- variance request/workbook to cover several negative buckets.

create table if not exists app_theatre_budget.variance_request_targets (
  id uuid primary key default gen_random_uuid(),
  variance_request_id uuid not null references app_theatre_budget.variance_requests (id) on delete cascade,
  budget_plan_month_id uuid not null references app_theatre_budget.budget_plan_months (id) on delete restrict,
  organization_id uuid not null references app_theatre_budget.organizations (id) on delete restrict,
  account_code_id uuid not null references app_theatre_budget.account_codes (id) on delete restrict,
  month_start date not null,
  shortage_amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (shortage_amount > 0)
);

create unique index if not exists uq_variance_request_targets_request_bucket
  on app_theatre_budget.variance_request_targets (variance_request_id, budget_plan_month_id);

create index if not exists idx_variance_request_targets_request
  on app_theatre_budget.variance_request_targets (variance_request_id);

create index if not exists idx_variance_request_targets_bucket
  on app_theatre_budget.variance_request_targets (budget_plan_month_id);

alter table app_theatre_budget.variance_request_targets enable row level security;

create or replace function app_theatre_budget.can_manage_variance_request(p_variance_request_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, app_theatre_budget, public
as $$
  select exists (
    select 1
    from app_theatre_budget.variance_requests vr
    left join app_theatre_budget.purchases p
      on p.id = vr.triggering_purchase_id
    where vr.id = p_variance_request_id
      and (
        app_theatre_budget.is_admin_user()
        or (
          p.id is not null
          and app_theatre_budget.has_project_role(
            p.project_id,
            array['admin','project_manager']::app_theatre_budget.app_role[]
          )
        )
        or (
          vr.triggering_purchase_id is null
          and exists (
            select 1
            from app_theatre_budget.user_access_scopes uas
            where uas.user_id = auth.uid()
              and uas.active = true
              and uas.scope_role in ('admin', 'project_manager')
              and (uas.fiscal_year_id is null or uas.fiscal_year_id = vr.fiscal_year_id)
          )
        )
      )
  );
$$;

grant execute on function app_theatre_budget.can_manage_variance_request(uuid) to authenticated;

drop policy if exists variance_targets_select_access on app_theatre_budget.variance_request_targets;
create policy variance_targets_select_access
on app_theatre_budget.variance_request_targets
for select
to authenticated
using (app_theatre_budget.can_view_variance_request(variance_request_targets.variance_request_id));

drop policy if exists variance_targets_manage_pm_admin on app_theatre_budget.variance_request_targets;
create policy variance_targets_manage_pm_admin
on app_theatre_budget.variance_request_targets
for all
to authenticated
using (app_theatre_budget.can_manage_variance_request(variance_request_targets.variance_request_id))
with check (app_theatre_budget.can_manage_variance_request(variance_request_targets.variance_request_id));

drop policy if exists variance_lines_manage_pm_admin on app_theatre_budget.variance_request_lines;
create policy variance_lines_manage_pm_admin
on app_theatre_budget.variance_request_lines
for all
to authenticated
using (app_theatre_budget.can_manage_variance_request(variance_request_lines.variance_request_id))
with check (app_theatre_budget.can_manage_variance_request(variance_request_lines.variance_request_id));

drop policy if exists variance_events_insert_pm_admin on app_theatre_budget.variance_events;
create policy variance_events_insert_pm_admin
on app_theatre_budget.variance_events
for insert
to authenticated
with check (app_theatre_budget.can_manage_variance_request(variance_events.variance_request_id));

insert into app_theatre_budget.variance_request_targets (
  variance_request_id,
  budget_plan_month_id,
  organization_id,
  account_code_id,
  month_start,
  shortage_amount
)
select
  vr.id,
  a.budget_plan_month_id,
  a.organization_id,
  a.account_code_id,
  a.month_start,
  abs(least(a.official_available_amount, a.projected_available_amount, 0))::numeric(12, 2)
from app_theatre_budget.variance_requests vr
join app_theatre_budget.v_institutional_monthly_budget_availability a
  on a.budget_plan_month_id = vr.target_budget_plan_month_id
where vr.target_budget_plan_month_id is not null
  and abs(least(a.official_available_amount, a.projected_available_amount, 0)) > 0
on conflict (variance_request_id, budget_plan_month_id) do update
set
  organization_id = excluded.organization_id,
  account_code_id = excluded.account_code_id,
  month_start = excluded.month_start,
  shortage_amount = excluded.shortage_amount,
  updated_at = now();

grant select, insert, update, delete on app_theatre_budget.variance_request_targets to authenticated;
