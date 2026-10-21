-- Make each PO allocation a complete budget child of its parent purchase.

alter table app_theatre_budget.purchase_allocations
  add column if not exists project_id uuid null
    constraint purchase_allocations_project_id_fkey
    references app_theatre_budget.projects(id) on delete restrict;

create index if not exists idx_purchase_allocations_project
  on app_theatre_budget.purchase_allocations (project_id)
  where project_id is not null;

-- The legacy model required either a project line or an organization. The new
-- child model stores the organization alongside its optional project, so remove
-- that obsolete exclusive-or rule before backfilling both fields.
alter table app_theatre_budget.purchase_allocations
  drop constraint if exists purchase_allocations_target_check;

-- Recover the explicit project and organization already encoded by legacy budget lines.
update app_theatre_budget.purchase_allocations allocation
set project_id = line.project_id
from app_theatre_budget.project_budget_lines line
where line.id = allocation.reporting_budget_line_id
  and allocation.project_id is null;

update app_theatre_budget.purchase_allocations allocation
set organization_id = project.organization_id
from app_theatre_budget.projects project
where project.id = allocation.project_id
  and allocation.organization_id is null;

-- A legacy organization allocation may safely inherit the parent project only when
-- that project belongs to the allocation's own organization.
update app_theatre_budget.purchase_allocations allocation
set project_id = purchase.project_id
from app_theatre_budget.purchases purchase
join app_theatre_budget.projects project on project.id = purchase.project_id
where purchase.id = allocation.purchase_id
  and allocation.project_id is null
  and allocation.organization_id = project.organization_id;

alter table app_theatre_budget.purchase_allocations
  add constraint purchase_allocations_budget_destination_check
  check (organization_id is not null);

create or replace function app_theatre_budget.validate_purchase_allocation_target()
returns trigger
language plpgsql
set search_path = app_theatre_budget, public
as $$
declare
  v_purchase_fiscal_year_id uuid;
  v_project_fiscal_year_id uuid;
  v_project_organization_id uuid;
  v_line_project_id uuid;
  v_line_category_id uuid;
  v_project_tracking_required boolean;
begin
  select fiscal_year_id into v_purchase_fiscal_year_id
  from app_theatre_budget.purchases
  where id = new.purchase_id;

  if v_purchase_fiscal_year_id is null then
    raise exception 'A PO allocation requires a parent purchase with a fiscal year.';
  end if;

  if new.reporting_budget_line_id is not null then
    select line.project_id, line.production_category_id
      into v_line_project_id, v_line_category_id
    from app_theatre_budget.project_budget_lines line
    where line.id = new.reporting_budget_line_id;
    if v_line_project_id is null then
      raise exception 'The allocation budget line does not exist.';
    end if;
    if new.project_id is null then
      new.project_id := v_line_project_id;
    elsif new.project_id is distinct from v_line_project_id then
      raise exception 'The allocation budget line must belong to its selected project.';
    end if;
    if new.production_category_id is null then
      new.production_category_id := v_line_category_id;
    elsif v_line_category_id is not null and new.production_category_id is distinct from v_line_category_id then
      raise exception 'The allocation category must match its project budget line.';
    end if;
  end if;

  if new.project_id is not null then
    select project.fiscal_year_id, project.organization_id
      into v_project_fiscal_year_id, v_project_organization_id
    from app_theatre_budget.projects project
    where project.id = new.project_id;
    if v_project_fiscal_year_id is null then
      raise exception 'The allocation project does not exist.';
    end if;
    if v_project_fiscal_year_id is distinct from v_purchase_fiscal_year_id then
      raise exception 'A PO allocation must stay inside the parent PO fiscal year.';
    end if;
    if new.organization_id is null then
      new.organization_id := v_project_organization_id;
    elsif new.organization_id is distinct from v_project_organization_id then
      raise exception 'The allocation project must belong to its selected organization.';
    end if;
  end if;

  if new.organization_id is null then
    raise exception 'Every PO allocation requires an organization.';
  end if;

  select membership.project_tracking_required
    into v_project_tracking_required
  from app_theatre_budget.fiscal_year_organizations membership
  where membership.fiscal_year_id = v_purchase_fiscal_year_id
    and membership.organization_id = new.organization_id
    and membership.active = true;

  if v_project_tracking_required is null then
    raise exception 'The allocation organization is not active in this fiscal year.';
  end if;
  if v_project_tracking_required and new.project_id is null then
    raise exception 'That organization requires a project for every allocation.';
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_allocations_validate_target on app_theatre_budget.purchase_allocations;
create trigger purchase_allocations_validate_target
before insert or update of purchase_id, project_id, reporting_budget_line_id, organization_id, production_category_id
on app_theatre_budget.purchase_allocations
for each row execute function app_theatre_budget.validate_purchase_allocation_target();

