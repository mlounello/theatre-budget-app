-- Support split allocations per purchase:
-- - reporting_budget_line_id controls budget reporting bucket (e.g., miscellaneous line)
-- - account_code_id preserves true account code for reconciliation

create table if not exists public.purchase_allocations (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  reporting_budget_line_id uuid not null references public.project_budget_lines (id) on delete restrict,
  account_code_id uuid references public.account_codes (id) on delete set null,
  reporting_bucket text not null default 'direct',
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reporting_bucket in ('direct', 'miscellaneous'))
);

create index if not exists idx_purchase_allocations_purchase_id on public.purchase_allocations (purchase_id);
create index if not exists idx_purchase_allocations_reporting_line on public.purchase_allocations (reporting_budget_line_id);
create index if not exists idx_purchase_allocations_account_code on public.purchase_allocations (account_code_id);

alter table public.purchase_allocations enable row level security;

drop policy if exists "members can read purchase allocations" on public.purchase_allocations;
create policy "members can read purchase allocations"
on public.purchase_allocations
for select
using (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_allocations.purchase_id
      and public.is_project_member(p.project_id)
  )
);

drop policy if exists "buyer pm admin can create purchase allocations" on public.purchase_allocations;
create policy "buyer pm admin can create purchase allocations"
on public.purchase_allocations
for insert
with check (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_allocations.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager','buyer']::public.app_role[])
  )
);

drop policy if exists "pm admin can manage purchase allocations" on public.purchase_allocations;
create policy "pm admin can manage purchase allocations"
on public.purchase_allocations
for all
using (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_allocations.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager']::public.app_role[])
  )
)
with check (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_allocations.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager']::public.app_role[])
  )
);

grant select, insert, update, delete on public.purchase_allocations to authenticated;

-- Backfill existing purchases to one allocation row each.
insert into public.purchase_allocations (
  purchase_id,
  reporting_budget_line_id,
  account_code_id,
  reporting_bucket,
  amount
)
select
  p.id,
  p.budget_line_id,
  pbl.account_code_id,
  'direct',
  case p.status
    when 'encumbered' then p.encumbered_amount
    when 'pending_cc' then p.pending_cc_amount
    when 'posted' then p.posted_amount
    when 'cancelled' then 0
    else p.requested_amount
  end
from public.purchases p
left join public.project_budget_lines pbl on pbl.id = p.budget_line_id
where not exists (
  select 1 from public.purchase_allocations pa where pa.purchase_id = p.id
);

-- Budget totals now aggregate by allocation reporting line.
create or replace view public.v_budget_line_totals as
with alloc_raw as (
  select
    p.id as purchase_id,
    p.project_id,
    p.status,
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
        when a.status = 'requested' then a.requested_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as requested_open_total,
  coalesce(
    sum(
      case
        when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as enc_total,
  coalesce(
    sum(
      case
        when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as pending_cc_total,
  coalesce(
    sum(
      case
        when a.status = 'posted' then a.posted_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as ytd_total,
  (
    coalesce(
      sum(
        case
          when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
          else 0
        end
      ),
      0
    )
    + coalesce(
      sum(
        case
          when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
          else 0
        end
      ),
      0
    )
    + coalesce(
      sum(
        case
          when a.status = 'posted' then a.posted_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
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
            when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'posted' then a.posted_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
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
            when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'posted' then a.posted_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'requested' then a.requested_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
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

-- Pending CC by true account code (for reconciliation), not reporting bucket.
create or replace view public.v_cc_pending_by_code as
with alloc_raw as (
  select
    p.id as purchase_id,
    p.project_id,
    p.status,
    p.pending_cc_amount,
    p.credit_card_id,
    pa.account_code_id,
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
  coalesce(ac.code, 'UNASSIGNED') as budget_code,
  cc.id as credit_card_id,
  cc.nickname as credit_card_name,
  coalesce(
    sum(
      case
        when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total > 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as pending_cc_total
from alloc a
left join public.account_codes ac on ac.id = a.account_code_id
left join public.credit_cards cc on cc.id = a.credit_card_id
group by a.project_id, ac.code, cc.id, cc.nickname;

alter view public.v_budget_line_totals set (security_invoker = true);
alter view public.v_cc_pending_by_code set (security_invoker = true);
