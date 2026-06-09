-- Institutional monthly budget layer.
--
-- This layer sits alongside the existing production/project budget system.
-- Existing project_budget_lines and purchase_allocations remain the source of
-- production/department budget rollups. These tables map purchase allocations
-- to institutional fiscal-year/org/account/month buckets and track variance
-- transfers between monthly institutional buckets.

create schema if not exists app_theatre_budget;

create table if not exists app_theatre_budget.institutional_budget_commitments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references app_theatre_budget.purchases (id) on delete cascade,
  purchase_allocation_id uuid references app_theatre_budget.purchase_allocations (id) on delete set null,
  fiscal_year_id uuid not null references app_theatre_budget.fiscal_years (id) on delete restrict,
  organization_id uuid not null references app_theatre_budget.organizations (id) on delete restrict,
  account_code_id uuid not null references app_theatre_budget.account_codes (id) on delete restrict,
  budget_plan_month_id uuid not null references app_theatre_budget.budget_plan_months (id) on delete restrict,
  order_date date not null,
  committed_amount numeric(12, 2) not null default 0,
  commitment_status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (committed_amount <> 0),
  check (commitment_status in ('submitted', 'adjusted', 'cancelled'))
);

create unique index if not exists uq_institutional_commitments_allocation
  on app_theatre_budget.institutional_budget_commitments (purchase_allocation_id)
  where purchase_allocation_id is not null;

create index if not exists idx_institutional_commitments_purchase
  on app_theatre_budget.institutional_budget_commitments (purchase_id);

create index if not exists idx_institutional_commitments_bucket
  on app_theatre_budget.institutional_budget_commitments (
    fiscal_year_id,
    organization_id,
    account_code_id,
    budget_plan_month_id
  );

create index if not exists idx_institutional_commitments_order_date
  on app_theatre_budget.institutional_budget_commitments (order_date);

create table if not exists app_theatre_budget.variance_requests (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null references app_theatre_budget.fiscal_years (id) on delete restrict,
  triggering_purchase_id uuid references app_theatre_budget.purchases (id) on delete set null,
  target_budget_plan_month_id uuid references app_theatre_budget.budget_plan_months (id) on delete restrict,
  status text not null default 'draft',
  reason text,
  total_transfer_amount numeric(12, 2) not null default 0,
  generated_file_path text,
  generated_file_url text,
  created_by_user_id uuid references app_theatre_budget.users (id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  posted_at timestamptz,
  denied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_transfer_amount >= 0),
  check (status in ('draft', 'ready_for_review', 'submitted', 'approved', 'denied', 'posted'))
);

create index if not exists idx_variance_requests_fiscal_year
  on app_theatre_budget.variance_requests (fiscal_year_id);

create index if not exists idx_variance_requests_triggering_purchase
  on app_theatre_budget.variance_requests (triggering_purchase_id);

create index if not exists idx_variance_requests_target_bucket
  on app_theatre_budget.variance_requests (target_budget_plan_month_id);

create index if not exists idx_variance_requests_status
  on app_theatre_budget.variance_requests (status);

create or replace function app_theatre_budget.enforce_variance_admin_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_theatre_budget, public
as $$
begin
  if new.status in ('approved', 'posted')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and not app_theatre_budget.is_admin_user() then
    raise exception 'Only Admin can approve or post variances.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_variance_admin_status_transition
  on app_theatre_budget.variance_requests;

create trigger trg_enforce_variance_admin_status_transition
before insert or update of status
on app_theatre_budget.variance_requests
for each row
execute function app_theatre_budget.enforce_variance_admin_status_transition();

create table if not exists app_theatre_budget.variance_request_lines (
  id uuid primary key default gen_random_uuid(),
  variance_request_id uuid not null references app_theatre_budget.variance_requests (id) on delete cascade,
  from_budget_plan_month_id uuid not null references app_theatre_budget.budget_plan_months (id) on delete restrict,
  to_budget_plan_month_id uuid not null references app_theatre_budget.budget_plan_months (id) on delete restrict,
  from_organization_id uuid not null references app_theatre_budget.organizations (id) on delete restrict,
  from_account_code_id uuid not null references app_theatre_budget.account_codes (id) on delete restrict,
  from_month_start date not null,
  to_organization_id uuid not null references app_theatre_budget.organizations (id) on delete restrict,
  to_account_code_id uuid not null references app_theatre_budget.account_codes (id) on delete restrict,
  to_month_start date not null,
  transfer_amount numeric(12, 2) not null,
  narrative text,
  cross_org_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (transfer_amount > 0),
  check (from_budget_plan_month_id <> to_budget_plan_month_id),
  check (cross_org_override or from_organization_id = to_organization_id)
);

