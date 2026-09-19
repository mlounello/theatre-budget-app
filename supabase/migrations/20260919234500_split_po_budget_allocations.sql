-- One PO workflow may be split across multiple project/category/account or organization/account destinations.

alter table app_theatre_budget.purchase_allocations
  add column if not exists organization_id uuid null references app_theatre_budget.organizations(id) on delete restrict,
  alter column reporting_budget_line_id drop not null;

create index if not exists idx_purchase_allocations_organization
  on app_theatre_budget.purchase_allocations (organization_id)
  where organization_id is not null;

alter table app_theatre_budget.purchase_allocations
  drop constraint if exists purchase_allocations_target_check;
alter table app_theatre_budget.purchase_allocations
  add constraint purchase_allocations_target_check check (
    (reporting_budget_line_id is not null and organization_id is null)
    or (reporting_budget_line_id is null and organization_id is not null)
  );

create or replace function app_theatre_budget.validate_purchase_allocation_target()
returns trigger
language plpgsql
set search_path = app_theatre_budget, public
as $$
declare
  v_purchase_fiscal_year_id uuid;
  v_project_fiscal_year_id uuid;
  v_line_category_id uuid;
  v_project_tracking_required boolean;
begin
  select fiscal_year_id into v_purchase_fiscal_year_id
  from app_theatre_budget.purchases where id = new.purchase_id;

  if new.reporting_budget_line_id is not null then
    select project.fiscal_year_id, line.production_category_id
      into v_project_fiscal_year_id, v_line_category_id
    from app_theatre_budget.project_budget_lines line
    join app_theatre_budget.projects project on project.id = line.project_id
    where line.id = new.reporting_budget_line_id;
    if v_project_fiscal_year_id is distinct from v_purchase_fiscal_year_id then
      raise exception 'A PO allocation must stay inside the PO fiscal year.';
    end if;
    if new.production_category_id is null then
      new.production_category_id := v_line_category_id;
    elsif v_line_category_id is not null and new.production_category_id is distinct from v_line_category_id then
      raise exception 'The allocation category must match its project budget line.';
    end if;
  else
    select membership.project_tracking_required
      into v_project_tracking_required
    from app_theatre_budget.fiscal_year_organizations membership
    where membership.fiscal_year_id = v_purchase_fiscal_year_id
      and membership.organization_id = new.organization_id
      and membership.active = true;
    if v_project_tracking_required is null then
      raise exception 'The allocation organization is not active in this fiscal year.';
    end if;
    if v_project_tracking_required then
      raise exception 'That organization requires a theatre project.';
    end if;
    new.production_category_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_allocations_validate_target on app_theatre_budget.purchase_allocations;
create trigger purchase_allocations_validate_target
before insert or update of purchase_id, reporting_budget_line_id, organization_id, production_category_id
on app_theatre_budget.purchase_allocations
for each row execute function app_theatre_budget.validate_purchase_allocation_target();

drop policy if exists "members can read purchase allocations" on app_theatre_budget.purchase_allocations;
drop policy if exists "buyer pm admin can create purchase allocations" on app_theatre_budget.purchase_allocations;
drop policy if exists "pm admin can manage purchase allocations" on app_theatre_budget.purchase_allocations;
drop policy if exists purchase_allocations_select_scoped on app_theatre_budget.purchase_allocations;
drop policy if exists purchase_allocations_insert_scoped on app_theatre_budget.purchase_allocations;
drop policy if exists purchase_allocations_update_scoped on app_theatre_budget.purchase_allocations;
drop policy if exists purchase_allocations_delete_scoped on app_theatre_budget.purchase_allocations;

create policy purchase_allocations_select_scoped on app_theatre_budget.purchase_allocations
for select to authenticated using (
  exists (
    select 1
    from app_theatre_budget.purchases purchase
    left join app_theatre_budget.project_budget_lines line on line.id = purchase_allocations.reporting_budget_line_id
    left join app_theatre_budget.projects project on project.id = line.project_id
    where purchase.id = purchase_allocations.purchase_id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        coalesce(purchase_allocations.organization_id, project.organization_id),
        project.id,
        purchase_allocations.production_category_id,
        array['admin','project_manager','buyer','viewer']::app_theatre_budget.app_role[]
      )
  )
);

create policy purchase_allocations_insert_scoped on app_theatre_budget.purchase_allocations
for insert to authenticated with check (
  exists (
    select 1
    from app_theatre_budget.purchases purchase
    left join app_theatre_budget.project_budget_lines line on line.id = purchase_allocations.reporting_budget_line_id
    left join app_theatre_budget.projects project on project.id = line.project_id
    where purchase.id = purchase_allocations.purchase_id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        coalesce(purchase_allocations.organization_id, project.organization_id),
        project.id,
        purchase_allocations.production_category_id,
        array['admin','project_manager']::app_theatre_budget.app_role[]
      )
  )
);

create policy purchase_allocations_update_scoped on app_theatre_budget.purchase_allocations
for update to authenticated using (app_theatre_budget.is_admin_user())
with check (
  exists (
    select 1
    from app_theatre_budget.purchases purchase
    left join app_theatre_budget.project_budget_lines line on line.id = purchase_allocations.reporting_budget_line_id
    left join app_theatre_budget.projects project on project.id = line.project_id
    where purchase.id = purchase_allocations.purchase_id
      and app_theatre_budget.can_access_financial_scope(
        purchase.fiscal_year_id,
        coalesce(purchase_allocations.organization_id, project.organization_id),
        project.id,
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
        purchase.fiscal_year_id, purchase.organization_id, purchase.project_id,
        purchase.production_category_id,
        array['admin','project_manager']::app_theatre_budget.app_role[]
      )
  )
);

create or replace view app_theatre_budget.v_monthly_actuals_by_org_account as
with alloc_raw as (
  select
    purchase.id as purchase_id,
    coalesce(allocation.organization_id, allocation_project.organization_id, purchase.organization_id, header_project.organization_id) as organization_id,
    coalesce(allocation.account_code_id, purchase.banner_account_code_id) as account_code_id,
    purchase.status,
    purchase.request_type,
    purchase.requested_amount,
    purchase.encumbered_amount,
    purchase.pending_cc_amount,
    purchase.posted_amount,
    coalesce(purchase.ordered_on, purchase.posted_date, purchase.received_on, purchase.paid_on, (purchase.created_at at time zone 'utc')::date) as plan_date,
    allocation.amount as alloc_amount
  from app_theatre_budget.purchases purchase
  join app_theatre_budget.purchase_allocations allocation on allocation.purchase_id = purchase.id
  left join app_theatre_budget.project_budget_lines allocation_line on allocation_line.id = allocation.reporting_budget_line_id
  left join app_theatre_budget.projects allocation_project on allocation_project.id = allocation_line.project_id
  left join app_theatre_budget.projects header_project on header_project.id = purchase.project_id
),
alloc as (
  select alloc_raw.*,
    coalesce(sum(alloc_raw.alloc_amount) over (partition by alloc_raw.purchase_id), 0) as alloc_total
  from alloc_raw
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
  where not exists (select 1 from app_theatre_budget.purchase_allocations allocation where allocation.purchase_id = purchase.id)
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
