begin;
-- Let Admins / Project Managers correct an EX Expense inside a monthly reconciliation EC:
--   1. adjust_expense_details       : correct the EX number and title
--   2. move_expense_to_claim        : detach from the wrong EC and attach to another EC
--                                     (an existing EC, or a new one with the same card and month)
--   3. delete_expense_restage_receipts : delete the EX and return its receipts to the staged pool
-- All functions are security invoker so row-level security still applies, are additive,
-- keep EC settled totals and the funding-request balance consistent, and write an audit row.
-- Posted or submitted-statement Expenses are locked.

create table if not exists app_theatre_budget.expense_adjustments (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('edit_details', 'move_claim', 'delete')),
  purchase_id uuid null,
  expense_number text null,
  from_claim_id uuid null,
  to_claim_id uuid null,
  details jsonb not null default '{}'::jsonb,
  performed_by_user_id uuid not null references app_theatre_budget.users(id) on delete restrict,
  performed_at timestamptz not null default now()
);

alter table app_theatre_budget.expense_adjustments enable row level security;
grant select, insert on app_theatre_budget.expense_adjustments to authenticated;

drop policy if exists expense_adjustments_admin_read on app_theatre_budget.expense_adjustments;
create policy expense_adjustments_admin_read
  on app_theatre_budget.expense_adjustments
  for select to authenticated
  using (app_theatre_budget.is_admin_user());

drop policy if exists expense_adjustments_manager_insert on app_theatre_budget.expense_adjustments;
create policy expense_adjustments_manager_insert
  on app_theatre_budget.expense_adjustments
  for insert to authenticated
  with check (
    performed_by_user_id = auth.uid()
    and app_theatre_budget.get_user_role()::text in ('admin', 'project_manager')
  );

-- Shared guards -----------------------------------------------------------------------

