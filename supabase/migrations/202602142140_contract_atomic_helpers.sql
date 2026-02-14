-- Atomic helpers for contract bulk create/delete to avoid partial writes.

create or replace function public.create_contracts_bulk(
  p_project_id uuid,
  p_fiscal_year_id uuid default null,
  p_organization_id uuid default null,
  p_banner_account_code_id uuid default null,
  p_rows jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_misc_category_id uuid;
  v_reporting_budget_line_id uuid;
  v_row jsonb;
  v_count integer := 0;
  v_contract_id uuid;
  v_purchase_id uuid;
  v_contractor_name text;
  v_contract_value_text text;
  v_contract_value numeric;
  v_installment_count integer;
  v_installment_amount numeric;
  v_installment_number integer;
  v_total_cents bigint;
  v_base_cents bigint;
  v_remainder bigint;
  v_bump integer;
  v_resolved_fiscal_year_id uuid;
  v_resolved_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be authenticated.';
  end if;

  if p_project_id is null then
    raise exception 'Project is required.';
  end if;

  if p_banner_account_code_id is null then
    raise exception 'Banner account code is required.';
  end if;

  if not public.has_project_role(p_project_id, array['admin','project_manager']::public.app_role[]) then
    raise exception 'Only Admin or Project Manager can manage contracts.';
  end if;

  select id, fiscal_year_id, organization_id
  into v_project
  from public.projects
  where id = p_project_id;

  if not found then
    raise exception 'Project not found.';
  end if;

  v_resolved_fiscal_year_id := coalesce(p_fiscal_year_id, v_project.fiscal_year_id);
  v_resolved_organization_id := coalesce(p_organization_id, v_project.organization_id);

  select id
  into v_misc_category_id
  from public.production_categories
  where lower(name) = lower('Miscellaneous')
  order by active desc, sort_order asc, name asc
  limit 1;

  if v_misc_category_id is null then
    raise exception 'Production category ''Miscellaneous'' is required for contract reporting.';
  end if;

  select public.ensure_project_category_line(p_project_id, v_misc_category_id)
  into v_reporting_budget_line_id;

  if v_reporting_budget_line_id is null then
    raise exception 'Could not resolve reporting line.';
  end if;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_contractor_name := trim(coalesce(v_row ->> 'contractorName', ''));
    v_contract_value_text := trim(coalesce(v_row ->> 'contractValue', ''));

    if v_contractor_name = '' then
      raise exception 'Contracted employee name is required.';
    end if;

    if v_contract_value_text = '' then
      raise exception 'Contract value is required for %.', v_contractor_name;
    end if;

    begin
      v_contract_value := v_contract_value_text::numeric;
    exception
      when others then
        raise exception 'Invalid contract value "%" for %.', v_contract_value_text, v_contractor_name;
    end;

    if v_contract_value = 0 then
      raise exception 'Contract value must be non-zero for %.', v_contractor_name;
    end if;

    begin
      v_installment_count := greatest(1, least(4, coalesce(nullif(trim(coalesce(v_row ->> 'installmentCount', '')), '')::integer, 1)));
    exception
      when others then
        v_installment_count := 1;
    end;

    insert into public.contracts (
      fiscal_year_id,
      organization_id,
      project_id,
      banner_account_code_id,
      production_category_id,
      entered_by_user_id,
      contractor_name,
      contract_value,
      installment_count,
      workflow_status
    ) values (
      v_resolved_fiscal_year_id,
      v_resolved_organization_id,
      p_project_id,
      p_banner_account_code_id,
      v_misc_category_id,
      auth.uid(),
      v_contractor_name,
      v_contract_value,
      v_installment_count,
      'w9_requested'
    )
    returning id into v_contract_id;

    v_total_cents := round(v_contract_value * 100);
    v_base_cents := trunc(v_total_cents / v_installment_count);
    v_remainder := v_total_cents - (v_base_cents * v_installment_count);

    for v_installment_number in 1..v_installment_count loop
      v_bump := case when v_remainder > 0 then 1 when v_remainder < 0 then -1 else 0 end;
      if v_remainder <> 0 then
        v_remainder := v_remainder - v_bump;
      end if;

      v_installment_amount := (v_base_cents + v_bump)::numeric / 100::numeric;

      insert into public.purchases (
        project_id,
        organization_id,
        budget_line_id,
        production_category_id,
        banner_account_code_id,
        budget_tracked,
        entered_by_user_id,
        title,
        estimated_amount,
        requested_amount,
        encumbered_amount,
        pending_cc_amount,
        posted_amount,
        status,
        request_type,
        is_credit_card,
        procurement_status,
        notes
      ) values (
        p_project_id,
        v_resolved_organization_id,
        v_reporting_budget_line_id,
        v_misc_category_id,
        p_banner_account_code_id,
        true,
        auth.uid(),
        v_contractor_name || ' Contract Payment ' || v_installment_number || '/' || v_installment_count,
        v_installment_amount,
        0,
        0,
        0,
        0,
        'requested',
        'contract_payment',
        false,
        'requested',
        'Contract installment ' || v_installment_number || '/' || v_installment_count
      )
      returning id into v_purchase_id;

      insert into public.purchase_allocations (
        purchase_id,
        reporting_budget_line_id,
        account_code_id,
        production_category_id,
        amount,
        reporting_bucket,
        note
      ) values (
        v_purchase_id,
        v_reporting_budget_line_id,
        p_banner_account_code_id,
        v_misc_category_id,
        v_installment_amount,
        'direct',
        'Contract installment allocation'
      );

      insert into public.contract_installments (
        contract_id,
        purchase_id,
        installment_number,
        installment_amount,
        status
      ) values (
        v_contract_id,
        v_purchase_id,
        v_installment_number,
        v_installment_amount,
        'planned'
      );
    end loop;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.create_contracts_bulk(uuid, uuid, uuid, uuid, jsonb) to authenticated;

create or replace function public.delete_contract_with_links(
  p_contract_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_purchase_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'You must be authenticated.';
  end if;

  if p_contract_id is null then
    raise exception 'Contract id is required.';
  end if;

  select project_id
  into v_project_id
  from public.contracts
  where id = p_contract_id;

  if v_project_id is null then
    raise exception 'Contract not found.';
  end if;

  if not public.has_project_role(v_project_id, array['admin','project_manager']::public.app_role[]) then
    raise exception 'Only Admin or Project Manager can manage contracts.';
  end if;

  select coalesce(array_agg(ci.purchase_id), '{}'::uuid[])
  into v_purchase_ids
  from public.contract_installments ci
  where ci.contract_id = p_contract_id
    and ci.purchase_id is not null;

  if array_length(v_purchase_ids, 1) is not null then
    delete from public.purchases
    where id = any(v_purchase_ids);
  end if;

  delete from public.contracts
  where id = p_contract_id;
end;
$$;

grant execute on function public.delete_contract_with_links(uuid) to authenticated;
