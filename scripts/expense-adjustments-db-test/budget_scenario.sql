\set ON_ERROR_STOP on
-- Seed: project P (org O, FY F) is tracked; a project Expense with a legacy-style allocation
reset role;
insert into app_theatre_budget.projects values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a0');
insert into app_theatre_budget.fiscal_year_organizations values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a0',true,true);
update app_theatre_budget.purchases set project_id='00000000-0000-0000-0000-0000000000d1', organization_id='00000000-0000-0000-0000-0000000000a0' where id='00000000-0000-0000-0000-0000000000e2';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',false);
select set_config('test.role','admin',false);
do $$
declare u uuid := '00000000-0000-0000-0000-0000000000a1'; e2 uuid := '00000000-0000-0000-0000-0000000000e2';
  cat uuid := '00000000-0000-0000-0000-0000000000ca'; acct uuid := '00000000-0000-0000-0000-0000000000ac'; msg text; n int; s text;
begin
  begin
    perform app_theatre_budget.update_expense_budget_destination(e2,'00000000-0000-0000-0000-0000000000d1',null,cat,acct,u);
    raise exception 'expected the original function to fail';
  exception when others then msg := sqlerrm; end;
  assert msg = 'Every PO allocation requires an organization.', 'unexpected result before fix: '||msg;
  raise notice 'BEFORE FIX reproduced: %', msg;
end $$;