create index if not exists idx_variance_request_lines_request
  on app_theatre_budget.variance_request_lines (variance_request_id);

create index if not exists idx_variance_request_lines_from_bucket
  on app_theatre_budget.variance_request_lines (from_budget_plan_month_id);

create index if not exists idx_variance_request_lines_to_bucket
  on app_theatre_budget.variance_request_lines (to_budget_plan_month_id);

create table if not exists app_theatre_budget.variance_events (
  id uuid primary key default gen_random_uuid(),
  variance_request_id uuid not null references app_theatre_budget.variance_requests (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by_user_id uuid references app_theatre_budget.users (id) on delete set null,
  note text,
  changed_at timestamptz not null default now(),
  check (from_status is null or from_status in ('draft', 'ready_for_review', 'submitted', 'approved', 'denied', 'posted')),
  check (to_status in ('draft', 'ready_for_review', 'submitted', 'approved', 'denied', 'posted'))
);

create index if not exists idx_variance_events_request
  on app_theatre_budget.variance_events (variance_request_id, changed_at desc);

alter table app_theatre_budget.institutional_budget_commitments enable row level security;
alter table app_theatre_budget.variance_requests enable row level security;
alter table app_theatre_budget.variance_request_lines enable row level security;
alter table app_theatre_budget.variance_events enable row level security;

drop policy if exists institutional_commitments_select_access on app_theatre_budget.institutional_budget_commitments;
create policy institutional_commitments_select_access
on app_theatre_budget.institutional_budget_commitments
for select
to authenticated
using (
  app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.purchases p
    where p.id = institutional_budget_commitments.purchase_id
      and app_theatre_budget.is_project_member(p.project_id)
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and (uas.fiscal_year_id is null or uas.fiscal_year_id = institutional_budget_commitments.fiscal_year_id)
      and (uas.organization_id is null or uas.organization_id = institutional_budget_commitments.organization_id)
  )
);

drop policy if exists institutional_commitments_manage_pm_admin on app_theatre_budget.institutional_budget_commitments;
create policy institutional_commitments_manage_pm_admin
on app_theatre_budget.institutional_budget_commitments
for all
to authenticated
using (
  app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.purchases p
    where p.id = institutional_budget_commitments.purchase_id
      and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager']::app_theatre_budget.app_role[])
  )
)
with check (
  app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.purchases p
    where p.id = institutional_budget_commitments.purchase_id
      and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager']::app_theatre_budget.app_role[])
  )
);

drop policy if exists variance_requests_select_access on app_theatre_budget.variance_requests;
create policy variance_requests_select_access
on app_theatre_budget.variance_requests
for select
to authenticated
using (
  app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.purchases p
    where p.id = variance_requests.triggering_purchase_id
      and app_theatre_budget.is_project_member(p.project_id)
  )
  or exists (
    select 1
    from app_theatre_budget.user_access_scopes uas
    where uas.user_id = auth.uid()
      and uas.active = true
      and (uas.fiscal_year_id is null or uas.fiscal_year_id = variance_requests.fiscal_year_id)
      and uas.scope_role in ('admin', 'project_manager', 'buyer', 'viewer')
  )
);

drop policy if exists variance_requests_manage_pm_admin on app_theatre_budget.variance_requests;
create policy variance_requests_manage_pm_admin
on app_theatre_budget.variance_requests
for all
to authenticated
using (
  app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.purchases p
    where p.id = variance_requests.triggering_purchase_id
      and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager']::app_theatre_budget.app_role[])
  )
  or (
    variance_requests.triggering_purchase_id is null
    and exists (
      select 1
      from app_theatre_budget.user_access_scopes uas
      where uas.user_id = auth.uid()
        and uas.active = true
        and uas.scope_role in ('admin', 'project_manager')
        and (uas.fiscal_year_id is null or uas.fiscal_year_id = variance_requests.fiscal_year_id)
    )
  )
)
with check (
  app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.purchases p
    where p.id = variance_requests.triggering_purchase_id
      and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager']::app_theatre_budget.app_role[])
  )
  or (
    variance_requests.triggering_purchase_id is null
    and exists (
      select 1
      from app_theatre_budget.user_access_scopes uas
      where uas.user_id = auth.uid()
        and uas.active = true
        and uas.scope_role in ('admin', 'project_manager')
        and (uas.fiscal_year_id is null or uas.fiscal_year_id = variance_requests.fiscal_year_id)
    )
  )
);

