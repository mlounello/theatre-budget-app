-- Add explicit Held totals (Budget Hold request_type='request') to rollup views.

create or replace view public.v_budget_line_totals as
with alloc_raw as (
  select
    p.id as purchase_id,
    p.project_id,
    p.status,
    p.request_type,
    p.requested_amount,
    p.encumbered_amount,
    p.pending_cc_amount,
    p.posted_amount,
    pa.reporting_budget_line_id as line_id,
    pa.amount as alloc_amount
  from public.purchases p
  join public.purchase_allocations pa on pa.purchase_id = p.id
),
alloc as (
  select
    ar.*,
    coalesce(sum(ar.alloc_amount) over (partition by ar.purchase_id), 0) as alloc_total
  from alloc_raw ar
)
select
  pbl.id as project_budget_line_id,
  pbl.project_id,
  pbl.budget_code,
  pbl.category,
  pbl.line_name,
  pbl.allocated_amount,
  coalesce(
    sum(
      case
        when a.status = 'requested' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as requested_open_total,
  coalesce(
    sum(
      case
        when a.status = 'requested' and a.request_type = 'request'
          then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as held_total,
  coalesce(
    sum(
      case
        when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as enc_total,
  coalesce(
    sum(
      case
        when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as pending_cc_total,
  coalesce(
    sum(
      case
        when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as ytd_total,
  (
    coalesce(
      sum(
        case
          when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
          else 0
        end
      ),
      0
    )
    + coalesce(
      sum(
        case
          when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
          else 0
        end
      ),
      0
    )
    + coalesce(
      sum(
        case
          when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
          else 0
        end
      ),
      0
    )
    + coalesce(
      sum(
        case
          when a.status = 'requested' and a.request_type = 'request'
            then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
          else 0
        end
      ),
      0
    )
  )::numeric(12, 2) as obligated_total,
  (
    pbl.allocated_amount
    - (
      coalesce(
        sum(
          case
            when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'requested' and a.request_type = 'request'
              then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
    )
  )::numeric(12, 2) as remaining_true,
  (
    pbl.allocated_amount
    - (
      coalesce(
        sum(
          case
            when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'requested' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
    )
  )::numeric(12, 2) as remaining_if_requested_approved
from public.project_budget_lines pbl
left join alloc a on a.line_id = pbl.id
group by pbl.id;

create or replace view public.v_project_totals as
select
  project_id,
  sum(allocated_amount)::numeric(12, 2) as allocated_total,
  sum(requested_open_total)::numeric(12, 2) as requested_open_total,
  sum(held_total)::numeric(12, 2) as held_total,
  sum(enc_total)::numeric(12, 2) as enc_total,
  sum(pending_cc_total)::numeric(12, 2) as pending_cc_total,
  sum(ytd_total)::numeric(12, 2) as ytd_total,
  sum(obligated_total)::numeric(12, 2) as obligated_total,
  sum(remaining_true)::numeric(12, 2) as remaining_true,
  sum(remaining_if_requested_approved)::numeric(12, 2) as remaining_if_requested_approved
from public.v_budget_line_totals
group by project_id;

create or replace view public.v_project_category_totals as
select
  project_id,
  category,
  sum(allocated_amount)::numeric(12, 2) as allocated_total,
  sum(requested_open_total)::numeric(12, 2) as requested_open_total,
  sum(held_total)::numeric(12, 2) as held_total,
  sum(enc_total)::numeric(12, 2) as enc_total,
  sum(pending_cc_total)::numeric(12, 2) as pending_cc_total,
  sum(ytd_total)::numeric(12, 2) as ytd_total,
  sum(obligated_total)::numeric(12, 2) as obligated_total,
  sum(remaining_true)::numeric(12, 2) as remaining_true,
  sum(remaining_if_requested_approved)::numeric(12, 2) as remaining_if_requested_approved
from public.v_budget_line_totals
group by project_id, category;

create or replace view public.v_organization_totals as
select
  o.id as organization_id,
  o.name as organization_name,
  o.org_code,
  o.fiscal_year_id,
  fy.name as fiscal_year_name,
  coalesce(pt.allocated_total, 0)::numeric(12, 2) as allocated_total,
  coalesce(pt.requested_open_total, 0)::numeric(12, 2) as requested_open_total,
  coalesce(pt.held_total, 0)::numeric(12, 2) as held_total,
  coalesce(pt.enc_total, 0)::numeric(12, 2) as enc_total,
  coalesce(pt.pending_cc_total, 0)::numeric(12, 2) as pending_cc_total,
  coalesce(pt.ytd_total, 0)::numeric(12, 2) as ytd_total,
  coalesce(pt.obligated_total, 0)::numeric(12, 2) as obligated_total,
  coalesce(pt.remaining_true, 0)::numeric(12, 2) as remaining_true,
  coalesce(pt.remaining_if_requested_approved, 0)::numeric(12, 2) as remaining_if_requested_approved,
  coalesce(it.starting_budget_total, 0)::numeric(12, 2) as starting_budget_total,
  coalesce(it.additional_income_total, 0)::numeric(12, 2) as additional_income_total,
  (coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0))::numeric(12, 2) as funding_pool_total,
  ((coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0)) - coalesce(pt.allocated_total, 0))::numeric(12, 2) as funding_pool_available,
  coalesce(it.income_total, 0)::numeric(12, 2) as income_total
from public.organizations o
left join public.fiscal_years fy on fy.id = o.fiscal_year_id
left join (
  select
    p.organization_id,
    coalesce(sum(vpt.allocated_total), 0)::numeric(12, 2) as allocated_total,
    coalesce(sum(vpt.requested_open_total), 0)::numeric(12, 2) as requested_open_total,
    coalesce(sum(vpt.held_total), 0)::numeric(12, 2) as held_total,
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

create or replace view public.v_actuals_by_category as
with alloc_raw as (
  select
    p.id as purchase_id,
    p.project_id,
    p.status,
    p.request_type,
    p.requested_amount,
    p.encumbered_amount,
    p.pending_cc_amount,
    p.posted_amount,
    pa.production_category_id,
    pa.amount as alloc_amount
  from public.purchases p
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
  coalesce(pc.name, 'Uncategorized') as production_category,
  coalesce(sum(case when a.status = 'requested' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as requested_total,
  coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as held_total,
  coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as posted_total,
  (
    coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
  )::numeric(12, 2) as obligated_total
from alloc a
left join public.production_categories pc on pc.id = a.production_category_id
group by a.project_id, coalesce(pc.name, 'Uncategorized');

create or replace view public.v_actuals_by_banner_code as
with alloc_raw as (
  select
    p.id as purchase_id,
    p.project_id,
    p.status,
    p.request_type,
    p.requested_amount,
    p.encumbered_amount,
    p.pending_cc_amount,
    p.posted_amount,
    coalesce(pa.account_code_id, p.banner_account_code_id) as account_code_id,
    pa.amount as alloc_amount
  from public.purchases p
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
  coalesce(ac.code, 'UNASSIGNED') as banner_account_code,
  coalesce(ac.category, 'Unassigned') as banner_category,
  coalesce(ac.name, 'Unassigned') as banner_name,
  coalesce(sum(case when a.status = 'requested' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as requested_total,
  coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as held_total,
  coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as posted_total,
  (
    coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
  )::numeric(12, 2) as obligated_total
from alloc a
left join public.account_codes ac on ac.id = a.account_code_id
group by a.project_id, coalesce(ac.code, 'UNASSIGNED'), coalesce(ac.category, 'Unassigned'), coalesce(ac.name, 'Unassigned');

alter view public.v_budget_line_totals set (security_invoker = true);
alter view public.v_project_totals set (security_invoker = true);
alter view public.v_project_category_totals set (security_invoker = true);
alter view public.v_organization_totals set (security_invoker = true);
alter view public.v_actuals_by_category set (security_invoker = true);
alter view public.v_actuals_by_banner_code set (security_invoker = true);

grant select on public.v_budget_line_totals to authenticated;
grant select on public.v_project_totals to authenticated;
grant select on public.v_project_category_totals to authenticated;
grant select on public.v_organization_totals to authenticated;
grant select on public.v_actuals_by_category to authenticated;
grant select on public.v_actuals_by_banner_code to authenticated;
