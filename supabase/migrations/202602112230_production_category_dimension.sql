-- Decouple production reporting category from Banner account code.

create table if not exists public.production_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.production_categories (name, sort_order, active)
values
  ('Scenic', 1, true),
  ('Costumes', 2, true),
  ('Lighting', 3, true),
  ('Sound', 4, true),
  ('Music', 5, true),
  ('Rights', 6, true),
  ('Props', 7, true),
  ('Miscellaneous', 8, true),
  ('Box Office', 9, true)
on conflict (name) do update
set sort_order = excluded.sort_order,
    active = excluded.active;

alter table public.production_categories enable row level security;

drop policy if exists "members can read production categories" on public.production_categories;
create policy "members can read production categories"
on public.production_categories
for select
to authenticated
using (true);

drop policy if exists "admins can manage production categories" on public.production_categories;
create policy "admins can manage production categories"
on public.production_categories
for all
to authenticated
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
);

grant select, insert, update, delete on public.production_categories to authenticated;

alter table public.project_budget_lines
add column if not exists production_category_id uuid references public.production_categories (id) on delete set null;

update public.project_budget_lines pbl
set production_category_id = pc.id
from public.production_categories pc
where pbl.production_category_id is null
  and lower(trim(coalesce(pbl.category, ''))) = lower(trim(pc.name));

alter table public.purchase_allocations
add column if not exists production_category_id uuid references public.production_categories (id) on delete set null;

update public.purchase_allocations pa
set production_category_id = pbl.production_category_id
from public.project_budget_lines pbl
where pa.reporting_budget_line_id = pbl.id
  and pa.production_category_id is null;

alter table public.purchases
add column if not exists production_category_id uuid references public.production_categories (id) on delete set null,
add column if not exists banner_account_code_id uuid references public.account_codes (id) on delete set null;

update public.purchases p
set production_category_id = pbl.production_category_id
from public.project_budget_lines pbl
where p.budget_line_id = pbl.id
  and p.production_category_id is null;

update public.purchases p
set banner_account_code_id = pa.account_code_id
from lateral (
  select pa_inner.account_code_id
  from public.purchase_allocations pa_inner
  where pa_inner.purchase_id = p.id
    and pa_inner.account_code_id is not null
  order by pa_inner.created_at asc
  limit 1
) pa
where p.banner_account_code_id is null;

alter table public.income_lines
add column if not exists production_category_id uuid references public.production_categories (id) on delete set null,
add column if not exists banner_account_code_id uuid references public.account_codes (id) on delete set null;

create index if not exists idx_pbl_production_category_id on public.project_budget_lines (production_category_id);
create index if not exists idx_pa_production_category_id on public.purchase_allocations (production_category_id);
create index if not exists idx_purchases_production_category_id on public.purchases (production_category_id);
create index if not exists idx_purchases_banner_account_code_id on public.purchases (banner_account_code_id);
create index if not exists idx_income_lines_production_category_id on public.income_lines (production_category_id);
create index if not exists idx_income_lines_banner_account_code_id on public.income_lines (banner_account_code_id);

create or replace function public.ensure_project_category_line(
  p_project_id uuid,
  p_production_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
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
  from public.production_categories pc
  where pc.id = p_production_category_id;

  if v_cat_name is null then
    raise exception 'Invalid production category.';
  end if;

  select pbl.id
  into v_line_id
  from public.project_budget_lines pbl
  where pbl.project_id = p_project_id
    and pbl.production_category_id = p_production_category_id
  order by pbl.sort_order asc, pbl.created_at asc
  limit 1;

  if v_line_id is null then
    select pbl.id
    into v_line_id
    from public.project_budget_lines pbl
    where pbl.project_id = p_project_id
      and lower(trim(coalesce(pbl.category, ''))) = lower(trim(v_cat_name))
    order by (pbl.account_code_id is null) desc, pbl.sort_order asc, pbl.created_at asc
    limit 1;

    if v_line_id is not null then
      update public.project_budget_lines
      set production_category_id = p_production_category_id
      where id = v_line_id;
    end if;
  end if;

  if v_line_id is null then
    select coalesce(max(pbl.sort_order), 0) + 1
    into v_next_sort
    from public.project_budget_lines pbl
    where pbl.project_id = p_project_id;

    insert into public.project_budget_lines (
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

grant execute on function public.ensure_project_category_line(uuid, uuid) to authenticated;

-- Category totals by project independent of Banner codes.
create or replace view public.v_actuals_by_category as
select
  p.project_id,
  coalesce(pc.name, 'Uncategorized') as production_category,
  coalesce(sum(case when p.status = 'requested' then pa.amount else 0 end), 0)::numeric(12, 2) as requested_total,
  coalesce(sum(case when p.status = 'encumbered' then pa.amount else 0 end), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(case when p.status = 'pending_cc' then pa.amount else 0 end), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(case when p.status = 'posted' then pa.amount else 0 end), 0)::numeric(12, 2) as posted_total,
  coalesce(sum(case when p.status in ('encumbered','pending_cc','posted') then pa.amount else 0 end), 0)::numeric(12, 2) as obligated_total
from public.purchase_allocations pa
join public.purchases p on p.id = pa.purchase_id
left join public.production_categories pc on pc.id = coalesce(pa.production_category_id, p.production_category_id)
group by p.project_id, coalesce(pc.name, 'Uncategorized');

alter view public.v_actuals_by_category set (security_invoker = true);
grant select on public.v_actuals_by_category to authenticated;

-- Banner code totals by project for reconciliation.
create or replace view public.v_actuals_by_banner_code as
select
  p.project_id,
  coalesce(ac.code, 'UNASSIGNED') as banner_account_code,
  coalesce(ac.category, 'Unassigned') as banner_category,
  coalesce(ac.name, 'Unassigned') as banner_name,
  coalesce(sum(case when p.status = 'requested' then pa.amount else 0 end), 0)::numeric(12, 2) as requested_total,
  coalesce(sum(case when p.status = 'encumbered' then pa.amount else 0 end), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(case when p.status = 'pending_cc' then pa.amount else 0 end), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(case when p.status = 'posted' then pa.amount else 0 end), 0)::numeric(12, 2) as posted_total,
  coalesce(sum(case when p.status in ('encumbered','pending_cc','posted') then pa.amount else 0 end), 0)::numeric(12, 2) as obligated_total
from public.purchase_allocations pa
join public.purchases p on p.id = pa.purchase_id
left join public.account_codes ac on ac.id = coalesce(pa.account_code_id, p.banner_account_code_id)
group by p.project_id, coalesce(ac.code, 'UNASSIGNED'), coalesce(ac.category, 'Unassigned'), coalesce(ac.name, 'Unassigned');

alter view public.v_actuals_by_banner_code set (security_invoker = true);
grant select on public.v_actuals_by_banner_code to authenticated;
