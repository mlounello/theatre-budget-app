-- Align budget planning historicals with obligated totals.

create or replace view app_theatre_budget.v_monthly_actuals_by_org_account as
with alloc_raw as (
  select
    p.id as purchase_id,
    coalesce(p.organization_id, pr.organization_id) as organization_id,
    coalesce(pa.account_code_id, p.banner_account_code_id) as account_code_id,
    p.status,
    p.request_type,
    p.requested_amount,
    p.encumbered_amount,
    p.pending_cc_amount,
    p.posted_amount,
    coalesce(p.ordered_on, p.posted_date, p.received_on, p.paid_on, (p.created_at at time zone 'utc')::date) as plan_date,
    pa.amount as alloc_amount
  from app_theatre_budget.purchases p
  join app_theatre_budget.purchase_allocations pa on pa.purchase_id = p.id
  left join app_theatre_budget.projects pr on pr.id = p.project_id
),
alloc as (
  select
    ar.*,
    coalesce(sum(ar.alloc_amount) over (partition by ar.purchase_id), 0) as alloc_total
  from alloc_raw ar
),
allocated_rows as (
  select
    a.purchase_id,
    a.organization_id,
    a.account_code_id,
    a.plan_date,
    case
      when a.status = 'encumbered'
        then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
      when a.status = 'pending_cc'
        then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
      when a.status = 'posted'
        then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
      when a.status = 'requested' and a.request_type = 'request'
        then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
      else 0
    end as obligated_amount
  from alloc a
),
non_allocated_rows as (
  select
    p.id as purchase_id,
    coalesce(p.organization_id, pr.organization_id) as organization_id,
    p.banner_account_code_id as account_code_id,
    coalesce(p.ordered_on, p.posted_date, p.received_on, p.paid_on, (p.created_at at time zone 'utc')::date) as plan_date,
    case
      when p.status = 'encumbered' then p.encumbered_amount
      when p.status = 'pending_cc' then p.pending_cc_amount
      when p.status = 'posted' then p.posted_amount
      when p.status = 'requested' and p.request_type = 'request' then p.requested_amount
      else 0
    end as obligated_amount
  from app_theatre_budget.purchases p
  left join app_theatre_budget.projects pr on pr.id = p.project_id
  where not exists (
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
  coalesce(sum(s.obligated_amount), 0)::numeric(12, 2) as obligated_amount
from scoped_with_fy s
where s.organization_id is not null
  and s.account_code_id is not null
group by s.fiscal_year_id, s.organization_id, s.account_code_id, date_trunc('month', s.plan_date)::date;

alter view app_theatre_budget.v_monthly_actuals_by_org_account set (security_invoker = true);
