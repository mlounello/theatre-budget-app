-- Requested should represent planning-only requests.
-- Budget Hold rows (request_type='request') must not appear in requested totals.

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
        when a.status = 'requested' and a.request_type <> 'request'
          then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as requested_open_total,
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
            when a.status = 'requested'
              then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
    )
  )::numeric(12, 2) as remaining_if_requested_approved,
  coalesce(
    sum(
      case
        when a.status = 'requested' and a.request_type = 'request'
          then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as held_total
from public.project_budget_lines pbl
left join alloc a on a.line_id = pbl.id
group by pbl.id;

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
group by a.project_id, coalesce(ac.code, 'UNASSIGNED'), coalesce(ac.category, 'Unassigned'), coalesce(ac.name, 'Unassigned');

alter view public.v_budget_line_totals set (security_invoker = true);
alter view public.v_actuals_by_category set (security_invoker = true);
alter view public.v_actuals_by_banner_code set (security_invoker = true);

grant select on public.v_budget_line_totals to authenticated;
grant select on public.v_actuals_by_category to authenticated;
grant select on public.v_actuals_by_banner_code to authenticated;
