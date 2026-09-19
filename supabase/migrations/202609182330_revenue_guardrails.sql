-- Revenue accounts are reporting targets, never spendable budget sources.

create or replace function app_theatre_budget.reject_new_revenue_spending()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
declare
  v_account_code_id uuid;
begin
  if tg_table_name = 'purchase_allocations' then
    v_account_code_id := new.account_code_id;
  else
    v_account_code_id := new.banner_account_code_id;
  end if;

  if v_account_code_id is not null
     and exists (
       select 1 from app_theatre_budget.account_codes account
       where account.id = v_account_code_id and account.is_revenue = true
     )
     and (
       tg_op = 'INSERT'
       or case
         when tg_table_name = 'purchase_allocations' then old.account_code_id is distinct from new.account_code_id
         else old.banner_account_code_id is distinct from new.banner_account_code_id
       end
     ) then
    raise exception 'Revenue accounts cannot be used for spending.';
  end if;

  return new;
end;
$$;

drop trigger if exists purchases_reject_new_revenue_spending on app_theatre_budget.purchases;
create trigger purchases_reject_new_revenue_spending
before insert or update of banner_account_code_id on app_theatre_budget.purchases
for each row execute function app_theatre_budget.reject_new_revenue_spending();

drop trigger if exists purchase_allocations_reject_new_revenue_spending on app_theatre_budget.purchase_allocations;
create trigger purchase_allocations_reject_new_revenue_spending
before insert or update of account_code_id on app_theatre_budget.purchase_allocations
for each row execute function app_theatre_budget.reject_new_revenue_spending();

drop trigger if exists contracts_reject_new_revenue_spending on app_theatre_budget.contracts;
create trigger contracts_reject_new_revenue_spending
before insert or update of banner_account_code_id on app_theatre_budget.contracts
for each row execute function app_theatre_budget.reject_new_revenue_spending();

create or replace view app_theatre_budget.v_institutional_monthly_budget_availability as
select
  bp.fiscal_year_id,
  fy.name as fiscal_year_name,
  bp.organization_id,
  o.org_code,
  o.name as organization_name,
  bp.account_code_id,
  ac.code as account_code,
  ac.category as account_category,
  ac.name as account_name,
  bpm.id as budget_plan_month_id,
  bpm.month_start,
  bpm.fiscal_month_index,
  bpm.amount::numeric(12, 2) as monthly_allocation,
  coalesce(ct.commitment_count, 0)::integer as commitment_count,
  coalesce(ct.submitted_commitments_amount, 0)::numeric(12, 2) as submitted_commitments_amount,
  coalesce(vt.approved_incoming_amount, 0)::numeric(12, 2) as approved_incoming_variance_amount,
  coalesce(vt.approved_outgoing_amount, 0)::numeric(12, 2) as approved_outgoing_variance_amount,
  coalesce(vt.projected_incoming_amount, 0)::numeric(12, 2) as projected_incoming_variance_amount,
  coalesce(vt.projected_outgoing_amount, 0)::numeric(12, 2) as projected_outgoing_variance_amount,
  case when ac.is_revenue then 0 else (
    bpm.amount + coalesce(vt.approved_incoming_amount, 0)
    - coalesce(vt.approved_outgoing_amount, 0)
    - coalesce(ct.submitted_commitments_amount, 0)
  ) end::numeric(12, 2) as official_available_amount,
  case when ac.is_revenue then 0 else (
    bpm.amount + coalesce(vt.projected_incoming_amount, 0)
    - coalesce(vt.projected_outgoing_amount, 0)
    - coalesce(ct.submitted_commitments_amount, 0)
  ) end::numeric(12, 2) as projected_available_amount,
  ac.is_revenue
from app_theatre_budget.budget_plan_months bpm
join app_theatre_budget.budget_plans bp on bp.id = bpm.budget_plan_id
join app_theatre_budget.fiscal_years fy on fy.id = bp.fiscal_year_id
join app_theatre_budget.organizations o on o.id = bp.organization_id
join app_theatre_budget.account_codes ac on ac.id = bp.account_code_id
left join app_theatre_budget.v_institutional_monthly_commitment_totals ct on ct.budget_plan_month_id = bpm.id
left join app_theatre_budget.v_institutional_variance_totals vt on vt.budget_plan_month_id = bpm.id;

alter view app_theatre_budget.v_institutional_monthly_budget_availability set (security_invoker = true);
grant select on app_theatre_budget.v_institutional_monthly_budget_availability to authenticated;

create or replace function app_theatre_budget.get_institutional_source_candidates(
  p_fiscal_year_id uuid default null,
  p_organization_id uuid default null,
  p_account_code_id uuid default null,
  p_month_start date default null,
  p_search text default null,
  p_target_organization_id uuid default null,
  p_allow_cross_org boolean default false
)
returns table (
  fiscal_year_id uuid, fiscal_year_name text, organization_id uuid, org_code text,
  organization_name text, account_code_id uuid, account_code text, account_category text,
  account_name text, budget_plan_month_id uuid, month_start date, fiscal_month_index integer,
  monthly_allocation numeric, official_available_amount numeric, projected_available_amount numeric,
  crosses_target_org boolean
)
language sql stable security invoker
set search_path = pg_catalog, app_theatre_budget, public
as $$
  select
    a.fiscal_year_id, a.fiscal_year_name, a.organization_id, a.org_code,
    a.organization_name, a.account_code_id, a.account_code, a.account_category,
    a.account_name, a.budget_plan_month_id, a.month_start, a.fiscal_month_index,
    a.monthly_allocation, a.official_available_amount, a.projected_available_amount,
    (p_target_organization_id is not null and a.organization_id <> p_target_organization_id)
  from app_theatre_budget.v_institutional_monthly_budget_availability a
  where not a.is_revenue
    and a.official_available_amount > 0
    and (p_fiscal_year_id is null or a.fiscal_year_id = p_fiscal_year_id)
    and (p_organization_id is null or a.organization_id = p_organization_id)
    and (p_account_code_id is null or a.account_code_id = p_account_code_id)
    and (p_month_start is null or a.month_start = p_month_start)
    and (p_target_organization_id is null or p_allow_cross_org or a.organization_id = p_target_organization_id)
    and (
      coalesce(trim(p_search), '') = ''
      or a.fiscal_year_name ilike '%' || trim(p_search) || '%'
      or a.org_code ilike '%' || trim(p_search) || '%'
      or a.organization_name ilike '%' || trim(p_search) || '%'
      or a.account_code ilike '%' || trim(p_search) || '%'
      or a.account_category ilike '%' || trim(p_search) || '%'
      or a.account_name ilike '%' || trim(p_search) || '%'
      or to_char(a.month_start, 'YYYY-MM') ilike '%' || trim(p_search) || '%'
    )
  order by 16 asc, a.fiscal_year_name, a.org_code, a.account_code, a.month_start;
$$;

grant execute on function app_theatre_budget.get_institutional_source_candidates(uuid, uuid, uuid, date, text, uuid, boolean) to authenticated;
notify pgrst, 'reload schema';
