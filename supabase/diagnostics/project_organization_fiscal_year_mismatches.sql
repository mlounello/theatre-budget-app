-- Read-only diagnostic: projects whose organization row does not belong to the
-- same fiscal year, or whose global organization has a fiscal-year-specific
-- replacement with the same org code.

select
  p.id as project_id,
  p.name as project_name,
  p.season,
  p.fiscal_year_id as project_fiscal_year_id,
  pfy.name as project_fiscal_year_name,
  p.organization_id as project_organization_id,
  o.org_code as project_org_code,
  o.name as project_org_name,
  o.fiscal_year_id as organization_fiscal_year_id,
  ofy.name as organization_fiscal_year_name,
  fy_org.id as matching_fiscal_year_organization_id,
  fy_org.name as matching_fiscal_year_organization_name
from app_theatre_budget.projects p
left join app_theatre_budget.fiscal_years pfy
  on pfy.id = p.fiscal_year_id
left join app_theatre_budget.organizations o
  on o.id = p.organization_id
left join app_theatre_budget.fiscal_years ofy
  on ofy.id = o.fiscal_year_id
left join app_theatre_budget.organizations fy_org
  on fy_org.fiscal_year_id = p.fiscal_year_id
 and fy_org.org_code = o.org_code
where p.fiscal_year_id is not null
  and p.organization_id is not null
  and (
    o.fiscal_year_id is distinct from p.fiscal_year_id
    or (o.fiscal_year_id is null and fy_org.id is not null)
  )
order by
  pfy.name,
  o.org_code,
  p.name;
