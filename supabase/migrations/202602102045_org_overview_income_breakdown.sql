-- Add income breakdown fields to org overview:
-- - starting_budget_total
-- - additional_income_total
-- - funding_pool_total
-- - funding_pool_available

create or replace view public.v_organization_totals as
select
  o.id as organization_id,
  o.name as organization_name,
  o.org_code,
  o.fiscal_year_id,
  fy.name as fiscal_year_name,
  coalesce(pt.allocated_total, 0)::numeric(12, 2) as allocated_total,
  coalesce(pt.requested_open_total, 0)::numeric(12, 2) as requested_open_total,
  coalesce(pt.enc_total, 0)::numeric(12, 2) as enc_total,
  coalesce(pt.pending_cc_total, 0)::numeric(12, 2) as pending_cc_total,
  coalesce(pt.ytd_total, 0)::numeric(12, 2) as ytd_total,
  coalesce(pt.obligated_total, 0)::numeric(12, 2) as obligated_total,
  coalesce(pt.remaining_true, 0)::numeric(12, 2) as remaining_true,
  coalesce(pt.remaining_if_requested_approved, 0)::numeric(12, 2) as remaining_if_requested_approved,
  coalesce(it.starting_budget_total, 0)::numeric(12, 2) as starting_budget_total,
  coalesce(it.additional_income_total, 0)::numeric(12, 2) as additional_income_total,
  (coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0))::numeric(12, 2) as funding_pool_total,
  ((coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0)) - coalesce(pt.obligated_total, 0))::numeric(12, 2) as funding_pool_available,
  coalesce(it.income_total, 0)::numeric(12, 2) as income_total
from public.organizations o
left join public.fiscal_years fy on fy.id = o.fiscal_year_id
left join (
  select
    p.organization_id,
    coalesce(sum(vpt.allocated_total), 0)::numeric(12, 2) as allocated_total,
    coalesce(sum(vpt.requested_open_total), 0)::numeric(12, 2) as requested_open_total,
    coalesce(sum(vpt.enc_total), 0)::numeric(12, 2) as enc_total,
    coalesce(sum(vpt.pending_cc_total), 0)::numeric(12, 2) as pending_cc_total,
    coalesce(sum(vpt.ytd_total), 0)::numeric(12, 2) as ytd_total,
    coalesce(sum(vpt.obligated_total), 0)::numeric(12, 2) as obligated_total,
    coalesce(sum(vpt.remaining_true), 0)::numeric(12, 2) as remaining_true,
    coalesce(sum(vpt.remaining_if_requested_approved), 0)::numeric(12, 2) as remaining_if_requested_approved
  from public.projects p
  left join public.v_project_totals vpt on vpt.project_id = p.id
  group by p.organization_id
) pt on pt.organization_id = o.id
left join (
  select
    coalesce(il.organization_id, p.organization_id) as organization_id,
    coalesce(sum(il.amount), 0)::numeric(12, 2) as income_total,
    coalesce(sum(case when il.income_type = 'starting_budget' then il.amount else 0 end), 0)::numeric(12, 2) as starting_budget_total,
    coalesce(sum(case when il.income_type <> 'starting_budget' then il.amount else 0 end), 0)::numeric(12, 2) as additional_income_total
  from public.income_lines il
  left join public.projects p on p.id = il.project_id
  group by coalesce(il.organization_id, p.organization_id)
) it on it.organization_id = o.id;

alter view public.v_organization_totals set (security_invoker = true);