create or replace function app_theatre_budget.can_view_variance_request(p_variance_request_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, app_theatre_budget, public
as $$
  select exists (
    select 1
    from app_theatre_budget.variance_requests vr
    where vr.id = p_variance_request_id
      and (
        app_theatre_budget.is_admin_user()
        or exists (
          select 1
          from app_theatre_budget.purchases p
          where p.id = vr.triggering_purchase_id
            and app_theatre_budget.is_project_member(p.project_id)
        )
        or exists (
          select 1
          from app_theatre_budget.user_access_scopes uas
          where uas.user_id = auth.uid()
            and uas.active = true
            and (uas.fiscal_year_id is null or uas.fiscal_year_id = vr.fiscal_year_id)
            and uas.scope_role in ('admin', 'project_manager', 'buyer', 'viewer')
        )
      )
  );
$$;

grant execute on function app_theatre_budget.can_view_variance_request(uuid) to authenticated;

drop policy if exists variance_lines_select_access on app_theatre_budget.variance_request_lines;
create policy variance_lines_select_access
on app_theatre_budget.variance_request_lines
for select
to authenticated
using (app_theatre_budget.can_view_variance_request(variance_request_lines.variance_request_id));

drop policy if exists variance_lines_manage_pm_admin on app_theatre_budget.variance_request_lines;
create policy variance_lines_manage_pm_admin
on app_theatre_budget.variance_request_lines
for all
to authenticated
using (
  app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.variance_requests vr
    left join app_theatre_budget.purchases p on p.id = vr.triggering_purchase_id
    where vr.id = variance_request_lines.variance_request_id
      and (
        app_theatre_budget.is_admin_user()
        or (p.id is not null and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
      )
  )
)
with check (
  app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.variance_requests vr
    left join app_theatre_budget.purchases p on p.id = vr.triggering_purchase_id
    where vr.id = variance_request_lines.variance_request_id
      and (
        app_theatre_budget.is_admin_user()
        or (p.id is not null and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager']::app_theatre_budget.app_role[]))
      )
  )
);

drop policy if exists variance_events_select_access on app_theatre_budget.variance_events;
create policy variance_events_select_access
on app_theatre_budget.variance_events
for select
to authenticated
using (app_theatre_budget.can_view_variance_request(variance_events.variance_request_id));

drop policy if exists variance_events_insert_pm_admin on app_theatre_budget.variance_events;
create policy variance_events_insert_pm_admin
on app_theatre_budget.variance_events
for insert
to authenticated
with check (
  app_theatre_budget.is_admin_user()
  or exists (
    select 1
    from app_theatre_budget.variance_requests vr
    left join app_theatre_budget.purchases p on p.id = vr.triggering_purchase_id
    where vr.id = variance_events.variance_request_id
      and (
        p.id is not null
        and app_theatre_budget.has_project_role(p.project_id, array['admin','project_manager']::app_theatre_budget.app_role[])
      )
  )
);

grant select, insert, update, delete on app_theatre_budget.institutional_budget_commitments to authenticated;
grant select, insert, update, delete on app_theatre_budget.variance_requests to authenticated;
grant select, insert, update, delete on app_theatre_budget.variance_request_lines to authenticated;
grant select, insert on app_theatre_budget.variance_events to authenticated;

create or replace view app_theatre_budget.v_institutional_monthly_commitments as
select
  ibc.fiscal_year_id,
  ibc.organization_id,
  ibc.account_code_id,
  ibc.budget_plan_month_id,
  ibc.order_date,
  bpm.month_start,
  count(*)::integer as commitment_count,
  coalesce(sum(ibc.committed_amount) filter (where ibc.commitment_status <> 'cancelled'), 0)::numeric(12, 2) as committed_amount
from app_theatre_budget.institutional_budget_commitments ibc
join app_theatre_budget.budget_plan_months bpm
  on bpm.id = ibc.budget_plan_month_id
group by
  ibc.fiscal_year_id,
  ibc.organization_id,
  ibc.account_code_id,
  ibc.budget_plan_month_id,
  ibc.order_date,
  bpm.month_start;

alter view app_theatre_budget.v_institutional_monthly_commitments set (security_invoker = true);

create or replace view app_theatre_budget.v_institutional_monthly_commitment_totals as
select
  ibc.fiscal_year_id,
  ibc.organization_id,
  ibc.account_code_id,
  ibc.budget_plan_month_id,
  bpm.month_start,
  count(*)::integer as commitment_count,
  coalesce(sum(ibc.committed_amount) filter (where ibc.commitment_status <> 'cancelled'), 0)::numeric(12, 2) as submitted_commitments_amount
from app_theatre_budget.institutional_budget_commitments ibc
join app_theatre_budget.budget_plan_months bpm
  on bpm.id = ibc.budget_plan_month_id
group by
  ibc.fiscal_year_id,
  ibc.organization_id,
  ibc.account_code_id,
  ibc.budget_plan_month_id,
  bpm.month_start;

alter view app_theatre_budget.v_institutional_monthly_commitment_totals set (security_invoker = true);

create or replace view app_theatre_budget.v_institutional_variance_totals as
select
  bucket.budget_plan_month_id,
  coalesce(sum(bucket.approved_incoming), 0)::numeric(12, 2) as approved_incoming_amount,
  coalesce(sum(bucket.approved_outgoing), 0)::numeric(12, 2) as approved_outgoing_amount,
  coalesce(sum(bucket.projected_incoming), 0)::numeric(12, 2) as projected_incoming_amount,
  coalesce(sum(bucket.projected_outgoing), 0)::numeric(12, 2) as projected_outgoing_amount
from (
  select
    vrl.to_budget_plan_month_id as budget_plan_month_id,
    case when vr.status in ('approved', 'posted') then vrl.transfer_amount else 0 end as approved_incoming,
    0::numeric as approved_outgoing,
    case when vr.status in ('draft', 'ready_for_review', 'submitted', 'approved', 'posted') then vrl.transfer_amount else 0 end as projected_incoming,
    0::numeric as projected_outgoing
  from app_theatre_budget.variance_request_lines vrl
  join app_theatre_budget.variance_requests vr
    on vr.id = vrl.variance_request_id
  where vr.status <> 'denied'

  union all

  select
    vrl.from_budget_plan_month_id as budget_plan_month_id,
    0::numeric as approved_incoming,
    case when vr.status in ('approved', 'posted') then vrl.transfer_amount else 0 end as approved_outgoing,
    0::numeric as projected_incoming,
    case when vr.status in ('draft', 'ready_for_review', 'submitted', 'approved', 'posted') then vrl.transfer_amount else 0 end as projected_outgoing
  from app_theatre_budget.variance_request_lines vrl
  join app_theatre_budget.variance_requests vr
    on vr.id = vrl.variance_request_id
  where vr.status <> 'denied'
) bucket
group by bucket.budget_plan_month_id;

alter view app_theatre_budget.v_institutional_variance_totals set (security_invoker = true);

create or replace view app_theatre_budget.v_institutional_monthly_budget_availability as
select
  bp.fiscal_year_id,
  fy.name as fiscal_year_name,
  bp.organization_id,
  o.org_code,
  o.name as organization_name,
  bp.account_code_id,
  ac.code as account_code,
  ac.category as account_category,
  ac.name as account_name,
  bpm.id as budget_plan_month_id,
  bpm.month_start,
  bpm.fiscal_month_index,
  bpm.amount::numeric(12, 2) as monthly_allocation,
  coalesce(ct.commitment_count, 0)::integer as commitment_count,
  coalesce(ct.submitted_commitments_amount, 0)::numeric(12, 2) as submitted_commitments_amount,
  coalesce(vt.approved_incoming_amount, 0)::numeric(12, 2) as approved_incoming_variance_amount,
  coalesce(vt.approved_outgoing_amount, 0)::numeric(12, 2) as approved_outgoing_variance_amount,
  coalesce(vt.projected_incoming_amount, 0)::numeric(12, 2) as projected_incoming_variance_amount,
  coalesce(vt.projected_outgoing_amount, 0)::numeric(12, 2) as projected_outgoing_variance_amount,
  (
    bpm.amount
    + coalesce(vt.approved_incoming_amount, 0)
    - coalesce(vt.approved_outgoing_amount, 0)
    - coalesce(ct.submitted_commitments_amount, 0)
  )::numeric(12, 2) as official_available_amount,
  (
    bpm.amount
    + coalesce(vt.projected_incoming_amount, 0)
    - coalesce(vt.projected_outgoing_amount, 0)
    - coalesce(ct.submitted_commitments_amount, 0)
  )::numeric(12, 2) as projected_available_amount
from app_theatre_budget.budget_plan_months bpm
join app_theatre_budget.budget_plans bp
  on bp.id = bpm.budget_plan_id
join app_theatre_budget.fiscal_years fy
  on fy.id = bp.fiscal_year_id
join app_theatre_budget.organizations o
  on o.id = bp.organization_id
join app_theatre_budget.account_codes ac
  on ac.id = bp.account_code_id
left join app_theatre_budget.v_institutional_monthly_commitment_totals ct
  on ct.budget_plan_month_id = bpm.id
left join app_theatre_budget.v_institutional_variance_totals vt
  on vt.budget_plan_month_id = bpm.id;

alter view app_theatre_budget.v_institutional_monthly_budget_availability set (security_invoker = true);

grant select on app_theatre_budget.v_institutional_monthly_commitments to authenticated;
grant select on app_theatre_budget.v_institutional_monthly_commitment_totals to authenticated;
grant select on app_theatre_budget.v_institutional_variance_totals to authenticated;
grant select on app_theatre_budget.v_institutional_monthly_budget_availability to authenticated;

create or replace function app_theatre_budget.get_institutional_source_candidates(
  p_fiscal_year_id uuid default null,
  p_organization_id uuid default null,
  p_account_code_id uuid default null,
  p_month_start date default null,
  p_search text default null,
  p_target_organization_id uuid default null,
  p_allow_cross_org boolean default false
)
returns table (
  fiscal_year_id uuid,
  fiscal_year_name text,
  organization_id uuid,
  org_code text,
  organization_name text,
  account_code_id uuid,
  account_code text,
  account_category text,
  account_name text,
  budget_plan_month_id uuid,
  month_start date,
  fiscal_month_index integer,
  monthly_allocation numeric,
  official_available_amount numeric,
  projected_available_amount numeric,
  crosses_target_org boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, app_theatre_budget, public
as $$
  select
    a.fiscal_year_id,
    a.fiscal_year_name,
    a.organization_id,
    a.org_code,
    a.organization_name,
    a.account_code_id,
    a.account_code,
    a.account_category,
    a.account_name,
    a.budget_plan_month_id,
    a.month_start,
    a.fiscal_month_index,
    a.monthly_allocation,
    a.official_available_amount,
    a.projected_available_amount,
    (p_target_organization_id is not null and a.organization_id <> p_target_organization_id) as crosses_target_org
  from app_theatre_budget.v_institutional_monthly_budget_availability a
  where a.official_available_amount > 0
    and (p_fiscal_year_id is null or a.fiscal_year_id = p_fiscal_year_id)
    and (p_organization_id is null or a.organization_id = p_organization_id)
    and (p_account_code_id is null or a.account_code_id = p_account_code_id)
    and (p_month_start is null or a.month_start = p_month_start)
    and (
      p_target_organization_id is null
      or p_allow_cross_org
      or a.organization_id = p_target_organization_id
    )
    and (
      coalesce(trim(p_search), '') = ''
      or a.fiscal_year_name ilike '%' || trim(p_search) || '%'
      or a.org_code ilike '%' || trim(p_search) || '%'
      or a.organization_name ilike '%' || trim(p_search) || '%'
      or a.account_code ilike '%' || trim(p_search) || '%'
      or a.account_category ilike '%' || trim(p_search) || '%'
      or a.account_name ilike '%' || trim(p_search) || '%'
      or to_char(a.month_start, 'YYYY-MM') ilike '%' || trim(p_search) || '%'
    )
  order by
    crosses_target_org asc,
    a.fiscal_year_name,
    a.org_code,
    a.account_code,
    a.month_start;
$$;

grant execute on function app_theatre_budget.get_institutional_source_candidates(uuid, uuid, uuid, date, text, uuid, boolean) to authenticated;
