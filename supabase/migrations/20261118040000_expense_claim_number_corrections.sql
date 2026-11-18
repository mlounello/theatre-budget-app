-- Correct a mistyped EC number atomically. If the destination EC already exists
-- in the same fiscal year with matching claim context, merge the EX expenses into
-- it and retain an audit record of the superseded claim.

create table if not exists app_theatre_budget.expense_claim_number_corrections (
  id uuid primary key default gen_random_uuid(),
  source_claim_id uuid not null,
  source_claim_number text not null,
  target_claim_id uuid not null,
  target_claim_number text not null,
  merged boolean not null,
  moved_purchase_ids uuid[] not null default '{}',
  corrected_by_user_id uuid not null references app_theatre_budget.users(id) on delete restrict,
  corrected_at timestamptz not null default now()
);

alter table app_theatre_budget.expense_claim_number_corrections enable row level security;
grant select on app_theatre_budget.expense_claim_number_corrections to authenticated;

drop policy if exists expense_claim_number_corrections_admin_read
  on app_theatre_budget.expense_claim_number_corrections;
create policy expense_claim_number_corrections_admin_read
  on app_theatre_budget.expense_claim_number_corrections
  for select to authenticated
  using (app_theatre_budget.is_admin_user());

create or replace function app_theatre_budget.correct_expense_claim_number(
  p_claim_id uuid,
  p_new_claim_number text
)
returns jsonb
language plpgsql
security definer
set search_path = app_theatre_budget, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_new_claim_number text := upper(btrim(coalesce(p_new_claim_number, '')));
  v_source app_theatre_budget.expense_claims%rowtype;
  v_target app_theatre_budget.expense_claims%rowtype;
  v_purchase_ids uuid[] := '{}';
  v_moved_count integer := 0;
  v_settled numeric(12,2);
  v_authorized numeric(12,2);
begin
  if v_actor_id is null then
    raise exception 'You must be signed in.';
  end if;
  if app_theatre_budget.get_user_role() <> 'admin' then
    raise exception 'Only an Admin can correct an Expense Claim number.';
  end if;
  if v_new_claim_number !~ '^EC[0-9]{6}$' then
    raise exception 'Expense Claim number must use EC######.';
  end if;

  select * into v_source
  from app_theatre_budget.expense_claims
  where id = p_claim_id
  for update;
  if not found then
    raise exception 'Expense Claim not found.';
  end if;

  select coalesce(array_agg(purchase.id order by purchase.created_at), '{}'), count(*)
    into v_purchase_ids, v_moved_count
  from app_theatre_budget.purchases purchase
  where purchase.expense_claim_id = v_source.id;

  if v_source.claim_number = v_new_claim_number then
    return jsonb_build_object(
      'claim_id', v_source.id,
      'claim_number', v_source.claim_number,
      'merged', false,
      'moved_expense_count', 0
    );
  end if;

  select * into v_target
  from app_theatre_budget.expense_claims
  where fiscal_year_id = v_source.fiscal_year_id
    and claim_number = v_new_claim_number
  for update;

  if not found then
    update app_theatre_budget.expense_claims
    set claim_number = v_new_claim_number,
        updated_at = now()
    where id = v_source.id;

    update app_theatre_budget.purchases
    set reference_number = v_new_claim_number,
        updated_at = now()
    where expense_claim_id = v_source.id;

    update app_theatre_budget.purchase_allocations allocation
    set note = v_new_claim_number || case
      when purchase.expense_number is not null then ' / ' || purchase.expense_number
      else ''
    end,
        updated_at = now()
    from app_theatre_budget.purchases purchase
    where allocation.purchase_id = purchase.id
      and purchase.expense_claim_id = v_source.id;

    insert into app_theatre_budget.expense_claim_number_corrections (
      source_claim_id, source_claim_number, target_claim_id, target_claim_number,
      merged, moved_purchase_ids, corrected_by_user_id
    ) values (
      v_source.id, v_source.claim_number, v_source.id, v_new_claim_number,
      false, v_purchase_ids, v_actor_id
    );

    return jsonb_build_object(
      'claim_id', v_source.id,
      'claim_number', v_new_claim_number,
      'merged', false,
      'moved_expense_count', v_moved_count
    );
  end if;

  if v_target.id = v_source.id then
    return jsonb_build_object(
      'claim_id', v_target.id,
      'claim_number', v_target.claim_number,
      'merged', false,
      'moved_expense_count', 0
    );
  end if;
  if v_target.claim_type is distinct from v_source.claim_type
     or v_target.credit_card_id is distinct from v_source.credit_card_id
     or v_target.claim_month is distinct from v_source.claim_month
     or v_target.authorization_claim_id is distinct from v_source.authorization_claim_id then
    raise exception 'That EC number belongs to a different card, claim type, month, or funding request.';
  end if;

  update app_theatre_budget.expense_claims
  set authorization_claim_id = v_target.id,
      updated_at = now()
  where authorization_claim_id = v_source.id;

  update app_theatre_budget.purchases
  set expense_claim_id = v_target.id,
      reference_number = v_new_claim_number,
      updated_at = now()
  where expense_claim_id = v_source.id;

  update app_theatre_budget.purchase_allocations allocation
  set note = v_new_claim_number || case
    when purchase.expense_number is not null then ' / ' || purchase.expense_number
    else ''
  end,
      updated_at = now()
  from app_theatre_budget.purchases purchase
  where allocation.purchase_id = purchase.id
    and purchase.expense_claim_id = v_target.id;

  if v_target.claim_type = 'funding_request' then
    select coalesce(sum(purchase.estimated_amount), 0)
      into v_authorized
    from app_theatre_budget.purchases purchase
    where purchase.expense_claim_id = v_target.id
      and purchase.status <> 'cancelled';
    select coalesce(sum(claim.settled_amount), 0)
      into v_settled
    from app_theatre_budget.expense_claims claim
    where claim.authorization_claim_id = v_target.id
      and claim.status <> 'cancelled';
  else
    v_authorized := coalesce(v_target.authorized_amount, v_source.authorized_amount);
    select coalesce(sum(purchase.estimated_amount), 0)
      into v_settled
    from app_theatre_budget.purchases purchase
    where purchase.expense_claim_id = v_target.id
      and purchase.status <> 'cancelled';
  end if;

  update app_theatre_budget.expense_claims
  set authorized_amount = v_authorized,
      settled_amount = v_settled,
      overage_explanation = coalesce(overage_explanation, v_source.overage_explanation),
      notes = case
        when nullif(btrim(notes), '') is null then v_source.notes
        when nullif(btrim(v_source.notes), '') is null or notes = v_source.notes then notes
        else notes || E'\n' || v_source.notes
      end,
      updated_at = now()
  where id = v_target.id;

  insert into app_theatre_budget.expense_claim_number_corrections (
    source_claim_id, source_claim_number, target_claim_id, target_claim_number,
    merged, moved_purchase_ids, corrected_by_user_id
  ) values (
    v_source.id, v_source.claim_number, v_target.id, v_target.claim_number,
    true, v_purchase_ids, v_actor_id
  );

  delete from app_theatre_budget.expense_claims
  where id = v_source.id;

  return jsonb_build_object(
    'claim_id', v_target.id,
    'claim_number', v_target.claim_number,
    'merged', true,
    'moved_expense_count', v_moved_count
  );
end;
$$;

revoke all on function app_theatre_budget.correct_expense_claim_number(uuid,text) from public;
grant execute on function app_theatre_budget.correct_expense_claim_number(uuid,text) to authenticated;

notify pgrst, 'reload schema';
