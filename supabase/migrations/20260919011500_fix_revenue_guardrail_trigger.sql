-- Phase 4 Gate 2: make the shared revenue guardrail safe across trigger row types.
-- JSON extraction avoids PL/pgSQL record-field binding to the first calling table.

create or replace function app_theatre_budget.reject_new_revenue_spending()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
declare
  v_new_account_code_id uuid;
  v_old_account_code_id uuid;
begin
  if tg_table_name = 'purchase_allocations' then
    v_new_account_code_id := nullif(to_jsonb(new) ->> 'account_code_id', '')::uuid;
  else
    v_new_account_code_id := nullif(to_jsonb(new) ->> 'banner_account_code_id', '')::uuid;
  end if;

  if tg_op = 'UPDATE' then
    if tg_table_name = 'purchase_allocations' then
      v_old_account_code_id := nullif(to_jsonb(old) ->> 'account_code_id', '')::uuid;
    else
      v_old_account_code_id := nullif(to_jsonb(old) ->> 'banner_account_code_id', '')::uuid;
    end if;
  end if;

  if v_new_account_code_id is not null
     and exists (
       select 1
       from app_theatre_budget.account_codes account
       where account.id = v_new_account_code_id
         and account.is_revenue = true
     )
     and (
       tg_op = 'INSERT'
       or v_old_account_code_id is distinct from v_new_account_code_id
     ) then
    raise exception 'Revenue accounts cannot be used for spending.';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
