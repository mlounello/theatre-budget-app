-- Allow deleting legacy user profiles without breaking historical records.
-- We keep business rows and clear actor references instead of blocking deletes.

alter table public.purchases
  alter column entered_by_user_id drop not null;

alter table public.purchase_events
  alter column changed_by_user_id drop not null;

alter table public.cc_statement_months
  alter column created_by_user_id drop not null;

alter table public.income_lines
  alter column created_by_user_id drop not null;

alter table public.contracts
  alter column entered_by_user_id drop not null;

alter table public.purchase_receipts
  alter column created_by_user_id drop not null;

alter table public.purchases
  drop constraint if exists purchases_entered_by_user_id_fkey,
  add constraint purchases_entered_by_user_id_fkey
    foreign key (entered_by_user_id)
    references public.users (id)
    on delete set null;

alter table public.purchase_events
  drop constraint if exists purchase_events_changed_by_user_id_fkey,
  add constraint purchase_events_changed_by_user_id_fkey
    foreign key (changed_by_user_id)
    references public.users (id)
    on delete set null;

alter table public.cc_statement_months
  drop constraint if exists cc_statement_months_created_by_user_id_fkey,
  add constraint cc_statement_months_created_by_user_id_fkey
    foreign key (created_by_user_id)
    references public.users (id)
    on delete set null;

alter table public.income_lines
  drop constraint if exists income_lines_created_by_user_id_fkey,
  add constraint income_lines_created_by_user_id_fkey
    foreign key (created_by_user_id)
    references public.users (id)
    on delete set null;

alter table public.contracts
  drop constraint if exists contracts_entered_by_user_id_fkey,
  add constraint contracts_entered_by_user_id_fkey
    foreign key (entered_by_user_id)
    references public.users (id)
    on delete set null;

alter table public.purchase_receipts
  drop constraint if exists purchase_receipts_created_by_user_id_fkey,
  add constraint purchase_receipts_created_by_user_id_fkey
    foreign key (created_by_user_id)
    references public.users (id)
    on delete set null;

create or replace function public.reassign_user_references(
  from_user_id uuid,
  to_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if from_user_id is null or to_user_id is null then
    raise exception 'from_user_id and to_user_id are required';
  end if;

  if from_user_id = to_user_id then
    return;
  end if;

  if not exists (select 1 from public.users u where u.id = to_user_id) then
    raise exception 'Replacement user % does not exist in public.users', to_user_id;
  end if;

  update public.purchases
  set entered_by_user_id = to_user_id
  where entered_by_user_id = from_user_id;

  update public.purchase_events
  set changed_by_user_id = to_user_id
  where changed_by_user_id = from_user_id;

  update public.cc_statement_months
  set created_by_user_id = to_user_id
  where created_by_user_id = from_user_id;

  update public.income_lines
  set created_by_user_id = to_user_id
  where created_by_user_id = from_user_id;

  update public.contracts
  set entered_by_user_id = to_user_id
  where entered_by_user_id = from_user_id;

  update public.purchase_receipts
  set created_by_user_id = to_user_id
  where created_by_user_id = from_user_id;
end;
$$;
