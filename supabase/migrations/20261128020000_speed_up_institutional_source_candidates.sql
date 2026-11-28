-- Variance Center timed out (statement timeout 57014) loading source candidates.
-- The SQL-language function carried a `set search_path` clause, which prevents inlining, and
-- re-evaluated the row-level-security-heavy availability view repeatedly (~8.7s for 97 rows).
-- This version keeps the exact signature, result columns, filters, ordering, and invoker
-- security, but computes the view once (filtered by fiscal year) and filters that result (~0.1s).
-- Verified on live data: identical row counts (97) before and after in a rolled-back trial.

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
language plpgsql stable security invoker
set search_path = pg_catalog, app_theatre_budget, public
as $$
#variable_conflict use_column
begin
  return query
  with a as materialized (
    select * from app_theatre_budget.v_institutional_monthly_budget_availability v
    where p_fiscal_year_id is null or v.fiscal_year_id = p_fiscal_year_id
  )
  select
    a.fiscal_year_id, a.fiscal_year_name, a.organization_id, a.org_code,
    a.organization_name, a.account_code_id, a.account_code, a.account_category,
    a.account_name, a.budget_plan_month_id, a.month_start, a.fiscal_month_index,
    a.monthly_allocation, a.official_available_amount, a.projected_available_amount,
    (p_target_organization_id is not null and a.organization_id <> p_target_organization_id)
  from a
  where not a.is_revenue
    and a.official_available_amount > 0
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
end
$$;

grant execute on function app_theatre_budget.get_institutional_source_candidates(uuid, uuid, uuid, date, text, uuid, boolean) to authenticated;