drop policy if exists purchase_allocations_select_scoped on app_theatre_budget.purchase_allocations;
drop policy if exists purchase_allocations_insert_scoped on app_theatre_budget.purchase_allocations;
drop policy if exists purchase_allocations_update_scoped on app_theatre_budget.purchase_allocations;
drop policy if exists purchase_allocations_delete_scoped on app_theatre_budget.purchase_allocations;

create policy purchase_allocations_select_scoped on app_theatre_budget.purchase_allocations
for select to authenticated using (
  exists (
    select 1 from app_theatre_budget.purchases purchase
    where purchase.id = purchase_allocations.purchase_id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        purchase_allocations.organization_id,
        purchase_allocations.project_id,
        purchase_allocations.production_category_id,
        array['admin','project_manager','buyer','viewer']::app_theatre_budget.app_role[]
      )
  )
);

create policy purchase_allocations_insert_scoped on app_theatre_budget.purchase_allocations
for insert to authenticated with check (
  exists (
    select 1 from app_theatre_budget.purchases purchase
    where purchase.id = purchase_allocations.purchase_id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        purchase_allocations.organization_id,
        purchase_allocations.project_id,
        purchase_allocations.production_category_id,
        array['admin','project_manager']::app_theatre_budget.app_role[]
      )
  )
);

create policy purchase_allocations_update_scoped on app_theatre_budget.purchase_allocations
for update to authenticated
using (
  exists (
    select 1 from app_theatre_budget.purchases purchase
    where purchase.id = purchase_allocations.purchase_id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        purchase_allocations.organization_id,
        purchase_allocations.project_id,
        purchase_allocations.production_category_id,
        array['admin','project_manager']::app_theatre_budget.app_role[]
      )
  )
)
with check (
  exists (
    select 1 from app_theatre_budget.purchases purchase
    where purchase.id = purchase_allocations.purchase_id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        purchase_allocations.organization_id,
        purchase_allocations.project_id,
        purchase_allocations.production_category_id,
        array['admin','project_manager']::app_theatre_budget.app_role[]
      )
  )
);

create policy purchase_allocations_delete_scoped on app_theatre_budget.purchase_allocations
for delete to authenticated using (
  exists (
    select 1 from app_theatre_budget.purchases purchase
    where purchase.id = purchase_allocations.purchase_id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        purchase_allocations.organization_id,
        purchase_allocations.project_id,
        purchase_allocations.production_category_id,
        array['admin','project_manager']::app_theatre_budget.app_role[]
      )
  )
);

