-- Ensure overview/actuals rollups always have fiscal-year context, including External Procurement.
-- Strategy:
-- 1) Resolve FY by project.fiscal_year_id first.
-- 2) Fallback to fiscal year date-range match using transaction date.

drop view if exists public.v_actuals_by_category;
drop view if exists public.v_actuals_by_banner_code;
drop view if exists public.v_organization_totals;

create view public.v_actuals_by_category as
with alloc_raw as (
  select
    p.id as purchase_id,
    p.project_id,
    coalesce(p.organization_id, pr.organization_id) as organization_id,
    coalesce(
      pr.fiscal_year_id,
      fy_match.id
    ) as fiscal_year_id,
    p.status,
    p.request_type,
    p.requested_amount,
    p.encumbered_amount,
    p.pending_cc_amount,
    p.posted_amount,
    pa.production_category_id,
    pa.amount as alloc_amount
  from public.purchases p
  left join public.projects pr on pr.id = p.project_id
  left join lateral (
    select fy.id
    from public.fiscal_years fy
    where (fy.start_date is null or fy.start_date <= coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date))
      and (fy.end_date is null or coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date) <= fy.end_date)
    order by coalesce(fy.sort_order, 2147483647), fy.name, fy.id
    limit 1
  ) fy_match on true
  join public.purchase_allocations pa on pa.purchase_id = p.id
),
alloc as (
  select
    ar.*,
    coalesce(sum(ar.alloc_amount) over (partition by ar.purchase_id), 0) as alloc_total
  from alloc_raw ar
)
select
  a.project_id,
  a.organization_id,
  o.name as organization_name,
  o.org_code,
  a.fiscal_year_id,
  fy.name as fiscal_year_name,
  coalesce(pc.name, 'Uncategorized') as production_category,
  coalesce(sum(case when a.status = 'requested' and a.request_type <> 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as requested_total,
  coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as posted_total,
  (
    coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
  )::numeric(12, 2) as obligated_total,
  coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as held_total
from alloc a
left join public.production_categories pc on pc.id = a.production_category_id
left join public.organizations o on o.id = a.organization_id
left join public.fiscal_years fy on fy.id = a.fiscal_year_id
group by
  a.project_id,
  a.organization_id,
  o.name,
  o.org_code,
  a.fiscal_year_id,
  fy.name,
  coalesce(pc.name, 'Uncategorized');

alter view public.v_actuals_by_category set (security_invoker = true);
grant select on public.v_actuals_by_category to authenticated;

create view public.v_actuals_by_banner_code as
with alloc_raw as (
  select
    p.id as purchase_id,
    p.project_id,
    coalesce(p.organization_id, pr.organization_id) as organization_id,
    coalesce(
      pr.fiscal_year_id,
      fy_match.id
    ) as fiscal_year_id,
    p.status,
    p.request_type,
    p.requested_amount,
    p.encumbered_amount,
    p.pending_cc_amount,
    p.posted_amount,
    coalesce(pa.account_code_id, p.banner_account_code_id) as account_code_id,
    pa.amount as alloc_amount
  from public.purchases p
  left join public.projects pr on pr.id = p.project_id
  left join lateral (
    select fy.id
    from public.fiscal_years fy
    where (fy.start_date is null or fy.start_date <= coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date))
      and (fy.end_date is null or coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date) <= fy.end_date)
    order by coalesce(fy.sort_order, 2147483647), fy.name, fy.id
    limit 1
  ) fy_match on true
  join public.purchase_allocations pa on pa.purchase_id = p.id
),
alloc as (
  select
    ar.*,
    coalesce(sum(ar.alloc_amount) over (partition by ar.purchase_id), 0) as alloc_total
  from alloc_raw ar
)
select
  a.project_id,
  a.organization_id,
  o.name as organization_name,
  o.org_code,
  a.fiscal_year_id,
  fy.name as fiscal_year_name,
  coalesce(ac.code, 'UNASSIGNED') as banner_account_code,
  coalesce(ac.category, 'Unassigned') as banner_category,
  coalesce(ac.name, 'Unassigned') as banner_name,
  coalesce(sum(case when a.status = 'requested' and a.request_type <> 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as requested_total,
  coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as posted_total,
  (
    coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
  )::numeric(12, 2) as obligated_total,
  coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as held_total
from alloc a
left join public.account_codes ac on ac.id = a.account_code_id
left join public.organizations o on o.id = a.organization_id
left join public.fiscal_years fy on fy.id = a.fiscal_year_id
group by
  a.project_id,
  a.organization_id,
  o.name,
  o.org_code,
  a.fiscal_year_id,
  fy.name,
  coalesce(ac.code, 'UNASSIGNED'),
  coalesce(ac.category, 'Unassigned'),
  coalesce(ac.name, 'Unassigned');

alter view public.v_actuals_by_banner_code set (security_invoker = true);
grant select on public.v_actuals_by_banner_code to authenticated;

create view public.v_organization_totals as
with income_scoped as (
  select
    coalesce(il.organization_id, p.organization_id) as organization_id,
    coalesce(
      p.fiscal_year_id,
      fy_match.id
    ) as fiscal_year_id,
    il.amount,
    il.income_type
  from public.income_lines il
  left join public.projects p on p.id = il.project_id
  left join lateral (
    select fy.id
    from public.fiscal_years fy
    where (fy.start_date is null or fy.start_date <= coalesce(il.received_on, (il.created_at at time zone 'utc')::date))
      and (fy.end_date is null or coalesce(il.received_on, (il.created_at at time zone 'utc')::date) <= fy.end_date)
    order by coalesce(fy.sort_order, 2147483647), fy.name, fy.id
    limit 1
  ) fy_match on true
  where coalesce(il.organization_id, p.organization_id) is not null
),
purchase_scope as (
  select distinct
    coalesce(p.organization_id, pr.organization_id) as organization_id,
    coalesce(
      pr.fiscal_year_id,
      fy_match.id
    ) as fiscal_year_id
  from public.purchases p
  left join public.projects pr on pr.id = p.project_id
  left join lateral (
    select fy.id
    from public.fiscal_years fy
    where (fy.start_date is null or fy.start_date <= coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date))
      and (fy.end_date is null or coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date) <= fy.end_date)
    order by coalesce(fy.sort_order, 2147483647), fy.name, fy.id
    limit 1
  ) fy_match on true
  where coalesce(p.organization_id, pr.organization_id) is not null
),
org_fy as (
  select distinct
    p.organization_id,
    p.fiscal_year_id
  from public.projects p
  where p.organization_id is not null
  union
  select distinct
    i.organization_id,
    i.fiscal_year_id
  from income_scoped i
  union
  select distinct
    ps.organization_id,
    ps.fiscal_year_id
  from purchase_scope ps
),
pt as (
  select
    p.organization_id,
    p.fiscal_year_id,
    coalesce(sum(vpt.allocated_total), 0)::numeric(12, 2) as allocated_total,
    coalesce(sum(vpt.requested_open_total), 0)::numeric(12, 2) as requested_open_total,
    coalesce(sum(vpt.enc_total), 0)::numeric(12, 2) as enc_total,
    coalesce(sum(vpt.pending_cc_total), 0)::numeric(12, 2) as pending_cc_total,
    coalesce(sum(vpt.ytd_total), 0)::numeric(12, 2) as ytd_total,
    coalesce(sum(vpt.obligated_total), 0)::numeric(12, 2) as obligated_total,
    coalesce(sum(vpt.held_total), 0)::numeric(12, 2) as held_total
  from public.projects p
  left join public.v_project_totals vpt on vpt.project_id = p.id
  where p.organization_id is not null
  group by p.organization_id, p.fiscal_year_id
),
it as (
  select
    i.organization_id,
    i.fiscal_year_id,
    coalesce(sum(i.amount), 0)::numeric(12, 2) as income_total,
    coalesce(sum(case when i.income_type = 'starting_budget' then i.amount else 0 end), 0)::numeric(12, 2) as starting_budget_total,
    coalesce(sum(case when i.income_type <> 'starting_budget' then i.amount else 0 end), 0)::numeric(12, 2) as additional_income_total
  from income_scoped i
  group by i.organization_id, i.fiscal_year_id
)
select
  o.id as organization_id,
  o.name as organization_name,
  o.org_code,
  fy_scope.fiscal_year_id,
  fy.name as fiscal_year_name,
  coalesce(pt.allocated_total, 0)::numeric(12, 2) as allocated_total,
  coalesce(pt.requested_open_total, 0)::numeric(12, 2) as requested_open_total,
  coalesce(pt.enc_total, 0)::numeric(12, 2) as enc_total,
  coalesce(pt.pending_cc_total, 0)::numeric(12, 2) as pending_cc_total,
  coalesce(pt.ytd_total, 0)::numeric(12, 2) as ytd_total,
  coalesce(pt.obligated_total, 0)::numeric(12, 2) as obligated_total,
  (
    (coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0))
    - (
      coalesce(pt.enc_total, 0)
      + coalesce(pt.pending_cc_total, 0)
      + coalesce(pt.ytd_total, 0)
      + coalesce(pt.requested_open_total, 0)
    )
  )::numeric(12, 2) as remaining_true,
  (
    (coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0))
    - coalesce(pt.obligated_total, 0)
  )::numeric(12, 2) as remaining_if_requested_approved,
  coalesce(it.starting_budget_total, 0)::numeric(12, 2) as starting_budget_total,
  coalesce(it.additional_income_total, 0)::numeric(12, 2) as additional_income_total,
  (coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0))::numeric(12, 2) as funding_pool_total,
  ((coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0)) - coalesce(pt.allocated_total, 0))::numeric(12, 2) as funding_pool_available,
  coalesce(it.income_total, 0)::numeric(12, 2) as income_total,
  coalesce(pt.held_total, 0)::numeric(12, 2) as held_total
from public.organizations o
left join org_fy fy_scope on fy_scope.organization_id = o.id
left join public.fiscal_years fy on fy.id = fy_scope.fiscal_year_id
left join pt
  on pt.organization_id = o.id
 and pt.fiscal_year_id is not distinct from fy_scope.fiscal_year_id
left join it
  on it.organization_id = o.id
 and it.fiscal_year_id is not distinct from fy_scope.fiscal_year_id;

alter view public.v_organization_totals set (security_invoker = true);
grant select on public.v_organization_totals to authenticated;
