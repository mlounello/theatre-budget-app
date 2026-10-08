-- Transfer credit-card budget impact from a funding authorization to the
-- receipt-level monthly expenses when those receipts are finalized.
--
-- No accounting records are removed. The original EC remains the department-
-- facing request and audit record; the monthly EC/EX rows remain the final
-- accounting records. Only the still-unspent authorization remains as a hold.

create table if not exists app_theatre_budget.cc_authorization_budget_transfer_log (
  authorization_purchase_id uuid primary key references app_theatre_budget.purchases(id) on delete restrict,
  previous_requested_amount numeric(12, 2) not null,
  previous_pending_cc_amount numeric(12, 2) not null,
  finalized_expense_total numeric(12, 2) not null,
  corrected_remaining_hold numeric(12, 2) not null,
  corrected_at timestamptz not null default now()
);

alter table app_theatre_budget.cc_authorization_budget_transfer_log enable row level security;

do $migration$
declare
  v_sql text;
begin
  v_sql := pg_get_functiondef(
    'app_theatre_budget.finalize_cc_receipt_batch(uuid,text,jsonb,uuid)'::regprocedure
  );

  if position('pending_cc_amount = v_remaining' in v_sql) = 0 then
    v_sql := replace(
      v_sql,
      'v_remaining := greatest(v_authorization_total - v_reconciled_total, 0);',
      $replacement$v_remaining := case
      when v_authorization.cc_workflow_status = 'receipts_uploaded' then 0
      else greatest(v_authorization_total - v_reconciled_total, 0)
    end;$replacement$
    );

    v_sql := replace(
      v_sql,
      $old$set requested_amount = v_remaining,
        estimated_amount = v_authorization_total,$old$,
      $new$set requested_amount = v_remaining,
        pending_cc_amount = v_remaining,
        estimated_amount = v_authorization_total,$new$
    );

    if position('pending_cc_amount = v_remaining' in v_sql) = 0
      or position('cc_workflow_status = ''receipts_uploaded'' then 0' in v_sql) = 0 then
      raise exception 'Could not safely revise finalize_cc_receipt_batch budget transfer behavior.';
    end if;

    execute v_sql;
  end if;
end;
$migration$;

create temporary table cc_authorization_rebalance on commit drop as
with finalized as (
  select
    authorization_purchase.id as authorization_purchase_id,
    authorization_purchase.requested_amount as previous_requested_amount,
    authorization_purchase.pending_cc_amount as previous_pending_cc_amount,
    coalesce(
      nullif(authorization_purchase.estimated_amount, 0),
      nullif(authorization_purchase.authorized_amount, 0),
      nullif(authorization_purchase.requested_amount, 0),
      nullif(authorization_purchase.pending_cc_amount, 0),
      0
    )::numeric(12, 2) as authorization_total,
    round(sum(actual.pending_cc_amount + actual.posted_amount), 2)::numeric(12, 2) as finalized_expense_total,
    authorization_purchase.cc_workflow_status
  from app_theatre_budget.purchases authorization_purchase
  join app_theatre_budget.purchases actual
    on actual.authorization_purchase_id = authorization_purchase.id
   and actual.status <> 'cancelled'
  group by authorization_purchase.id
)
select
  authorization_purchase_id,
  previous_requested_amount,
  previous_pending_cc_amount,
  finalized_expense_total,
  case
    when cc_workflow_status = 'receipts_uploaded' then 0
    else greatest(authorization_total - finalized_expense_total, 0)
  end::numeric(12, 2) as remaining_hold
from finalized;

insert into app_theatre_budget.cc_authorization_budget_transfer_log (
  authorization_purchase_id,
  previous_requested_amount,
  previous_pending_cc_amount,
  finalized_expense_total,
  corrected_remaining_hold
)
select
  authorization_purchase_id,
  previous_requested_amount,
  previous_pending_cc_amount,
  finalized_expense_total,
  remaining_hold
from cc_authorization_rebalance
on conflict (authorization_purchase_id) do nothing;

update app_theatre_budget.purchases authorization_purchase
set requested_amount = rebalance.remaining_hold,
    pending_cc_amount = rebalance.remaining_hold,
    updated_at = now()
from cc_authorization_rebalance rebalance
where authorization_purchase.id = rebalance.authorization_purchase_id;

with allocation_basis as (
  select
    allocation.id,
    allocation.purchase_id,
    allocation.amount,
    rebalance.remaining_hold,
    row_number() over (partition by allocation.purchase_id order by allocation.id) as allocation_rank,
    count(*) over (partition by allocation.purchase_id) as allocation_count,
    sum(allocation.amount) over (partition by allocation.purchase_id) as previous_total
  from app_theatre_budget.purchase_allocations allocation
  join cc_authorization_rebalance rebalance
    on rebalance.authorization_purchase_id = allocation.purchase_id
), provisional as (
  select
    *,
    case
      when previous_total <> 0 then round(remaining_hold * amount / previous_total, 2)
      else round(remaining_hold / allocation_count, 2)
    end as proportional_amount
  from allocation_basis
), corrected as (
  select
    id,
    case
      when allocation_rank = allocation_count then
        remaining_hold - coalesce(
          sum(case when allocation_rank < allocation_count then proportional_amount else 0 end)
            over (partition by purchase_id),
          0
        )
      else proportional_amount
    end::numeric(12, 2) as corrected_amount
  from provisional
)
update app_theatre_budget.purchase_allocations allocation
set amount = corrected.corrected_amount
from corrected
where allocation.id = corrected.id;

update app_theatre_budget.institutional_budget_commitments commitment
set commitment_status = 'cancelled',
    updated_at = now()
from cc_authorization_rebalance rebalance
where commitment.purchase_id = rebalance.authorization_purchase_id
  and rebalance.remaining_hold = 0;

update app_theatre_budget.institutional_budget_commitments commitment
set commitment_status = 'cancelled',
    updated_at = now()
from cc_authorization_rebalance rebalance
join app_theatre_budget.purchase_allocations allocation
  on allocation.purchase_id = rebalance.authorization_purchase_id
where commitment.purchase_id = rebalance.authorization_purchase_id
  and commitment.purchase_allocation_id = allocation.id
  and rebalance.remaining_hold > 0
  and allocation.amount = 0;

update app_theatre_budget.institutional_budget_commitments commitment
set committed_amount = allocation.amount,
    commitment_status = 'submitted',
    updated_at = now()
from cc_authorization_rebalance rebalance
join app_theatre_budget.purchase_allocations allocation
  on allocation.purchase_id = rebalance.authorization_purchase_id
where commitment.purchase_id = rebalance.authorization_purchase_id
  and commitment.purchase_allocation_id = allocation.id
  and rebalance.remaining_hold > 0
  and allocation.amount <> 0;

update app_theatre_budget.institutional_budget_commitments commitment
set committed_amount = rebalance.remaining_hold,
    commitment_status = 'submitted',
    updated_at = now()
from cc_authorization_rebalance rebalance
where commitment.purchase_id = rebalance.authorization_purchase_id
  and commitment.purchase_allocation_id is null
  and rebalance.remaining_hold > 0;

notify pgrst, 'reload schema';
