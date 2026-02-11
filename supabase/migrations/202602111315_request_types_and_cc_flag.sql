-- Request classification for workflows:
-- requisition (PO), expense (CC/reimbursement), contract (check request)

alter table public.purchases
add column if not exists request_type text not null default 'requisition',
add column if not exists is_credit_card boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchases_request_type_check'
  ) then
    alter table public.purchases
    add constraint purchases_request_type_check
      check (request_type in ('requisition', 'expense', 'contract'));
  end if;
end $$;
