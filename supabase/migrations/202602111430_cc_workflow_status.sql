-- Dedicated credit-card workflow state for UI/process tracking.

alter table public.purchases
add column if not exists cc_workflow_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchases_cc_workflow_status_check'
  ) then
    alter table public.purchases
    add constraint purchases_cc_workflow_status_check
      check (
        cc_workflow_status is null
        or cc_workflow_status in ('requested', 'receipts_uploaded', 'statement_paid', 'posted_to_account')
      );
  end if;
end $$;

update public.purchases p
set cc_workflow_status = case
  when p.is_credit_card = true and p.status = 'posted' then 'posted_to_account'
  when p.is_credit_card = true and p.status = 'pending_cc' and exists (
    select 1 from public.purchase_receipts pr where pr.purchase_id = p.id
  ) then 'receipts_uploaded'
  when p.is_credit_card = true then 'requested'
  else null
end
where p.cc_workflow_status is null;
