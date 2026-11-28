-- ROLLED-BACK TRIAL for supabase/migrations/20261128120000_expense_claim_expense_adjustments.sql
-- Usage: in the Supabase SQL Editor, paste (1) "begin;" (2) the full migration file,
-- (3) this file from the line after this header, then run. Nothing is saved: the script ends with ROLLBACK.
-- Replace YOUR_USER_ID with your auth user id (select id from auth.users where email = '...').

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
  v_hold_before text; v_hold_after text;
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
  select format('requested=%s pending=%s workflow=%s allocation=%s', pr.requested_amount, pr.pending_cc_amount, pr.cc_workflow_status,
    (select coalesce(sum(a.amount),0) from app_theatre_budget.purchase_allocations a where a.purchase_id = pr.id)) into v_hold_before
  from app_theatre_budget.purchases pr where pr.id = v_purchase.authorization_purchase_id;
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
  select format('requested=%s pending=%s workflow=%s allocation=%s', pr.requested_amount, pr.pending_cc_amount, pr.cc_workflow_status,
    (select coalesce(sum(a.amount),0) from app_theatre_budget.purchase_allocations a where a.purchase_id = pr.id)) into v_hold_after
  from app_theatre_budget.purchases pr where pr.id = v_purchase.authorization_purchase_id;
  v_out := v_out || format(E'\n3 delete -> %s | expense still exists=%s | staged receipts on funding request now=%s | new claim settled=%s | funding request remaining=%s (was %s)', v_res,
    exists (select 1 from app_theatre_budget.purchases where id = v_purchase.id), v_receipts_staged_after, v_after_settled, v_after_remaining, v_before_remaining);
  v_out := v_out || format(E'\nFunding request hold before: %s\nFunding request hold after : %s', v_hold_before, v_hold_after);
  v_out := v_out || format(E'\nAudit rows written: %s', (select count(*) from app_theatre_budget.expense_adjustments where purchase_id = v_purchase.id));
  perform set_config('t.out', v_out, true);
end $$;

select current_setting('t.out') as trial_result;
rollback;