-- Preserve the existing view shape so deployed clients remain compatible while
-- sourcing project and organization from each allocation child.
create or replace view app_theatre_budget.v_actuals_by_category as
with alloc_raw as (
  select
    p.id as purchase_id,
    pa.project_id,
    pa.organization_id,
    p.fiscal_year_id,
    p.status,
    p.request_type,
    p.requested_amount,
    p.encumbered_amount,
    p.pending_cc_amount,
    p.posted_amount,
    pa.production_category_id,
    pa.amount as alloc_amount
  from app_theatre_budget.purchases p
  join app_theatre_budget.purchase_allocations pa on pa.purchase_id = p.id
),
alloc as (
  select ar.*, coalesce(sum(ar.alloc_amount) over (partition by ar.purchase_id), 0) as alloc_total
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
group by a.project_id, a.organization_id, o.name, o.org_code, a.fiscal_year_id, fy.name, coalesce(pc.name, 'Uncategorized');

alter view app_theatre_budget.v_actuals_by_category set (security_invoker = true);

create or replace view app_theatre_budget.v_actuals_by_banner_code as
with alloc_raw as (
  select
    p.id as purchase_id,
    pa.project_id,
    pa.organization_id,
    p.fiscal_year_id,
    p.status,
    p.request_type,
    p.requested_amount,
    p.encumbered_amount,
    p.pending_cc_amount,
    p.posted_amount,
    coalesce(pa.account_code_id, p.banner_account_code_id) as account_code_id,
    pa.amount as alloc_amount
  from app_theatre_budget.purchases p
  join app_theatre_budget.purchase_allocations pa on pa.purchase_id = p.id
),
alloc as (
  select ar.*, coalesce(sum(ar.alloc_amount) over (partition by ar.purchase_id), 0) as alloc_total
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
  a.project_id, a.organization_id, o.name, o.org_code, a.fiscal_year_id, fy.name,
  coalesce(ac.code, 'UNASSIGNED'), coalesce(ac.category, 'Unassigned'), coalesce(ac.name, 'Unassigned');

alter view app_theatre_budget.v_actuals_by_banner_code set (security_invoker = true);

create or replace view app_theatre_budget.v_monthly_actuals_by_org_account as
with alloc as (
  select
    purchase.id as purchase_id,
    allocation.organization_id,
    coalesce(allocation.account_code_id, purchase.banner_account_code_id) as account_code_id,
    purchase.status,
    purchase.request_type,
    purchase.requested_amount,
    purchase.encumbered_amount,
    purchase.pending_cc_amount,
    purchase.posted_amount,
    coalesce(purchase.ordered_on, purchase.posted_date, purchase.received_on, purchase.paid_on, (purchase.created_at at time zone 'utc')::date) as plan_date,
    allocation.amount as alloc_amount,
    coalesce(sum(allocation.amount) over (partition by purchase.id), 0) as alloc_total
  from app_theatre_budget.purchases purchase
  join app_theatre_budget.purchase_allocations allocation on allocation.purchase_id = purchase.id
),
allocated_rows as (
  select
    allocation.purchase_id, allocation.organization_id, allocation.account_code_id, allocation.plan_date,
    case
      when allocation.status = 'encumbered' then allocation.encumbered_amount * case when allocation.alloc_total <> 0 then allocation.alloc_amount / allocation.alloc_total else 0 end
      when allocation.status = 'pending_cc' then allocation.pending_cc_amount * case when allocation.alloc_total <> 0 then allocation.alloc_amount / allocation.alloc_total else 0 end
      when allocation.status = 'posted' then allocation.posted_amount * case when allocation.alloc_total <> 0 then allocation.alloc_amount / allocation.alloc_total else 0 end
      when allocation.status = 'requested' and allocation.request_type = 'request' then allocation.requested_amount * case when allocation.alloc_total <> 0 then allocation.alloc_amount / allocation.alloc_total else 0 end
      else 0
    end as obligated_amount
  from alloc allocation
),
non_allocated_rows as (
  select
    purchase.id as purchase_id,
    coalesce(purchase.organization_id, project.organization_id) as organization_id,
    purchase.banner_account_code_id as account_code_id,
    coalesce(purchase.ordered_on, purchase.posted_date, purchase.received_on, purchase.paid_on, (purchase.created_at at time zone 'utc')::date) as plan_date,
    case
      when purchase.status = 'encumbered' then purchase.encumbered_amount
      when purchase.status = 'pending_cc' then purchase.pending_cc_amount
      when purchase.status = 'posted' then purchase.posted_amount
      when purchase.status = 'requested' and purchase.request_type = 'request' then purchase.requested_amount
      else 0
    end as obligated_amount
  from app_theatre_budget.purchases purchase
  left join app_theatre_budget.projects project on project.id = purchase.project_id
  where not exists (
    select 1 from app_theatre_budget.purchase_allocations allocation where allocation.purchase_id = purchase.id
  )
),
purchase_scope as (
  select * from allocated_rows
  union all
  select * from non_allocated_rows
),
scoped_with_fy as (
  select purchase_scope.*, fiscal_year.id as fiscal_year_id
  from purchase_scope
  left join lateral (
    select candidate.id
    from app_theatre_budget.fiscal_years candidate
    where (candidate.start_date is null or candidate.start_date <= purchase_scope.plan_date)
      and (candidate.end_date is null or purchase_scope.plan_date <= candidate.end_date)
    order by coalesce(candidate.sort_order, 2147483647), candidate.name, candidate.id
    limit 1
  ) fiscal_year on true
)
select
  scoped.fiscal_year_id,
  scoped.organization_id,
  scoped.account_code_id,
  date_trunc('month', scoped.plan_date)::date as month_start,
  coalesce(sum(scoped.obligated_amount), 0)::numeric(12, 2) as obligated_amount
from scoped_with_fy scoped
where scoped.organization_id is not null and scoped.account_code_id is not null
group by scoped.fiscal_year_id, scoped.organization_id, scoped.account_code_id, date_trunc('month', scoped.plan_date)::date;

alter view app_theatre_budget.v_monthly_actuals_by_org_account set (security_invoker = true);

notify pgrst, 'reload schema';
