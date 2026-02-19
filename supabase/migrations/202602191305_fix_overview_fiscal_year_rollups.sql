-- Fix Organization Overview fiscal-year attribution after organizations became global.
-- Org totals must roll up by project fiscal year, not organizations.fiscal_year_id.

drop view if exists public.v_organization_totals;

create view public.v_organization_totals as
with org_fy as (
  select distinct
    p.organization_id,
    p.fiscal_year_id
  from public.projects p
  where p.organization_id is not null
  union
  select distinct
    coalesce(il.organization_id, p.organization_id) as organization_id,
    p.fiscal_year_id
  from public.income_lines il
  left join public.projects p on p.id = il.project_id
  where coalesce(il.organization_id, p.organization_id) is not null
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
    coalesce(il.organization_id, p.organization_id) as organization_id,
    p.fiscal_year_id,
    coalesce(sum(il.amount), 0)::numeric(12, 2) as income_total,
    coalesce(sum(case when il.income_type = 'starting_budget' then il.amount else 0 end), 0)::numeric(12, 2) as starting_budget_total,
    coalesce(sum(case when il.income_type <> 'starting_budget' then il.amount else 0 end), 0)::numeric(12, 2) as additional_income_total
  from public.income_lines il
  left join public.projects p on p.id = il.project_id
  where coalesce(il.organization_id, p.organization_id) is not null
  group by coalesce(il.organization_id, p.organization_id), p.fiscal_year_id
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
