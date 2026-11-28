\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',false);
select set_config('test.role','admin',false);

create or replace function pg_temp.expect_error(p_sql text, p_fragment text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if position(p_fragment in sqlerrm) = 0 then raise exception 'wrong error for [%]: got [%], wanted fragment [%]', p_sql, sqlerrm, p_fragment; end if; return;
  end;
  raise exception 'expected an error containing [%] but none for [%]', p_fragment, p_sql;
end $$;

do $$
declare u uuid := '00000000-0000-0000-0000-0000000000a1'; e1 uuid := '00000000-0000-0000-0000-0000000000e1'; e2 uuid := '00000000-0000-0000-0000-0000000000e2';
  a uuid := '00000000-0000-0000-0000-0000000000aa'; r jsonb; n numeric; s text;
begin
  -- validation
  perform pg_temp.expect_error(format('select app_theatre_budget.adjust_expense_details(%L,%L,%L,%L)', e1,'EX12','x',u), 'EX######');
  perform pg_temp.expect_error(format('select app_theatre_budget.adjust_expense_details(%L,%L,%L,%L)', e1,'EX000002','x',u), 'already used');
  perform pg_temp.expect_error(format('select app_theatre_budget.adjust_expense_details(%L,%L,%L,%L)', e1,'EX000009','',u), 'title');
  perform pg_temp.expect_error(format('select app_theatre_budget.adjust_expense_details(%L,%L,%L,%L)', e1,'EX000009','x','00000000-0000-0000-0000-0000000000a2'), 'signed-in user');

  -- 1 edit details
  r := app_theatre_budget.adjust_expense_details(e1,'ex000009','  Paint corrected ',u);
  assert (r->>'changed')::boolean, 'changed';
  select expense_number||'|'||title into s from app_theatre_budget.purchases where id=e1; assert s='EX000009|Paint corrected', s;
  select note into s from app_theatre_budget.purchase_allocations where purchase_id=e1; assert s='EC000001 / EX000009', 'allocation note '||s;
  r := app_theatre_budget.adjust_expense_details(e1,'EX000009','Paint corrected',u); assert not (r->>'changed')::boolean, 'no-op';

  -- 2 move to a new EC (same card + month), and to an existing one
  perform pg_temp.expect_error(format('select app_theatre_budget.move_expense_to_claim(%L,%L,%L)', e2,'EC000777',u), 'different card');
  perform pg_temp.expect_error(format('select app_theatre_budget.move_expense_to_claim(%L,%L,%L)', e2,'EC12',u), 'EC######');
  r := app_theatre_budget.move_expense_to_claim(e2,'ec000002',u);
  assert (r->>'created_claim')::boolean and (r->>'moved')::boolean, 'created';
  select settled_amount into n from app_theatre_budget.expense_claims where claim_number='EC000001'; assert n=220, 'old claim settled '||n;
  select settled_amount into n from app_theatre_budget.expense_claims where claim_number='EC000002'; assert n=50, 'new claim settled '||n;
  select count(*) into n from app_theatre_budget.expense_claims where claim_number='EC000002' and credit_card_id='00000000-0000-0000-0000-0000000000c1' and claim_month='2026-11-01' and claim_type='monthly_reconciliation'; assert n=1, 'new claim context';
  select reference_number into s from app_theatre_budget.purchases where id=e2; assert s='EC000002', s;
  select note into s from app_theatre_budget.purchase_allocations where purchase_id=e2; assert s='EC000002 / EX000002', s;
  r := app_theatre_budget.move_expense_to_claim(e2,'EC000001',u); assert (r->>'moved')::boolean and not (r->>'created_claim')::boolean, 'move back to existing';
  select settled_amount into n from app_theatre_budget.expense_claims where claim_number='EC000001'; assert n=270, 'merged settled '||n;
  r := app_theatre_budget.move_expense_to_claim(e2,'EC000001',u); assert not (r->>'moved')::boolean, 'same claim no-op';
  perform pg_temp.expect_error(format('select app_theatre_budget.move_expense_to_claim(%L,%L,%L)', a,'EC000001',u), 'actual');

  -- 3 delete restages receipts and recomputes balances
  perform pg_temp.expect_error(format('select app_theatre_budget.delete_expense_restage_receipts(%L,%L)', a,u), 'actual');
  r := app_theatre_budget.delete_expense_restage_receipts(e1,u);
  assert (r->>'restaged_receipts')::int = 1 and (r->>'discarded_receipts')::int = 0, r::text;
  assert not exists (select 1 from app_theatre_budget.purchases where id=e1), 'expense gone';
  select count(*) into n from app_theatre_budget.purchase_receipts where purchase_id=a and cc_statement_month_id is null and amount_received=100; assert n=1, 'receipt restaged to funding request';
  select settled_amount into n from app_theatre_budget.expense_claims where claim_number='EC000001'; assert n=170, 'claim settled after delete '||n;
  select requested_amount into n from app_theatre_budget.purchases where id=a; assert n=250, 'authorization requested '||n;
  select pending_cc_amount into n from app_theatre_budget.purchases where id=a; assert n=250, 'authorization pending (hold) '||n;
  select amount into n from app_theatre_budget.purchase_allocations where purchase_id=a; assert n=250, 'authorization allocation rescaled '||n;
  select settled_amount||'|'||status into s from app_theatre_budget.expense_claims where claim_number='EC000100'; assert s='170.00|approved', 'funding claim '||s;
  select cc_workflow_status into s from app_theatre_budget.purchases where id=a; assert s='requested', s;
  -- released authorization: deleting its Expense restores only that Expense's amount to the hold and keeps it released
  r := app_theatre_budget.delete_expense_restage_receipts('00000000-0000-0000-0000-0000000000e3',u);
  select requested_amount||'|'||pending_cc_amount||'|'||cc_workflow_status into s from app_theatre_budget.purchases where id='00000000-0000-0000-0000-0000000000bb'; assert s='120.00|120.00|receipts_uploaded', 'released hold '||s;
  select amount into n from app_theatre_budget.purchase_allocations where purchase_id='00000000-0000-0000-0000-0000000000bb'; assert n=120, 'released allocation '||n;
  select settled_amount into n from app_theatre_budget.expense_claims where claim_number='EC000100'; assert n=50, 'funding claim settled after second delete '||n;
  assert not exists (select 1 from app_theatre_budget.cc_statement_lines where e1 = any(matched_purchase_ids)), 'statement line cleaned';
  assert exists (select 1 from app_theatre_budget.cc_statement_lines where e2 = any(matched_purchase_ids)), 'other match kept';
  select count(*) into n from app_theatre_budget.expense_adjustments; assert n=5, 'audit rows '||n;
  -- audit of delete survives deletion
  assert exists (select 1 from app_theatre_budget.expense_adjustments where action='delete' and purchase_id=e1 and (details->>'amount')::numeric=100), 'delete audit';

  -- 4 locks: a submitted statement blocks every change
  reset role; update app_theatre_budget.cc_statement_months set posted_at = now(); set role authenticated;
  perform pg_temp.expect_error(format('select app_theatre_budget.adjust_expense_details(%L,%L,%L,%L)', e2,'EX000010','x',u), 'submitted statement');
  perform pg_temp.expect_error(format('select app_theatre_budget.move_expense_to_claim(%L,%L,%L)', e2,'EC000003',u), 'submitted statement');
  perform pg_temp.expect_error(format('select app_theatre_budget.delete_expense_restage_receipts(%L,%L)', e2,u), 'submitted statement');
  reset role; update app_theatre_budget.cc_statement_months set posted_at = null; update app_theatre_budget.purchases set posted_amount = 50, pending_cc_amount = 0, status='posted' where id=e2; set role authenticated;
  perform pg_temp.expect_error(format('select app_theatre_budget.delete_expense_restage_receipts(%L,%L)', e2,u), 'posted or cancelled');

  -- 5 non-managers are rejected
  perform set_config('test.role','viewer',false);
  perform pg_temp.expect_error(format('select app_theatre_budget.adjust_expense_details(%L,%L,%L,%L)', e2,'EX000011','x',u), 'Admin or Project Manager');
  raise notice 'ALL SCENARIO ASSERTIONS PASSED';
end $$;
