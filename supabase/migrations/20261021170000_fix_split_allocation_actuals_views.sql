-- Attribute split purchases to each allocation's own budget destination in Overview actuals.
-- A direct organization allocation is not assigned to the purchase header's project.

create or replace view app_theatre_budget.v_actuals_by_category as
with alloc_raw as (
  select
    p.id as purchase_id,
    case
      when pa.organization_id is not null then null
      else coalesce(allocation_line.project_id, p.project_id)
    end as project_id,
    coalesce(pa.organization_id, allocation_project.organization_id, p.organization_id, header_project.organization_id) as organization_id,
    coalesce(
      p.fiscal_year_id,
      allocation_project.fiscal_year_id,
      header_project.fiscal_year_id,
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
  from app_theatre_budget.purchases p
  join app_theatre_budget.purchase_allocations pa on pa.purchase_id = p.id
  left join app_theatre_budget.project_budget_lines allocation_line on allocation_line.id = pa.reporting_budget_line_id
  left join app_theatre_budget.projects allocation_project on allocation_project.id = allocation_line.project_id
  left join app_theatre_budget.projects header_project on header_project.id = p.project_id
  left join lateral (
    select fy.id
    from app_theatre_budget.fiscal_years fy
    where (fy.start_date is null or fy.start_date <= coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date))
      and (fy.end_date is null or coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date) <= fy.end_date)
    order by coalesce(fy.sort_order, 2147483647), fy.name, fy.id
    limit 1
  ) fy_match on true
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
left join app_theatre_budget.production_categories pc on pc.id = a.production_category_id
left join app_theatre_budget.organizations o on o.id = a.organization_id
left join app_theatre_budget.fiscal_years fy on fy.id = a.fiscal_year_id
group by
  a.project_id,
  a.organization_id,
  o.name,
  o.org_code,
  a.fiscal_year_id,
  fy.name,
  coalesce(pc.name, 'Uncategorized');

alter view app_theatre_budget.v_actuals_by_category set (security_invoker = true);

create or replace view app_theatre_budget.v_actuals_by_banner_code as
with alloc_raw as (
  select
    p.id as purchase_id,
    case
      when pa.organization_id is not null then null
      else coalesce(allocation_line.project_id, p.project_id)
    end as project_id,
    coalesce(pa.organization_id, allocation_project.organization_id, p.organization_id, header_project.organization_id) as organization_id,
    coalesce(
      p.fiscal_year_id,
      allocation_project.fiscal_year_id,
      header_project.fiscal_year_id,
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
  from app_theatre_budget.purchases p
  join app_theatre_budget.purchase_allocations pa on pa.purchase_id = p.id
  left join app_theatre_budget.project_budget_lines allocation_line on allocation_line.id = pa.reporting_budget_line_id
  left join app_theatre_budget.projects allocation_project on allocation_project.id = allocation_line.project_id
  left join app_theatre_budget.projects header_project on header_project.id = p.project_id
  left join lateral (
    select fy.id
    from app_theatre_budget.fiscal_years fy
    where (fy.start_date is null or fy.start_date <= coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date))
      and (fy.end_date is null or coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date) <= fy.end_date)
    order by coalesce(fy.sort_order, 2147483647), fy.name, fy.id
    limit 1
  ) fy_match on true
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
left join app_theatre_budget.account_codes ac on ac.id = a.account_code_id
left join app_theatre_budget.organizations o on o.id = a.organization_id
left join app_theatre_budget.fiscal_years fy on fy.id = a.fiscal_year_id
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

alter view app_theatre_budget.v_actuals_by_banner_code set (security_invoker = true);

notify pgrst, 'reload schema';
