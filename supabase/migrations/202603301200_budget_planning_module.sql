-- Budget Planning module (preview draft) - DO NOT APPLY YET
-- Schema: app_theatre_budget

-- 1) budget_plans
create table if not exists app_theatre_budget.budget_plans (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null references app_theatre_budget.fiscal_years (id) on delete cascade,
  organization_id uuid not null references app_theatre_budget.organizations (id) on delete cascade,
  account_code_id uuid not null references app_theatre_budget.account_codes (id) on delete restrict,
  annual_amount numeric(12, 2) not null default 0,
  source_fiscal_year_id uuid references app_theatre_budget.fiscal_years (id) on delete set null,
  created_by_user_id uuid not null references app_theatre_budget.users (id) on delete restrict,
  updated_by_user_id uuid references app_theatre_budget.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fiscal_year_id, organization_id, account_code_id),
  check (annual_amount >= 0)
);

create index if not exists idx_budget_plans_fy_org
  on app_theatre_budget.budget_plans (fiscal_year_id, organization_id);

create index if not exists idx_budget_plans_account_code
  on app_theatre_budget.budget_plans (account_code_id);


-- 2) budget_plan_months
create table if not exists app_theatre_budget.budget_plan_months (
  id uuid primary key default gen_random_uuid(),
  budget_plan_id uuid not null references app_theatre_budget.budget_plans (id) on delete cascade,
  month_start date not null,
  fiscal_month_index int not null check (fiscal_month_index between 1 and 12),
  amount numeric(12, 2) not null default 0,
  percent numeric(8, 6) not null default 0,
  source text not null default 'historical',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_plan_id, month_start),
  check (percent >= 0 and percent <= 1),
  check (source in ('historical', 'manual', 'even')),
  check (amount >= 0)
);

create index if not exists idx_budget_plan_months_plan
  on app_theatre_budget.budget_plan_months (budget_plan_id);

create index if not exists idx_budget_plan_months_month
  on app_theatre_budget.budget_plan_months (month_start);


-- 3) v_monthly_actuals_by_org_account
-- Planning date bucket:
-- coalesce(ordered_on, posted_date, received_on, paid_on, created_at::date)
-- Historical spend filter:
-- purchases.status = 'posted'
-- purchases.request_type <> 'request'

create or replace view app_theatre_budget.v_monthly_actuals_by_org_account as
with allocated_rows as (
  select
    p.id as purchase_id,
    coalesce(p.organization_id, pr.organization_id) as organization_id,
    pa.account_code_id as account_code_id,
    coalesce(p.ordered_on, p.posted_date, p.received_on, p.paid_on, (p.created_at at time zone 'utc')::date) as plan_date,
    pa.amount as alloc_amount
  from app_theatre_budget.purchases p
  join app_theatre_budget.purchase_allocations pa on pa.purchase_id = p.id
  left join app_theatre_budget.projects pr on pr.id = p.project_id
  where p.status = 'posted'
    and p.request_type <> 'request'
),
non_allocated_rows as (
  select
    p.id as purchase_id,
    coalesce(p.organization_id, pr.organization_id) as organization_id,
    p.banner_account_code_id as account_code_id,
    coalesce(p.ordered_on, p.posted_date, p.received_on, p.paid_on, (p.created_at at time zone 'utc')::date) as plan_date,
    p.posted_amount as alloc_amount
  from app_theatre_budget.purchases p
  left join app_theatre_budget.projects pr on pr.id = p.project_id
  where p.status = 'posted'
    and p.request_type <> 'request'
    and not exists (
      select 1
      from app_theatre_budget.purchase_allocations pa
      where pa.purchase_id = p.id
    )
),
purchase_scope as (
  select * from allocated_rows
  union all
  select * from non_allocated_rows
),
scoped_with_fy as (
  select
    ps.*,
    fy_match.id as fiscal_year_id
  from purchase_scope ps
  left join lateral (
    select fy.id
    from app_theatre_budget.fiscal_years fy
    where (fy.start_date is null or fy.start_date <= ps.plan_date)
      and (fy.end_date is null or ps.plan_date <= fy.end_date)
    order by coalesce(fy.sort_order, 2147483647), fy.name, fy.id
    limit 1
  ) fy_match on true
)
select
  s.fiscal_year_id,
  s.organization_id,
  s.account_code_id,
  date_trunc('month', s.plan_date)::date as month_start,
  coalesce(sum(s.alloc_amount), 0)::numeric(12, 2) as posted_amount
from scoped_with_fy s
where s.organization_id is not null
  and s.account_code_id is not null
group by s.fiscal_year_id, s.organization_id, s.account_code_id, date_trunc('month', s.plan_date)::date;

alter view app_theatre_budget.v_monthly_actuals_by_org_account set (security_invoker = true);
