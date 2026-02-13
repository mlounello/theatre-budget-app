-- Organizations are global (not fiscal-year-scoped).
-- Existing rows are detached from fiscal_year_id so they can be reused across all fiscal years.

update public.organizations
set fiscal_year_id = null
where fiscal_year_id is not null;
