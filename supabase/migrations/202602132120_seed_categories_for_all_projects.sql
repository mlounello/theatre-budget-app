-- Ensure all non-external projects have one budget line per active production category.
-- Budget lines are category-driven; account-code links remain optional and separate.

with projects_scope as (
  select p.id as project_id
  from public.projects p
  where lower(trim(p.name)) <> 'external procurement'
),
categories_scope as (
  select pc.id as production_category_id, pc.name as category_name
  from public.production_categories pc
  where pc.active = true
),
missing as (
  select
    ps.project_id,
    cs.production_category_id,
    cs.category_name
  from projects_scope ps
  cross join categories_scope cs
  where not exists (
    select 1
    from public.project_budget_lines pbl
    where pbl.project_id = ps.project_id
      and pbl.production_category_id = cs.production_category_id
  )
),
next_base as (
  select
    p.id as project_id,
    coalesce(max(pbl.sort_order), -1) as base_sort
  from public.projects p
  left join public.project_budget_lines pbl on pbl.project_id = p.id
  group by p.id
),
numbered as (
  select
    m.project_id,
    m.production_category_id,
    m.category_name,
    row_number() over (partition by m.project_id order by m.category_name) as rn
  from missing m
)
insert into public.project_budget_lines (
  project_id,
  budget_code,
  category,
  line_name,
  account_code_id,
  production_category_id,
  allocated_amount,
  sort_order,
  active
)
select
  n.project_id,
  'CATEGORY'::text,
  n.category_name,
  n.category_name,
  null,
  n.production_category_id,
  0::numeric,
  nb.base_sort + n.rn,
  true
from numbered n
join next_base nb on nb.project_id = n.project_id;
