-- Apply a validated bulk procurement edit atomically.
--
-- Previously the application updated each purchase, deleted its allocations, and
-- re-inserted the allocation as separate statements, one row at a time. A failure
-- part-way through left earlier rows committed and could leave a purchase with no
-- allocation. This function performs the same statements for the whole batch in a
-- single transaction, so the batch is all-or-nothing.
--
-- SECURITY INVOKER on purpose: every existing RLS policy and validation trigger
-- on purchases / purchase_allocations still applies to the calling user exactly as
-- it did for the individual statements. This function grants no new access.
--
-- Not covered (remains in the application): institutional commitment sync, which
-- runs after this call, and all validation/planning, which happens before it.
--
-- p_rows is an array of:
--   { "purchase_id": uuid,
--     "purchase":   { <all 24 columns listed in c_purchase_keys; null is explicit> },
--     "allocation": { project_id, reporting_budget_line_id, organization_id,
--                     account_code_id, production_category_id, amount,
--                     reporting_bucket } | null }
-- A null/absent allocation means the purchase ends with no allocation row, which
-- matches the previous delete-then-optionally-insert behavior.

create or replace function app_theatre_budget.apply_procurement_bulk_update(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = app_theatre_budget, public
as $$
declare
  c_purchase_keys constant text[] := array[
    'project_id', 'organization_id', 'budget_tracked', 'budget_line_id',
    'production_category_id', 'banner_account_code_id', 'procurement_status', 'status',
    'reference_number', 'requisition_number', 'po_number', 'invoice_number',
    'vendor_id', 'notes', 'ordered_on', 'received_on', 'paid_on',
    'estimated_amount', 'requested_amount', 'encumbered_amount',
    'pending_cc_amount', 'posted_amount', 'posted_date', 'cc_workflow_status'
  ];
  v_row jsonb;
  v_purchase_id uuid;
  v_updated_id uuid;
  v_count integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one procurement row is required.';
  end if;

  if (select count(distinct elem ->> 'purchase_id') from jsonb_array_elements(p_rows) elem)
     <> jsonb_array_length(p_rows) then
    raise exception 'Each purchase may appear only once in a bulk update.';
  end if;

  -- Lock in a stable order so two concurrent bulk edits cannot deadlock each other.
  perform 1
  from app_theatre_budget.purchases
  where id in (select (elem ->> 'purchase_id')::uuid from jsonb_array_elements(p_rows) elem)
  order by id
  for update;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_purchase_id := (v_row ->> 'purchase_id')::uuid;
    if v_purchase_id is null then
      raise exception 'Every bulk update row requires a purchase_id.';
    end if;
    -- Guard against a missing key silently nulling a column.
    if not coalesce(v_row -> 'purchase' ?& c_purchase_keys, false) then
      raise exception 'Bulk update for purchase % is missing required fields.', v_purchase_id;
    end if;

    update app_theatre_budget.purchases p
    set project_id = r.project_id,
        organization_id = r.organization_id,
        budget_tracked = r.budget_tracked,
        budget_line_id = r.budget_line_id,
        production_category_id = r.production_category_id,
        banner_account_code_id = r.banner_account_code_id,
        procurement_status = r.procurement_status,
        status = r.status,
        reference_number = r.reference_number,
        requisition_number = r.requisition_number,
        po_number = r.po_number,
        invoice_number = r.invoice_number,
        vendor_id = r.vendor_id,
        notes = r.notes,
        ordered_on = r.ordered_on,
        received_on = r.received_on,
        paid_on = r.paid_on,
        estimated_amount = r.estimated_amount,
        requested_amount = r.requested_amount,
        encumbered_amount = r.encumbered_amount,
        pending_cc_amount = r.pending_cc_amount,
        posted_amount = r.posted_amount,
        posted_date = r.posted_date,
        cc_workflow_status = r.cc_workflow_status
    from jsonb_populate_record(null::app_theatre_budget.purchases, v_row -> 'purchase') r
    where p.id = v_purchase_id
    returning p.id into v_updated_id;

    -- RLS hides rows the caller cannot update, so this also catches "not permitted".
    if v_updated_id is null then
      raise exception 'A procurement row update was not applied.';
    end if;

    delete from app_theatre_budget.purchase_allocations where purchase_id = v_purchase_id;

    if jsonb_typeof(v_row -> 'allocation') = 'object' then
      insert into app_theatre_budget.purchase_allocations (
        purchase_id, project_id, reporting_budget_line_id, organization_id,
        account_code_id, production_category_id, amount, reporting_bucket
      )
      select v_purchase_id, a.project_id, a.reporting_budget_line_id, a.organization_id,
             a.account_code_id, a.production_category_id, a.amount, a.reporting_bucket
      from jsonb_populate_record(null::app_theatre_budget.purchase_allocations, v_row -> 'allocation') a;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function app_theatre_budget.apply_procurement_bulk_update(jsonb) from public, anon;
grant execute on function app_theatre_budget.apply_procurement_bulk_update(jsonb) to authenticated;
