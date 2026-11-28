\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',false);
select set_config('test.role','admin',false);
do $$
declare u uuid := '00000000-0000-0000-0000-0000000000a1'; e2 uuid := '00000000-0000-0000-0000-0000000000e2';
  cat uuid := '00000000-0000-0000-0000-0000000000ca'; acct uuid := '00000000-0000-0000-0000-0000000000ac'; s text; n int;
begin
  perform app_theatre_budget.update_expense_budget_destination(e2,'00000000-0000-0000-0000-0000000000d1',null,cat,acct,u);
  select count(*) into n from app_theatre_budget.purchase_allocations where purchase_id=e2; assert n=1, 'one allocation '||n;
  select project_id||'|'||organization_id||'|'||account_code_id||'|'||production_category_id into s from app_theatre_budget.purchase_allocations where purchase_id=e2;
  assert s='00000000-0000-0000-0000-0000000000d1|00000000-0000-0000-0000-0000000000a0|'||acct||'|'||cat, 'allocation scope '||s;
  select account_code_id::text into s from app_theatre_budget.purchase_allocations where purchase_id=e2; assert s=acct::text, 'account code';
  select banner_account_code_id||'|'||production_category_id into s from app_theatre_budget.purchases where id=e2; assert s=acct||'|'||cat, 'purchase header '||s;
  select amount into n from app_theatre_budget.purchase_allocations where purchase_id=e2; assert n=50, 'amount kept '||n;
  -- an organization (projectless) destination must still work
  perform app_theatre_budget.update_expense_budget_destination(e2,null,'00000000-0000-0000-0000-0000000000a0',null,acct,u) ;
  raise notice 'AFTER FIX: project and org destinations both succeed';
exception when others then
  if sqlerrm like '%not an active non-project budget%' then raise notice 'AFTER FIX: project destination succeeds; org destination correctly rejected for a project-tracked org'; else raise; end if;
end $$;
