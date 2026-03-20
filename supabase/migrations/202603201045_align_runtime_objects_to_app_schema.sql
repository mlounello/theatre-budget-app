-- Align Theatre Budget runtime-used RPCs/views/functions to the schema-scoped app contract.
--
-- Runtime code uses APP_SCHEMA/app_theatre_budget for direct table queries and for these
-- app objects:
--   RPCs/functions:
--     - create_project_with_admin(text, text, boolean, text, uuid)
--     - create_project_with_admin(text, text, boolean, text)
--     - ensure_project_category_line(uuid, uuid)
--     - assign_project_membership(uuid, uuid, public.app_role)
--     - remove_project_membership(uuid, uuid)
--     - archive_user_profile(uuid, text)
--     - create_contracts_bulk(uuid, uuid, uuid, uuid, jsonb)
--     - delete_contract_with_links(uuid)
--     - get_user_role(text) [already defined under app_theatre_budget]
--   Views:
--     - v_budget_line_totals
--     - v_project_totals
--     - v_project_category_totals
--     - v_cc_pending_by_code
--     - v_portfolio_summary
--     - v_organization_totals
--     - v_actuals_by_category
--     - v_actuals_by_banner_code
--
-- Existing public.* objects are intentionally left in place for compatibility.
-- This migration makes app_theatre_budget the authoritative runtime location.

create schema if not exists app_theatre_budget;
grant usage on schema app_theatre_budget to authenticated;
grant usage on schema app_theatre_budget to service_role;

create or replace function app_theatre_budget.create_project_with_admin(
  p_name text,
  p_season text default null,
  p_use_template boolean default false,
  p_template_name text default 'Play/Musical Default',
  p_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public, core
as $$
declare
  v_project_id uuid;
  v_next_sort integer := 0;
  v_cat record;
begin
  if auth.uid() is null then
    raise exception 'You must be authenticated to create a project.';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Project name is required.';
  end if;

  insert into app_theatre_budget.users (id, full_name)
  values (auth.uid(), coalesce((auth.jwt() -> 'user_metadata' ->> 'full_name'), (auth.jwt() ->> 'email'), 'User'))
  on conflict (id) do update
  set full_name = excluded.full_name;

  insert into app_theatre_budget.projects (name, season, organization_id)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_season, '')), ''),
    p_organization_id
  )
  returning id into v_project_id;

  insert into app_theatre_budget.project_memberships (project_id, user_id, role)
  values (v_project_id, auth.uid(), 'admin')
  on conflict (project_id, user_id) do update set role = excluded.role;

  for v_cat in
    select pc.id, pc.name
    from app_theatre_budget.production_categories pc
    where pc.active = true
    order by pc.sort_order asc, pc.name asc
  loop
    insert into app_theatre_budget.project_budget_lines (
      project_id,
      budget_code,
      category,
      line_name,
      allocated_amount,
      sort_order,
      active,
      account_code_id,
      production_category_id
    )
    values (
      v_project_id,
      'UNASSIGNED',
      v_cat.name,
      v_cat.name,
      0,
      v_next_sort,
      true,
      null,
      v_cat.id
    )
    on conflict (project_id, budget_code, category, line_name) do nothing;

    v_next_sort := v_next_sort + 1;
  end loop;

  return v_project_id;
end;
$$;

grant execute on function app_theatre_budget.create_project_with_admin(text, text, boolean, text, uuid) to authenticated;