create or replace function app_theatre_budget.assert_expense_actor(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = app_theatre_budget, public, auth
as $$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Expense changes must be made by the signed-in user.';
  end if;
  if app_theatre_budget.get_user_role()::text not in ('admin', 'project_manager') then
    raise exception 'Only an Admin or Project Manager can change an Expense.';
  end if;
end;
$$;

create or replace function app_theatre_budget.assert_expense_unlocked(p_purchase app_theatre_budget.purchases)
returns void
language plpgsql
security invoker
set search_path = app_theatre_budget, public, auth
as $$
declare
  v_statement app_theatre_budget.cc_statement_months%rowtype;
begin
  if p_purchase.posted_amount is distinct from 0 or p_purchase.status in ('posted', 'cancelled') then
    raise exception 'This Expense is already posted or cancelled and can no longer be changed.';
  end if;
  if p_purchase.cc_statement_month_id is not null then
    select * into v_statement
    from app_theatre_budget.cc_statement_months
    where id = p_purchase.cc_statement_month_id;
    if found and (v_statement.posted_at is not null or v_statement.posted_to_banner_at is not null) then
      raise exception 'This Expense belongs to a submitted statement. Reopen the statement before changing it.';
    end if;
  end if;
end;
$$;

-- Totals refresh ----------------------------------------------------------------------

create or replace function app_theatre_budget.refresh_expense_claim_settled(p_claim_id uuid)
returns void
language sql
security invoker
set search_path = app_theatre_budget, public
as $$
  update app_theatre_budget.expense_claims claim
  set settled_amount = (
        select coalesce(sum(purchase.pending_cc_amount + purchase.posted_amount), 0)
        from app_theatre_budget.purchases purchase
        where purchase.expense_claim_id = claim.id and purchase.status <> 'cancelled'
      ),
      updated_at = now()
  where claim.id = p_claim_id;
$$;

create or replace function app_theatre_budget.refresh_card_authorization(p_authorization_id uuid)
returns void
language plpgsql
security invoker
set search_path = app_theatre_budget, public
as $$
declare
  v_authorization app_theatre_budget.purchases%rowtype;
  v_total numeric(12,2);
  v_reconciled numeric(12,2);
  v_remaining numeric(12,2);
  v_claim_total numeric(12,2);
  v_claim_settled numeric(12,2);
begin
  select * into v_authorization
  from app_theatre_budget.purchases
  where id = p_authorization_id
  for update;
  if not found then return; end if;

  v_total := coalesce(nullif(v_authorization.estimated_amount, 0), nullif(v_authorization.authorized_amount, 0),
                      nullif(v_authorization.requested_amount, 0), 0);
  select coalesce(sum(actual.pending_cc_amount + actual.posted_amount), 0)
    into v_reconciled
  from app_theatre_budget.purchases actual
  where actual.authorization_purchase_id = p_authorization_id and actual.status <> 'cancelled';
  v_remaining := greatest(v_total - v_reconciled, 0);

  update app_theatre_budget.purchases
  set requested_amount = v_remaining,
      cc_workflow_status = case
        when v_remaining > 0 and cc_workflow_status = 'receipts_uploaded' then 'requested'
        else cc_workflow_status
      end,
      updated_at = now()
  where id = p_authorization_id;

  if v_authorization.expense_claim_id is not null then
    select coalesce(sum(authz.estimated_amount), 0) into v_claim_total
    from app_theatre_budget.purchases authz
    where authz.expense_claim_id = v_authorization.expense_claim_id and authz.expense_stage = 'authorization';
    select coalesce(sum(actual.pending_cc_amount + actual.posted_amount), 0) into v_claim_settled
    from app_theatre_budget.purchases actual
    where actual.status <> 'cancelled'
      and actual.authorization_purchase_id in (
        select authz.id from app_theatre_budget.purchases authz
        where authz.expense_claim_id = v_authorization.expense_claim_id and authz.expense_stage = 'authorization'
      );
    update app_theatre_budget.expense_claims
    set settled_amount = round(v_claim_settled, 2),
        status = case
          when status in ('approved', 'reconciled') then
            case when v_claim_settled + 0.005 >= v_claim_total then 'reconciled' else 'approved' end
          else status
        end,
        updated_at = now()
    where id = v_authorization.expense_claim_id;
  end if;
end;
$$;

-- 1. Correct EX number / title ---------------------------------------------------------

create or replace function app_theatre_budget.adjust_expense_details(
  p_purchase_id uuid,
  p_expense_number text,
  p_title text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = app_theatre_budget, public, auth
as $$
declare
  v_purchase app_theatre_budget.purchases%rowtype;
  v_number text := upper(btrim(coalesce(p_expense_number, '')));
  v_title text := btrim(coalesce(p_title, ''));
  v_rows integer;
begin
  perform app_theatre_budget.assert_expense_actor(p_user_id);

  select * into v_purchase from app_theatre_budget.purchases where id = p_purchase_id for update;
  if not found or v_purchase.request_type <> 'expense' then
    raise exception 'Expense not found or outside your access scope.';
  end if;
  perform app_theatre_budget.assert_expense_unlocked(v_purchase);

  if v_number !~ '^EX[0-9]{6}$' then
    raise exception 'Expense number must use EX######.';
  end if;
  if v_title = '' or char_length(v_title) > 200 then
    raise exception 'Enter a title of 200 characters or fewer.';
  end if;
  if v_number is distinct from v_purchase.expense_number and exists (
    select 1 from app_theatre_budget.purchases other
    where other.fiscal_year_id = v_purchase.fiscal_year_id
      and other.expense_number = v_number
      and other.id <> v_purchase.id
  ) then
    raise exception 'That EX number is already used by another Expense in this fiscal year.';
  end if;
  if v_number is not distinct from v_purchase.expense_number and v_title is not distinct from v_purchase.title then
    return jsonb_build_object('purchase_id', v_purchase.id, 'expense_number', v_number, 'changed', false);
  end if;

  update app_theatre_budget.purchases
  set expense_number = v_number, title = v_title, updated_at = now()
  where id = v_purchase.id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'You do not have permission to change this Expense.';
  end if;

  update app_theatre_budget.purchase_allocations
  set note = coalesce(v_purchase.reference_number || ' / ', '') || v_number, updated_at = now()
  where purchase_id = v_purchase.id
    and note is not distinct from coalesce(v_purchase.reference_number || ' / ', '') || coalesce(v_purchase.expense_number, 'Expense');

  insert into app_theatre_budget.purchase_events (
    purchase_id, from_status, to_status, estimated_amount_snapshot, requested_amount_snapshot,
    encumbered_amount_snapshot, pending_cc_amount_snapshot, posted_amount_snapshot, changed_by_user_id, note
  ) values (
    v_purchase.id, v_purchase.status, v_purchase.status, v_purchase.estimated_amount, v_purchase.requested_amount,
    v_purchase.encumbered_amount, v_purchase.pending_cc_amount, v_purchase.posted_amount, p_user_id,
    'Expense details corrected: ' || coalesce(v_purchase.expense_number, '-') || ' / ' || coalesce(v_purchase.title, '-')
      || ' -> ' || v_number || ' / ' || v_title
  );

  insert into app_theatre_budget.expense_adjustments (action, purchase_id, expense_number, from_claim_id, to_claim_id, details, performed_by_user_id)
  values ('edit_details', v_purchase.id, v_number, v_purchase.expense_claim_id, v_purchase.expense_claim_id,
    jsonb_build_object('old_expense_number', v_purchase.expense_number, 'old_title', v_purchase.title,
                       'new_expense_number', v_number, 'new_title', v_title), p_user_id);

  return jsonb_build_object('purchase_id', v_purchase.id, 'expense_number', v_number, 'changed', true);
end;
$$;

-- 2. Move to another EC ----------------------------------------------------------------

create or replace function app_theatre_budget.move_expense_to_claim(
  p_purchase_id uuid,
  p_claim_number text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = app_theatre_budget, public, auth
as $$
declare
  v_purchase app_theatre_budget.purchases%rowtype;
  v_source app_theatre_budget.expense_claims%rowtype;
  v_target app_theatre_budget.expense_claims%rowtype;
  v_number text := upper(btrim(coalesce(p_claim_number, '')));
  v_created boolean := false;
  v_rows integer;
begin
  perform app_theatre_budget.assert_expense_actor(p_user_id);
  if v_number !~ '^EC[0-9]{6}$' then
    raise exception 'Expense Claim number must use EC######.';
  end if;

  select * into v_purchase from app_theatre_budget.purchases where id = p_purchase_id for update;
  if not found or v_purchase.request_type <> 'expense' or v_purchase.expense_claim_id is null then
    raise exception 'Expense not found or outside your access scope.';
  end if;
  perform app_theatre_budget.assert_expense_unlocked(v_purchase);
  if v_purchase.expense_stage is distinct from 'actual' then
    raise exception 'Only reconciled (actual) Expenses can be moved between claims.';
  end if;

  select * into v_source from app_theatre_budget.expense_claims where id = v_purchase.expense_claim_id for update;
  if not found or v_source.claim_type <> 'monthly_reconciliation' then
    raise exception 'Expenses can only be moved between Monthly Card Reconciliation claims.';
  end if;
  if v_source.claim_number = v_number then
    return jsonb_build_object('purchase_id', v_purchase.id, 'claim_id', v_source.id, 'claim_number', v_number, 'moved', false);
  end if;

  select * into v_target
  from app_theatre_budget.expense_claims
  where fiscal_year_id = v_source.fiscal_year_id and claim_number = v_number
  for update;

  if found then
    if v_target.claim_type is distinct from v_source.claim_type
       or v_target.credit_card_id is distinct from v_source.credit_card_id
       or v_target.claim_month is distinct from v_source.claim_month
       or v_target.authorization_claim_id is distinct from v_source.authorization_claim_id then
      raise exception 'That EC number belongs to a different card, claim type, or month.';
    end if;
  else
    v_created := true;
    insert into app_theatre_budget.expense_claims (
      fiscal_year_id, project_id, organization_id, credit_card_id, claim_number, claim_type,
      claim_month, status, settled_amount, authorization_claim_id, entered_by_user_id
    ) values (
      v_source.fiscal_year_id, v_source.project_id, v_source.organization_id, v_source.credit_card_id, v_number,
      v_source.claim_type, v_source.claim_month, v_source.status, 0, v_source.authorization_claim_id, p_user_id
    ) returning * into v_target;
  end if;

  update app_theatre_budget.purchases
  set expense_claim_id = v_target.id, reference_number = v_number, updated_at = now()
  where id = v_purchase.id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'You do not have permission to change this Expense.';
  end if;

  update app_theatre_budget.purchase_allocations
  set note = v_number || coalesce(' / ' || v_purchase.expense_number, ''), updated_at = now()
  where purchase_id = v_purchase.id;

  perform app_theatre_budget.refresh_expense_claim_settled(v_source.id);
  perform app_theatre_budget.refresh_expense_claim_settled(v_target.id);

  insert into app_theatre_budget.purchase_events (
    purchase_id, from_status, to_status, estimated_amount_snapshot, requested_amount_snapshot,
    encumbered_amount_snapshot, pending_cc_amount_snapshot, posted_amount_snapshot, changed_by_user_id, note
  ) values (
    v_purchase.id, v_purchase.status, v_purchase.status, v_purchase.estimated_amount, v_purchase.requested_amount,
    v_purchase.encumbered_amount, v_purchase.pending_cc_amount, v_purchase.posted_amount, p_user_id,
    'Expense moved from ' || v_source.claim_number || ' to ' || v_number
  );

  insert into app_theatre_budget.expense_adjustments (action, purchase_id, expense_number, from_claim_id, to_claim_id, details, performed_by_user_id)
  values ('move_claim', v_purchase.id, v_purchase.expense_number, v_source.id, v_target.id,
    jsonb_build_object('from_claim_number', v_source.claim_number, 'to_claim_number', v_number,
                       'created_target', v_created, 'amount', v_purchase.pending_cc_amount + v_purchase.posted_amount), p_user_id);

  return jsonb_build_object(
    'purchase_id', v_purchase.id, 'claim_id', v_target.id, 'claim_number', v_number,
    'from_claim_number', v_source.claim_number, 'created_claim', v_created, 'moved', true
  );
end;
$$;

-- 3. Delete the EX and return its receipts to the staged pool --------------------------

create or replace function app_theatre_budget.delete_expense_restage_receipts(
  p_purchase_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = app_theatre_budget, public, auth
as $$
declare
  v_purchase app_theatre_budget.purchases%rowtype;
  v_claim app_theatre_budget.expense_claims%rowtype;
  v_restaged integer := 0;
  v_discarded integer := 0;
  v_rows integer;
begin
  perform app_theatre_budget.assert_expense_actor(p_user_id);

  select * into v_purchase from app_theatre_budget.purchases where id = p_purchase_id for update;
  if not found or v_purchase.request_type <> 'expense' or v_purchase.expense_claim_id is null then
    raise exception 'Expense not found or outside your access scope.';
  end if;
  perform app_theatre_budget.assert_expense_unlocked(v_purchase);
  if v_purchase.expense_stage is distinct from 'actual' then
    raise exception 'Only reconciled (actual) Expenses can be deleted here. Funding requests are managed from Procurement.';
  end if;

  select * into v_claim from app_theatre_budget.expense_claims where id = v_purchase.expense_claim_id for update;
  if not found or v_claim.claim_type <> 'monthly_reconciliation' then
    raise exception 'Expenses can only be deleted from Monthly Card Reconciliation claims.';
  end if;

  if v_purchase.authorization_purchase_id is not null then
    -- Receipts were staged against the funding request; put them back so they can be corrected and re-finalized.
    update app_theatre_budget.purchase_receipts
    set purchase_id = v_purchase.authorization_purchase_id, cc_statement_month_id = null
    where purchase_id = v_purchase.id;
    get diagnostics v_restaged = row_count;
  else
    select count(*) into v_discarded from app_theatre_budget.purchase_receipts where purchase_id = v_purchase.id;
  end if;

  update app_theatre_budget.cc_statement_lines
  set matched_purchase_ids = array_remove(matched_purchase_ids, v_purchase.id)
  where v_purchase.id = any(matched_purchase_ids);

  insert into app_theatre_budget.expense_adjustments (action, purchase_id, expense_number, from_claim_id, to_claim_id, details, performed_by_user_id)
  values ('delete', v_purchase.id, v_purchase.expense_number, v_claim.id, null,
    jsonb_build_object('claim_number', v_claim.claim_number, 'title', v_purchase.title,
                       'amount', v_purchase.pending_cc_amount + v_purchase.posted_amount,
                       'restaged_receipts', v_restaged, 'discarded_receipts', v_discarded,
                       'authorization_purchase_id', v_purchase.authorization_purchase_id), p_user_id);

  delete from app_theatre_budget.purchases where id = v_purchase.id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'You do not have permission to delete this Expense.';
  end if;

  perform app_theatre_budget.refresh_expense_claim_settled(v_claim.id);
  if v_purchase.authorization_purchase_id is not null then
    perform app_theatre_budget.refresh_card_authorization(v_purchase.authorization_purchase_id);
  end if;

  return jsonb_build_object(
    'claim_id', v_claim.id, 'claim_number', v_claim.claim_number, 'expense_number', v_purchase.expense_number,
    'restaged_receipts', v_restaged, 'discarded_receipts', v_discarded,
    'authorization_purchase_id', v_purchase.authorization_purchase_id
  );
end;
$$;

revoke all on function app_theatre_budget.assert_expense_actor(uuid) from public;
revoke all on function app_theatre_budget.assert_expense_unlocked(app_theatre_budget.purchases) from public;
revoke all on function app_theatre_budget.refresh_expense_claim_settled(uuid) from public;
revoke all on function app_theatre_budget.refresh_card_authorization(uuid) from public;
revoke all on function app_theatre_budget.adjust_expense_details(uuid, text, text, uuid) from public;
revoke all on function app_theatre_budget.move_expense_to_claim(uuid, text, uuid) from public;
revoke all on function app_theatre_budget.delete_expense_restage_receipts(uuid, uuid) from public;

grant execute on function app_theatre_budget.assert_expense_actor(uuid) to authenticated;
grant execute on function app_theatre_budget.assert_expense_unlocked(app_theatre_budget.purchases) to authenticated;
grant execute on function app_theatre_budget.refresh_expense_claim_settled(uuid) to authenticated;
grant execute on function app_theatre_budget.refresh_card_authorization(uuid) to authenticated;
grant execute on function app_theatre_budget.adjust_expense_details(uuid, text, text, uuid) to authenticated;
grant execute on function app_theatre_budget.move_expense_to_claim(uuid, text, uuid) to authenticated;
grant execute on function app_theatre_budget.delete_expense_restage_receipts(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';


set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"YOUR_USER_ID","role":"authenticated"}', true);
set local statement_timeout = '120s';

do $$
declare
  v_user uuid := 'YOUR_USER_ID'::uuid;
  v_purchase app_theatre_budget.purchases%rowtype;
  v_claim app_theatre_budget.expense_claims%rowtype;
  v_out text := '';
  v_res jsonb;
  v_before_settled numeric; v_after_settled numeric;
  v_before_remaining numeric; v_after_remaining numeric;
  v_receipts_before int; v_receipts_staged_after int; v_total_receipts_after int;
  v_new_claim uuid;
begin
  -- Pick the newest unlocked reconciled Expense you can see
  select p.* into v_purchase
  from app_theatre_budget.purchases p
  join app_theatre_budget.expense_claims c on c.id = p.expense_claim_id
  left join app_theatre_budget.cc_statement_months s on s.id = p.cc_statement_month_id
  where p.request_type = 'expense' and p.expense_stage = 'actual'
    and c.claim_type = 'monthly_reconciliation'
    and p.posted_amount = 0 and p.status not in ('posted', 'cancelled')
    and (s.id is null or (s.posted_at is null and s.posted_to_banner_at is null))
  order by p.created_at desc limit 1;
  if not found then
    perform set_config('t.out', 'No unlocked reconciled Expense is visible (all belong to submitted statements). Reopen a statement or use a newer month.', true);
    return;
  end if;
  select * into v_claim from app_theatre_budget.expense_claims where id = v_purchase.expense_claim_id;
  v_out := format('Chosen: %s in %s (%s), amount %s', v_purchase.expense_number, v_claim.claim_number, v_purchase.title, v_purchase.pending_cc_amount);

  select count(*) into v_receipts_before from app_theatre_budget.purchase_receipts where purchase_id = v_purchase.id;
  select settled_amount into v_before_settled from app_theatre_budget.expense_claims where id = v_claim.id;
  select requested_amount into v_before_remaining from app_theatre_budget.purchases where id = v_purchase.authorization_purchase_id;
  v_out := v_out || format(E'\nBefore: claim settled=%s, funding request remaining=%s, receipts on expense=%s', v_before_settled, v_before_remaining, v_receipts_before);

  -- 1. Edit details
  v_res := app_theatre_budget.adjust_expense_details(v_purchase.id, 'EX999991', 'Trial title', v_user);
  v_out := v_out || format(E'\n1 edit details -> %s | now number=%s title=%s', v_res,
    (select expense_number from app_theatre_budget.purchases where id = v_purchase.id),
    (select title from app_theatre_budget.purchases where id = v_purchase.id));

  -- 2. Move to a brand-new EC (same card and month)
  v_res := app_theatre_budget.move_expense_to_claim(v_purchase.id, 'EC999991', v_user);
  select expense_claim_id into v_new_claim from app_theatre_budget.purchases where id = v_purchase.id;
  v_out := v_out || format(E'\n2 move -> %s | new claim card same=%s month same=%s settled old=%s new=%s', v_res,
    (select credit_card_id is not distinct from v_claim.credit_card_id from app_theatre_budget.expense_claims where id = v_new_claim),
    (select claim_month is not distinct from v_claim.claim_month from app_theatre_budget.expense_claims where id = v_new_claim),
    (select settled_amount from app_theatre_budget.expense_claims where id = v_claim.id),
    (select settled_amount from app_theatre_budget.expense_claims where id = v_new_claim));

  -- 3. Delete and re-stage receipts
  v_res := app_theatre_budget.delete_expense_restage_receipts(v_purchase.id, v_user);
  select count(*) into v_receipts_staged_after from app_theatre_budget.purchase_receipts
    where purchase_id = v_purchase.authorization_purchase_id and cc_statement_month_id is null and authorization_purchase_id = v_purchase.authorization_purchase_id;
  select settled_amount into v_after_settled from app_theatre_budget.expense_claims where id = v_new_claim;
  select requested_amount into v_after_remaining from app_theatre_budget.purchases where id = v_purchase.authorization_purchase_id;
  v_out := v_out || format(E'\n3 delete -> %s | expense still exists=%s | staged receipts on funding request now=%s | new claim settled=%s | funding request remaining=%s (was %s)', v_res,
    exists (select 1 from app_theatre_budget.purchases where id = v_purchase.id), v_receipts_staged_after, v_after_settled, v_after_remaining, v_before_remaining);
  v_out := v_out || format(E'\nAudit rows written: %s', (select count(*) from app_theatre_budget.expense_adjustments where purchase_id = v_purchase.id));
  perform set_config('t.out', v_out, true);
end $$;

select current_setting('t.out') as trial_result;
rollback;
