-- Projects carry fiscal-year assignment directly.

alter table public.projects
add column if not exists fiscal_year_id uuid references public.fiscal_years (id) on delete set null;

create index if not exists idx_projects_fiscal_year_id on public.projects (fiscal_year_id);
