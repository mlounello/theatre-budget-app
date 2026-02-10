-- Move income tracking to org scope (fiscal year -> org funding pool).

alter table public.income_lines
add column if not exists organization_id uuid references public.organizations (id) on delete set null;

-- Existing project-scoped income rows inherit org from their project.
update public.income_lines il
set organization_id = p.organization_id
from public.projects p
where il.project_id = p.id
  and il.organization_id is null
  and p.organization_id is not null;

-- Keep backward compatibility with existing project_id rows, but allow org-only entries.
alter table public.income_lines
alter column project_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'income_lines_scope_check'
      and conrelid = 'public.income_lines'::regclass
  ) then
    alter table public.income_lines
    add constraint income_lines_scope_check
    check (project_id is not null or organization_id is not null);
  end if;
end $$;

create index if not exists idx_income_lines_organization_id on public.income_lines (organization_id);

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.project_memberships pm on pm.project_id = p.id
    where p.organization_id = target_org_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.project_memberships pm on pm.project_id = p.id
    where p.organization_id = target_org_id
      and pm.user_id = auth.uid()
      and pm.role = any(allowed_roles)
  );
$$;

drop policy if exists "members can read income lines" on public.income_lines;
create policy "members can read income lines"
on public.income_lines
for select
using (
  (project_id is not null and public.is_project_member(project_id))
  or (organization_id is not null and public.is_org_member(organization_id))
);

drop policy if exists "pm admin can manage income lines" on public.income_lines;
create policy "pm admin can manage income lines"
on public.income_lines
for all
using (
  (project_id is not null and public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]))
  or (organization_id is not null and public.has_org_role(organization_id, array['admin','project_manager']::public.app_role[]))
)
with check (
  (project_id is not null and public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]))
  or (organization_id is not null and public.has_org_role(organization_id, array['admin','project_manager']::public.app_role[]))
);

-- Rebuild org totals view to avoid duplicated sums and include org-scoped income.
create or replace view public.v_organization_totals as
select
  o.id as organization_id,
  o.name as organization_name,
  o.org_code,
  o.fiscal_year_id,
  fy.name as fiscal_year_name,
  coalesce(pt.allocated_total, 0)::numeric(12, 2) as allocated_total,
  coalesce(pt.requested_open_total, 0)::numeric(12, 2) as requested_open_total,
  coalesce(pt.enc_total, 0)::numeric(12, 2) as enc_total,
  coalesce(pt.pending_cc_total, 0)::numeric(12, 2) as pending_cc_total,
  coalesce(pt.ytd_total, 0)::numeric(12, 2) as ytd_total,
  coalesce(pt.obligated_total, 0)::numeric(12, 2) as obligated_total,
  coalesce(pt.remaining_true, 0)::numeric(12, 2) as remaining_true,
  coalesce(pt.remaining_if_requested_approved, 0)::numeric(12, 2) as remaining_if_requested_approved,
  coalesce(it.income_total, 0)::numeric(12, 2) as income_total
from public.organizations o
left join public.fiscal_years fy on fy.id = o.fiscal_year_id
left join (
  select
    p.organization_id,
    coalesce(sum(vpt.allocated_total), 0)::numeric(12, 2) as allocated_total,
    coalesce(sum(vpt.requested_open_total), 0)::numeric(12, 2) as requested_open_total,
    coalesce(sum(vpt.enc_total), 0)::numeric(12, 2) as enc_total,
    coalesce(sum(vpt.pending_cc_total), 0)::numeric(12, 2) as pending_cc_total,
    coalesce(sum(vpt.ytd_total), 0)::numeric(12, 2) as ytd_total,
    coalesce(sum(vpt.obligated_total), 0)::numeric(12, 2) as obligated_total,
    coalesce(sum(vpt.remaining_true), 0)::numeric(12, 2) as remaining_true,
    coalesce(sum(vpt.remaining_if_requested_approved), 0)::numeric(12, 2) as remaining_if_requested_approved
  from public.projects p
  left join public.v_project_totals vpt on vpt.project_id = p.id
  group by p.organization_id
) pt on pt.organization_id = o.id
left join (
  select
    coalesce(il.organization_id, p.organization_id) as organization_id,
    coalesce(sum(il.amount), 0)::numeric(12, 2) as income_total
  from public.income_lines il
  left join public.projects p on p.id = il.project_id
  group by coalesce(il.organization_id, p.organization_id)
) it on it.organization_id = o.id;

alter view public.v_organization_totals set (security_invoker = true);
