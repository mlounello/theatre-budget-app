-- One-time procurement/purchase import script
-- 1) Upload your CSV to public.stg_procurement_import in Supabase Table Editor.
-- 2) Set the importer user id below.
-- 3) Run this script.

create table if not exists public.stg_procurement_import (
  project_name text,
  season text,
  title text,
  vendor_name text,
  reference_number text,
  requisition_number text,
  po_number text,
  invoice_number text,
  budget_tracked boolean,
  budget_code text,
  line_name text,
  procurement_status text,
  budget_status text,
  estimated_amount numeric,
  requested_amount numeric,
  encumbered_amount numeric,
  pending_cc_amount numeric,
  posted_amount numeric,
  ordered_on date,
  received_on date,
  paid_on date,
  notes text,
  org text
);

-- Replace with your user id from auth/users table.
with importer as (
  select '3134b593-cef5-49d7-b254-4a5088f823cb'::uuid as user_id
),
vendor_upsert as (
  insert into public.vendors (name)
  select distinct trim(vendor_name)
  from public.stg_procurement_import
  where coalesce(trim(vendor_name), '') <> ''
  on conflict (name) do nothing
),
resolved as (
  select
    s.*,
    org_match.id as organization_id,
    project_match.id as project_id,
    v.id as vendor_id,
    pbl.id as budget_line_id,
    pbl.account_code_id,
    lower(replace(coalesce(trim(s.procurement_status), ''), ' ', '_')) as procurement_status_raw,
    lower(replace(coalesce(trim(s.budget_status), ''), ' ', '_')) as budget_status_raw
  from public.stg_procurement_import s
  left join public.organizations org_match
    on lower(coalesce(org_match.org_code, '')) = lower(coalesce(trim(s.org), ''))
    or lower(coalesce(org_match.name, '')) = lower(coalesce(trim(s.org), ''))
  left join lateral (
    select p.id
    from public.projects p
    where
      (
        (coalesce(trim(s.project_name), '') <> '' and lower(p.name) = lower(trim(s.project_name)))
        or (
          coalesce(trim(s.project_name), '') = ''
          and org_match.id is not null
          and p.organization_id = org_match.id
        )
      )
      and coalesce(lower(p.season), '') = coalesce(lower(trim(s.season)), '')
    order by p.sort_order asc nulls last, p.name asc
    limit 1
  ) project_match on true
  left join public.vendors v
    on lower(v.name) = lower(coalesce(s.vendor_name, ''))
  left join public.project_budget_lines pbl
    on pbl.project_id = project_match.id
   and pbl.budget_code = coalesce(s.budget_code, '')
   and (
     coalesce(trim(s.line_name), '') = ''
     or lower(pbl.line_name) = lower(s.line_name)
   )
),
normalized as (
  select
    r.*,
    coalesce(trim(r.title), '') as title_trim,
    coalesce(r.budget_tracked, true) as requested_budget_tracked,
    case
      when coalesce(r.budget_tracked, true) and r.budget_line_id is not null then true
      else false
    end as budget_tracked_final,
    coalesce(r.estimated_amount, 0) as estimated_amount_final,
    coalesce(r.requested_amount, 0) as requested_amount_final,
    coalesce(r.encumbered_amount, 0) as encumbered_amount_final,
    coalesce(r.pending_cc_amount, 0) as pending_cc_amount_final,
    coalesce(r.posted_amount, 0) as posted_amount_final
  from resolved r
),
status_mapped as (
  select
    n.*,
    case
      when n.procurement_status_raw in ('requested','ordered','partial_received','fully_received','invoice_sent','invoice_received','paid','cancelled') then n.procurement_status_raw
      when n.procurement_status_raw = 'partially_received' then 'partial_received'
      when n.procurement_status_raw = 'fullyreceived' then 'fully_received'
      when n.procurement_status_raw = 'invoicesent' then 'invoice_sent'
      when n.procurement_status_raw = 'invoicereceived' then 'invoice_received'
      when n.procurement_status_raw = 'canceled' then 'cancelled'
      when n.posted_amount_final > 0 then 'paid'
      when n.pending_cc_amount_final > 0 then 'invoice_received'
      when n.encumbered_amount_final > 0 then 'ordered'
      else 'requested'
    end as procurement_status_final,
    case
      when n.budget_status_raw in ('requested','encumbered','pending_cc','posted','cancelled') then n.budget_status_raw
      when n.budget_status_raw in ('paid','fully_received','invoice_received') then 'posted'
      when n.budget_status_raw in ('invoice_sent','ordered','partial_received') then
        case
          when n.pending_cc_amount_final > 0 then 'pending_cc'
          when n.encumbered_amount_final > 0 then 'encumbered'
          when n.posted_amount_final > 0 then 'posted'
          else 'encumbered'
        end
      when n.budget_status_raw in ('canceled') then 'cancelled'
      else
        case
          when n.posted_amount_final > 0 then 'posted'
          when n.pending_cc_amount_final > 0 then 'pending_cc'
          when n.encumbered_amount_final > 0 then 'encumbered'
          else 'requested'
        end
    end as budget_status_final
  from normalized n
),
ins as (
  insert into public.purchases (
    project_id,
    budget_line_id,
    budget_tracked,
    entered_by_user_id,
    title,
    vendor_id,
    reference_number,
    requisition_number,
    po_number,
    invoice_number,
    notes,
    procurement_status,
    status,
    estimated_amount,
    requested_amount,
    encumbered_amount,
    pending_cc_amount,
    posted_amount,
    ordered_on,
    received_on,
    paid_on,
    posted_date
  )
  select
    r.project_id,
    case when r.budget_tracked_final then r.budget_line_id else null end,
    r.budget_tracked_final,
    i.user_id,
    coalesce(nullif(r.title_trim, ''), nullif(trim(r.vendor_name), ''), nullif(trim(r.reference_number), ''), 'Imported Purchase'),
    r.vendor_id,
    nullif(trim(r.reference_number), ''),
    nullif(trim(r.requisition_number), ''),
    nullif(trim(r.po_number), ''),
    nullif(trim(r.invoice_number), ''),
    nullif(trim(r.notes), ''),
    r.procurement_status_final,
    r.budget_status_final::public.purchase_status,
    r.estimated_amount_final,
    r.requested_amount_final,
    r.encumbered_amount_final,
    r.pending_cc_amount_final,
    r.posted_amount_final,
    r.ordered_on,
    r.received_on,
    r.paid_on,
    case
      when r.budget_status_final = 'posted' then coalesce(r.paid_on, r.received_on, current_date)
      else null
    end
  from status_mapped r
  cross join importer i
  where r.project_id is not null
  returning id, budget_tracked, budget_line_id, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, status
)
insert into public.purchase_allocations (
  purchase_id,
  reporting_budget_line_id,
  account_code_id,
  amount,
  reporting_bucket
)
select
  ins.id,
  ins.budget_line_id,
  pbl.account_code_id,
  case
    when ins.status = 'encumbered' then ins.encumbered_amount
    when ins.status = 'pending_cc' then ins.pending_cc_amount
    when ins.status = 'posted' then ins.posted_amount
    else ins.requested_amount
  end,
  'direct'
from ins
join public.project_budget_lines pbl on pbl.id = ins.budget_line_id
where ins.budget_tracked = true
  and ins.budget_line_id is not null;

-- Optional: add one initial event per imported purchase from this run window.
-- Adjust interval if needed.
with importer as (
  select '3134b593-cef5-49d7-b254-4a5088f823cb'::uuid as user_id
)
insert into public.purchase_events (
  purchase_id,
  from_status,
  to_status,
  estimated_amount_snapshot,
  requested_amount_snapshot,
  encumbered_amount_snapshot,
  pending_cc_amount_snapshot,
  posted_amount_snapshot,
  changed_by_user_id,
  note
)
select
  p.id,
  null,
  p.status,
  p.estimated_amount,
  p.requested_amount,
  p.encumbered_amount,
  p.pending_cc_amount,
  p.posted_amount,
  i.user_id,
  'Imported catch-up data'
from public.purchases p
cross join importer i
where p.created_at > now() - interval '2 hours';