create or replace function app_theatre_budget.create_project_with_admin(
  p_name text,
  p_season text default null,
  p_use_template boolean default false,
  p_template_name text default 'Play/Musical Default'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public, core
as $$
begin
  return app_theatre_budget.create_project_with_admin(
    p_name => p_name,
    p_season => p_season,
    p_use_template => p_use_template,
    p_template_name => p_template_name,
    p_organization_id => null
  );
end;
$$;

grant execute on function app_theatre_budget.create_project_with_admin(text, text, boolean, text) to authenticated;

create or replace function app_theatre_budget.ensure_project_category_line(
  p_project_id uuid,
  p_production_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public, core
as $$
declare
  v_line_id uuid;
  v_cat_name text;
  v_next_sort integer;
begin
  if auth.uid() is null then
    raise exception 'You must be authenticated.';
  end if;

  select pc.name
  into v_cat_name
  from app_theatre_budget.production_categories pc
  where pc.id = p_production_category_id;

  if v_cat_name is null then
    raise exception 'Invalid production category.';
  end if;

  select pbl.id
  into v_line_id
  from app_theatre_budget.project_budget_lines pbl
  where pbl.project_id = p_project_id
    and pbl.production_category_id = p_production_category_id
  order by pbl.sort_order asc, pbl.created_at asc
  limit 1;

  if v_line_id is null then
    select pbl.id
    into v_line_id
    from app_theatre_budget.project_budget_lines pbl
    where pbl.project_id = p_project_id
      and lower(trim(coalesce(pbl.category, ''))) = lower(trim(v_cat_name))
    order by (pbl.account_code_id is null) desc, pbl.sort_order asc, pbl.created_at asc
    limit 1;

    if v_line_id is not null then
      update app_theatre_budget.project_budget_lines
      set production_category_id = p_production_category_id
      where id = v_line_id;
    end if;
  end if;

  if v_line_id is null then
    select coalesce(max(pbl.sort_order), 0) + 1
    into v_next_sort
    from app_theatre_budget.project_budget_lines pbl
    where pbl.project_id = p_project_id;

    insert into app_theatre_budget.project_budget_lines (
      project_id,
      budget_code,
      category,
      line_name,
      allocated_amount,
      sort_order,
      active,
      production_category_id,
      account_code_id
    )
    values (
      p_project_id,
      'UNASSIGNED',
      v_cat_name,
      v_cat_name,
      0,
      coalesce(v_next_sort, 1),
      true,
      p_production_category_id,
      null
    )
    returning id into v_line_id;
  end if;

  return v_line_id;
end;
$$;

grant execute on function app_theatre_budget.ensure_project_category_line(uuid, uuid) to authenticated;

create or replace function app_theatre_budget.assign_project_membership(
  p_project_id uuid,
  p_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public, core
as $$
declare
  v_actor_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if p_project_id is null or p_user_id is null then
    raise exception 'Project and user are required.';
  end if;

  select pm.role
  into v_actor_role
  from app_theatre_budget.project_memberships pm
  where pm.project_id = p_project_id
    and pm.user_id = auth.uid()
  limit 1;

  if v_actor_role is null then
    raise exception 'Only project managers/admins can manage project memberships.';
  end if;

  if v_actor_role = 'project_manager' and p_role = 'admin' then
    raise exception 'Project managers cannot assign admin role.';
  end if;

  if v_actor_role not in ('admin', 'project_manager') then
    raise exception 'Only project managers/admins can manage project memberships.';
  end if;

  insert into app_theatre_budget.project_memberships (project_id, user_id, role)
  values (p_project_id, p_user_id, p_role)
  on conflict (project_id, user_id)
  do update set role = excluded.role;
end;
$$;

grant execute on function app_theatre_budget.assign_project_membership(uuid, uuid, public.app_role) to authenticated;

create or replace function app_theatre_budget.remove_project_membership(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public, core
as $$
declare
  v_actor_role public.app_role;
  v_target_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if p_project_id is null or p_user_id is null then
    raise exception 'Project and user are required.';
  end if;

  select pm.role
  into v_actor_role
  from app_theatre_budget.project_memberships pm
  where pm.project_id = p_project_id
    and pm.user_id = auth.uid()
  limit 1;

  if v_actor_role is null or v_actor_role not in ('admin', 'project_manager') then
    raise exception 'Only project managers/admins can manage project memberships.';
  end if;

  select pm.role
  into v_target_role
  from app_theatre_budget.project_memberships pm
  where pm.project_id = p_project_id
    and pm.user_id = p_user_id
  limit 1;

  if v_target_role is null then
    return;
  end if;

  if v_actor_role = 'project_manager' and v_target_role = 'admin' then
    raise exception 'Project managers cannot remove admin memberships.';
  end if;

  delete from app_theatre_budget.project_memberships
  where project_id = p_project_id
    and user_id = p_user_id;
end;
$$;

grant execute on function app_theatre_budget.remove_project_membership(uuid, uuid) to authenticated;

create or replace function app_theatre_budget.archive_user_profile(
  p_user_id uuid,
  p_app_id text default 'theatre_budget'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public, core
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.is_admin_user() then
    raise exception 'Only admins can archive users.';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id is required.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot archive your own account.';
  end if;

  if not exists (select 1 from app_theatre_budget.users u where u.id = p_user_id) then
    raise exception 'User % does not exist.', p_user_id;
  end if;

  delete from app_theatre_budget.user_access_scopes
  where user_id = p_user_id;

  delete from app_theatre_budget.project_memberships
  where user_id = p_user_id;

  update core.app_memberships
  set is_active = false
  where user_id = p_user_id
    and (p_app_id is null or app_id = p_app_id);

  update app_theatre_budget.users
  set full_name = case
      when coalesce(trim(full_name), '') = '' then 'Deleted User'
      when position(' (Deleted)' in full_name) > 0 then full_name
      else full_name || ' (Deleted)'
    end,
    deleted_at = coalesce(deleted_at, now())
  where id = p_user_id;
end;
$$;

revoke all on function app_theatre_budget.archive_user_profile(uuid, text) from public;
grant execute on function app_theatre_budget.archive_user_profile(uuid, text) to authenticated;

create or replace function app_theatre_budget.create_contracts_bulk(
  p_project_id uuid,
  p_fiscal_year_id uuid default null,
  p_organization_id uuid default null,
  p_banner_account_code_id uuid default null,
  p_rows jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public, core
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
  from app_theatre_budget.projects
  where id = p_project_id;

  if not found then
    raise exception 'Project not found.';
  end if;

  v_resolved_fiscal_year_id := coalesce(p_fiscal_year_id, v_project.fiscal_year_id);
  v_resolved_organization_id := coalesce(p_organization_id, v_project.organization_id);

  select id
  into v_misc_category_id
  from app_theatre_budget.production_categories
  where lower(name) = lower('Miscellaneous')
  order by active desc, sort_order asc, name asc
  limit 1;

  if v_misc_category_id is null then
    raise exception 'Production category ''Miscellaneous'' is required for contract reporting.';
  end if;

  select app_theatre_budget.ensure_project_category_line(p_project_id, v_misc_category_id)
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

    insert into app_theatre_budget.contracts (
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

      insert into app_theatre_budget.purchases (
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

      insert into app_theatre_budget.purchase_allocations (
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

      insert into app_theatre_budget.contract_installments (
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

grant execute on function app_theatre_budget.create_contracts_bulk(uuid, uuid, uuid, uuid, jsonb) to authenticated;

create or replace function app_theatre_budget.delete_contract_with_links(
  p_contract_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget, public, core
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
  from app_theatre_budget.contracts
  where id = p_contract_id;

  if v_project_id is null then
    raise exception 'Contract not found.';
  end if;

  if not public.has_project_role(v_project_id, array['admin','project_manager']::public.app_role[]) then
    raise exception 'Only Admin or Project Manager can manage contracts.';
  end if;

  select coalesce(array_agg(ci.purchase_id), '{}'::uuid[])
  into v_purchase_ids
  from app_theatre_budget.contract_installments ci
  where ci.contract_id = p_contract_id
    and ci.purchase_id is not null;

  if array_length(v_purchase_ids, 1) is not null then
    delete from app_theatre_budget.purchases
    where id = any(v_purchase_ids);
  end if;

  delete from app_theatre_budget.contracts
  where id = p_contract_id;
end;
$$;

grant execute on function app_theatre_budget.delete_contract_with_links(uuid) to authenticated;

create or replace view app_theatre_budget.v_budget_line_totals as
with alloc_raw as (
  select
    p.id as purchase_id,
    p.project_id,
    p.status,
    p.request_type,
    p.requested_amount,
    p.encumbered_amount,
    p.pending_cc_amount,
    p.posted_amount,
    pa.reporting_budget_line_id as line_id,
    pa.amount as alloc_amount
  from app_theatre_budget.purchases p
  join app_theatre_budget.purchase_allocations pa on pa.purchase_id = p.id
),
alloc as (
  select
    ar.*,
    coalesce(sum(ar.alloc_amount) over (partition by ar.purchase_id), 0) as alloc_total
  from alloc_raw ar
)
select
  pbl.id as project_budget_line_id,
  pbl.project_id,
  pbl.budget_code,
  pbl.category,
  pbl.line_name,
  pbl.allocated_amount,
  coalesce(
    sum(
      case
        when a.status = 'requested' and a.request_type <> 'request'
          then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as requested_open_total,
  coalesce(
    sum(
      case
        when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as enc_total,
  coalesce(
    sum(
      case
        when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as pending_cc_total,
  coalesce(
    sum(
      case
        when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as ytd_total,
  (
    coalesce(
      sum(
        case
          when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
          else 0
        end
      ),
      0
    )
    + coalesce(
      sum(
        case
          when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
          else 0
        end
      ),
      0
    )
    + coalesce(
      sum(
        case
          when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
          else 0
        end
      ),
      0
    )
    + coalesce(
      sum(
        case
          when a.status = 'requested' and a.request_type = 'request'
            then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
          else 0
        end
      ),
      0
    )
  )::numeric(12, 2) as obligated_total,
  (
    pbl.allocated_amount
    - (
      coalesce(
        sum(
          case
            when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'requested' and a.request_type = 'request'
              then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
    )
  )::numeric(12, 2) as remaining_true,
  (
    pbl.allocated_amount
    - (
      coalesce(
        sum(
          case
            when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
      + coalesce(
        sum(
          case
            when a.status = 'requested'
              then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
            else 0
          end
        ),
        0
      )
    )
  )::numeric(12, 2) as remaining_if_requested_approved,
  coalesce(
    sum(
      case
        when a.status = 'requested' and a.request_type = 'request'
          then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as held_total
from app_theatre_budget.project_budget_lines pbl
left join alloc a on a.line_id = pbl.id
group by pbl.id;

create or replace view app_theatre_budget.v_project_totals as
select
  project_id,
  sum(allocated_amount)::numeric(12, 2) as allocated_total,
  sum(requested_open_total)::numeric(12, 2) as requested_open_total,
  sum(enc_total)::numeric(12, 2) as enc_total,
  sum(pending_cc_total)::numeric(12, 2) as pending_cc_total,
  sum(ytd_total)::numeric(12, 2) as ytd_total,
  sum(obligated_total)::numeric(12, 2) as obligated_total,
  sum(remaining_true)::numeric(12, 2) as remaining_true,
  sum(remaining_if_requested_approved)::numeric(12, 2) as remaining_if_requested_approved,
  sum(held_total)::numeric(12, 2) as held_total
from app_theatre_budget.v_budget_line_totals
group by project_id;

create or replace view app_theatre_budget.v_project_category_totals as
select
  project_id,
  category,
  sum(allocated_amount)::numeric(12, 2) as allocated_total,
  sum(requested_open_total)::numeric(12, 2) as requested_open_total,
  sum(enc_total)::numeric(12, 2) as enc_total,
  sum(pending_cc_total)::numeric(12, 2) as pending_cc_total,
  sum(ytd_total)::numeric(12, 2) as ytd_total,
  sum(obligated_total)::numeric(12, 2) as obligated_total,
  sum(remaining_true)::numeric(12, 2) as remaining_true,
  sum(remaining_if_requested_approved)::numeric(12, 2) as remaining_if_requested_approved,
  sum(held_total)::numeric(12, 2) as held_total
from app_theatre_budget.v_budget_line_totals
group by project_id, category;

create or replace view app_theatre_budget.v_cc_pending_by_code as
with alloc_raw as (
  select
    p.id as purchase_id,
    p.project_id,
    p.status,
    p.pending_cc_amount,
    p.credit_card_id,
    pa.account_code_id,
    pa.amount as alloc_amount
  from app_theatre_budget.purchases p
  join app_theatre_budget.purchase_allocations pa on pa.purchase_id = p.id
),
alloc as (
  select
    ar.*,
    coalesce(sum(ar.alloc_amount) over (partition by ar.purchase_id), 0) as alloc_total
  from alloc_raw ar
)
select
  a.project_id,
  coalesce(ac.code, 'UNASSIGNED') as budget_code,
  cc.id as credit_card_id,
  cc.nickname as credit_card_name,
  coalesce(
    sum(
      case
        when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end
        else 0
      end
    ),
    0
  )::numeric(12, 2) as pending_cc_total
from alloc a
left join app_theatre_budget.account_codes ac on ac.id = a.account_code_id
left join app_theatre_budget.credit_cards cc on cc.id = a.credit_card_id
group by a.project_id, ac.code, cc.id, cc.nickname;

create or replace view app_theatre_budget.v_portfolio_summary as
select
  p.id as project_id,
  p.name as project_name,
  p.season,
  coalesce(vpt.allocated_total, 0)::numeric(12, 2) as allocated_total,
  coalesce(vpt.obligated_total, 0)::numeric(12, 2) as obligated_total,
  coalesce(vpt.remaining_true, 0)::numeric(12, 2) as remaining_true,
  coalesce(vpt.remaining_if_requested_approved, 0)::numeric(12, 2) as remaining_if_requested_approved,
  coalesce(sum(il.amount), 0)::numeric(12, 2) as income_total
from app_theatre_budget.projects p
left join app_theatre_budget.v_project_totals vpt on vpt.project_id = p.id
left join app_theatre_budget.income_lines il on il.project_id = p.id
group by p.id, p.name, p.season, vpt.allocated_total, vpt.obligated_total, vpt.remaining_true, vpt.remaining_if_requested_approved;

create or replace view app_theatre_budget.v_actuals_by_category as
with alloc_raw as (
  select
    p.id as purchase_id,
    p.project_id,
    coalesce(p.organization_id, pr.organization_id) as organization_id,
    coalesce(
      pr.fiscal_year_id,
      fy_match.id
    ) as fiscal_year_id,
    p.status,
    p.request_type,
    p.requested_amount,
    p.encumbered_amount,
    p.pending_cc_amount,
    p.posted_amount,
    pa.production_category_id,
    pa.amount as alloc_amount
  from app_theatre_budget.purchases p
  left join app_theatre_budget.projects pr on pr.id = p.project_id
  left join lateral (
    select fy.id
    from app_theatre_budget.fiscal_years fy
    where (fy.start_date is null or fy.start_date <= coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date))
      and (fy.end_date is null or coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date) <= fy.end_date)
    order by coalesce(fy.sort_order, 2147483647), fy.name, fy.id
    limit 1
  ) fy_match on true
  join app_theatre_budget.purchase_allocations pa on pa.purchase_id = p.id
),
alloc as (
  select
    ar.*,
    coalesce(sum(ar.alloc_amount) over (partition by ar.purchase_id), 0) as alloc_total
  from alloc_raw ar
)
select
  a.project_id,
  a.organization_id,
  o.name as organization_name,
  o.org_code,
  a.fiscal_year_id,
  fy.name as fiscal_year_name,
  coalesce(pc.name, 'Uncategorized') as production_category,
  coalesce(sum(case when a.status = 'requested' and a.request_type <> 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as requested_total,
  coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as posted_total,
  (
    coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
  )::numeric(12, 2) as obligated_total,
  coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as held_total
from alloc a
left join app_theatre_budget.production_categories pc on pc.id = a.production_category_id
left join app_theatre_budget.organizations o on o.id = a.organization_id
left join app_theatre_budget.fiscal_years fy on fy.id = a.fiscal_year_id
group by
  a.project_id,
  a.organization_id,
  o.name,
  o.org_code,
  a.fiscal_year_id,
  fy.name,
  coalesce(pc.name, 'Uncategorized');

create or replace view app_theatre_budget.v_actuals_by_banner_code as
with alloc_raw as (
  select
    p.id as purchase_id,
    p.project_id,
    coalesce(p.organization_id, pr.organization_id) as organization_id,
    coalesce(
      pr.fiscal_year_id,
      fy_match.id
    ) as fiscal_year_id,
    p.status,
    p.request_type,
    p.requested_amount,
    p.encumbered_amount,
    p.pending_cc_amount,
    p.posted_amount,
    coalesce(pa.account_code_id, p.banner_account_code_id) as account_code_id,
    pa.amount as alloc_amount
  from app_theatre_budget.purchases p
  left join app_theatre_budget.projects pr on pr.id = p.project_id
  left join lateral (
    select fy.id
    from app_theatre_budget.fiscal_years fy
    where (fy.start_date is null or fy.start_date <= coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date))
      and (fy.end_date is null or coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date) <= fy.end_date)
    order by coalesce(fy.sort_order, 2147483647), fy.name, fy.id
    limit 1
  ) fy_match on true
  join app_theatre_budget.purchase_allocations pa on pa.purchase_id = p.id
),
alloc as (
  select
    ar.*,
    coalesce(sum(ar.alloc_amount) over (partition by ar.purchase_id), 0) as alloc_total
  from alloc_raw ar
)
select
  a.project_id,
  a.organization_id,
  o.name as organization_name,
  o.org_code,
  a.fiscal_year_id,
  fy.name as fiscal_year_name,
  coalesce(ac.code, 'UNASSIGNED') as banner_account_code,
  coalesce(ac.category, 'Unassigned') as banner_category,
  coalesce(ac.name, 'Unassigned') as banner_name,
  coalesce(sum(case when a.status = 'requested' and a.request_type <> 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as requested_total,
  coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as posted_total,
  (
    coalesce(sum(case when a.status = 'encumbered' then a.encumbered_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'pending_cc' then a.pending_cc_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'posted' then a.posted_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
    + coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)
  )::numeric(12, 2) as obligated_total,
  coalesce(sum(case when a.status = 'requested' and a.request_type = 'request' then a.requested_amount * case when a.alloc_total <> 0 then a.alloc_amount / a.alloc_total else 0 end else 0 end), 0)::numeric(12, 2) as held_total
from alloc a
left join app_theatre_budget.account_codes ac on ac.id = a.account_code_id
left join app_theatre_budget.organizations o on o.id = a.organization_id
left join app_theatre_budget.fiscal_years fy on fy.id = a.fiscal_year_id
group by
  a.project_id,
  a.organization_id,
  o.name,
  o.org_code,
  a.fiscal_year_id,
  fy.name,
  coalesce(ac.code, 'UNASSIGNED'),
  coalesce(ac.category, 'Unassigned'),
  coalesce(ac.name, 'Unassigned');

create or replace view app_theatre_budget.v_organization_totals as
with income_scoped as (
  select
    coalesce(il.organization_id, p.organization_id) as organization_id,
    coalesce(
      p.fiscal_year_id,
      fy_match.id
    ) as fiscal_year_id,
    il.amount,
    il.income_type
  from app_theatre_budget.income_lines il
  left join app_theatre_budget.projects p on p.id = il.project_id
  left join lateral (
    select fy.id
    from app_theatre_budget.fiscal_years fy
    where (fy.start_date is null or fy.start_date <= coalesce(il.received_on, (il.created_at at time zone 'utc')::date))
      and (fy.end_date is null or coalesce(il.received_on, (il.created_at at time zone 'utc')::date) <= fy.end_date)
    order by coalesce(fy.sort_order, 2147483647), fy.name, fy.id
    limit 1
  ) fy_match on true
  where coalesce(il.organization_id, p.organization_id) is not null
),
purchase_scope as (
  select distinct
    coalesce(p.organization_id, pr.organization_id) as organization_id,
    coalesce(
      pr.fiscal_year_id,
      fy_match.id
    ) as fiscal_year_id
  from app_theatre_budget.purchases p
  left join app_theatre_budget.projects pr on pr.id = p.project_id
  left join lateral (
    select fy.id
    from app_theatre_budget.fiscal_years fy
    where (fy.start_date is null or fy.start_date <= coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date))
      and (fy.end_date is null or coalesce(p.received_on, p.paid_on, p.ordered_on, p.posted_date, (p.created_at at time zone 'utc')::date) <= fy.end_date)
    order by coalesce(fy.sort_order, 2147483647), fy.name, fy.id
    limit 1
  ) fy_match on true
  where coalesce(p.organization_id, pr.organization_id) is not null
),
org_fy as (
  select distinct
    p.organization_id,
    p.fiscal_year_id
  from app_theatre_budget.projects p
  where p.organization_id is not null
  union
  select distinct
    i.organization_id,
    i.fiscal_year_id
  from income_scoped i
  union
  select distinct
    ps.organization_id,
    ps.fiscal_year_id
  from purchase_scope ps
),
pt as (
  select
    p.organization_id,
    p.fiscal_year_id,
    coalesce(sum(vpt.allocated_total), 0)::numeric(12, 2) as allocated_total,
    coalesce(sum(vpt.requested_open_total), 0)::numeric(12, 2) as requested_open_total,
    coalesce(sum(vpt.enc_total), 0)::numeric(12, 2) as enc_total,
    coalesce(sum(vpt.pending_cc_total), 0)::numeric(12, 2) as pending_cc_total,
    coalesce(sum(vpt.ytd_total), 0)::numeric(12, 2) as ytd_total,
    coalesce(sum(vpt.obligated_total), 0)::numeric(12, 2) as obligated_total,
    coalesce(sum(vpt.held_total), 0)::numeric(12, 2) as held_total
  from app_theatre_budget.projects p
  left join app_theatre_budget.v_project_totals vpt on vpt.project_id = p.id
  where p.organization_id is not null
  group by p.organization_id, p.fiscal_year_id
),
it as (
  select
    i.organization_id,
    i.fiscal_year_id,
    coalesce(sum(i.amount), 0)::numeric(12, 2) as income_total,
    coalesce(sum(case when i.income_type = 'starting_budget' then i.amount else 0 end), 0)::numeric(12, 2) as starting_budget_total,
    coalesce(sum(case when i.income_type <> 'starting_budget' then i.amount else 0 end), 0)::numeric(12, 2) as additional_income_total
  from income_scoped i
  group by i.organization_id, i.fiscal_year_id
)
select
  o.id as organization_id,
  o.name as organization_name,
  o.org_code,
  fy_scope.fiscal_year_id,
  fy.name as fiscal_year_name,
  coalesce(pt.allocated_total, 0)::numeric(12, 2) as allocated_total,
  coalesce(pt.requested_open_total, 0)::numeric(12, 2) as requested_open_total,
  coalesce(pt.enc_total, 0)::numeric(12, 2) as enc_total,
  coalesce(pt.pending_cc_total, 0)::numeric(12, 2) as pending_cc_total,
  coalesce(pt.ytd_total, 0)::numeric(12, 2) as ytd_total,
  coalesce(pt.obligated_total, 0)::numeric(12, 2) as obligated_total,
  (
    (coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0))
    - (
      coalesce(pt.enc_total, 0)
      + coalesce(pt.pending_cc_total, 0)
      + coalesce(pt.ytd_total, 0)
      + coalesce(pt.requested_open_total, 0)
    )
  )::numeric(12, 2) as remaining_true,
  (
    (coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0))
    - coalesce(pt.obligated_total, 0)
  )::numeric(12, 2) as remaining_if_requested_approved,
  coalesce(it.starting_budget_total, 0)::numeric(12, 2) as starting_budget_total,
  coalesce(it.additional_income_total, 0)::numeric(12, 2) as additional_income_total,
  (coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0))::numeric(12, 2) as funding_pool_total,
  ((coalesce(it.starting_budget_total, 0) + coalesce(it.additional_income_total, 0)) - coalesce(pt.allocated_total, 0))::numeric(12, 2) as funding_pool_available,
  coalesce(it.income_total, 0)::numeric(12, 2) as income_total,
  coalesce(pt.held_total, 0)::numeric(12, 2) as held_total
from app_theatre_budget.organizations o
left join org_fy fy_scope on fy_scope.organization_id = o.id
left join app_theatre_budget.fiscal_years fy on fy.id = fy_scope.fiscal_year_id
left join pt
  on pt.organization_id = o.id
 and pt.fiscal_year_id is not distinct from fy_scope.fiscal_year_id
left join it
  on it.organization_id = o.id
 and it.fiscal_year_id is not distinct from fy_scope.fiscal_year_id;

alter view app_theatre_budget.v_budget_line_totals set (security_invoker = true);
alter view app_theatre_budget.v_project_totals set (security_invoker = true);
alter view app_theatre_budget.v_project_category_totals set (security_invoker = true);
alter view app_theatre_budget.v_cc_pending_by_code set (security_invoker = true);
alter view app_theatre_budget.v_portfolio_summary set (security_invoker = true);
alter view app_theatre_budget.v_actuals_by_category set (security_invoker = true);
alter view app_theatre_budget.v_actuals_by_banner_code set (security_invoker = true);
alter view app_theatre_budget.v_organization_totals set (security_invoker = true);

grant select on app_theatre_budget.v_budget_line_totals to authenticated;
grant select on app_theatre_budget.v_project_totals to authenticated;
grant select on app_theatre_budget.v_project_category_totals to authenticated;
grant select on app_theatre_budget.v_cc_pending_by_code to authenticated;
grant select on app_theatre_budget.v_portfolio_summary to authenticated;
grant select on app_theatre_budget.v_actuals_by_category to authenticated;
grant select on app_theatre_budget.v_actuals_by_banner_code to authenticated;
grant select on app_theatre_budget.v_organization_totals to authenticated;
