-- Phase 4 Gate 2: explicit, nullable fiscal year on purchases.
-- Existing application writers remain compatible through the assignment trigger.

alter table app_theatre_budget.purchases
  add column if not exists fiscal_year_id uuid null
    references app_theatre_budget.fiscal_years(id) on delete restrict;

create index if not exists idx_purchases_fiscal_year_id
  on app_theatre_budget.purchases (fiscal_year_id);

create or replace function app_theatre_budget.record_fiscal_year_assignment_conflict(
  p_entity_table text,
  p_entity_id uuid,
  p_conflict_type text,
  p_project_fiscal_year_id uuid default null,
  p_organization_fiscal_year_id uuid default null,
  p_explicit_fiscal_year_id uuid default null,
  p_proposed_fiscal_year_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
begin
  insert into app_theatre_budget.fiscal_year_assignment_conflicts (
    entity_table,
    entity_id,
    conflict_type,
    project_fiscal_year_id,
    organization_fiscal_year_id,
    explicit_fiscal_year_id,
    proposed_fiscal_year_id,
    details,
    status,
    updated_at
  ) values (
    p_entity_table,
    p_entity_id,
    p_conflict_type,
    p_project_fiscal_year_id,
    p_organization_fiscal_year_id,
    p_explicit_fiscal_year_id,
    p_proposed_fiscal_year_id,
    coalesce(p_details, '{}'::jsonb),
    'open',
    now()
  )
  on conflict (entity_table, entity_id) where status = 'open'
  do update set
    conflict_type = excluded.conflict_type,
    project_fiscal_year_id = excluded.project_fiscal_year_id,
    organization_fiscal_year_id = excluded.organization_fiscal_year_id,
    explicit_fiscal_year_id = excluded.explicit_fiscal_year_id,
    proposed_fiscal_year_id = excluded.proposed_fiscal_year_id,
    details = excluded.details,
    updated_at = now();
end;
$$;

revoke all on function app_theatre_budget.record_fiscal_year_assignment_conflict(
  text, uuid, text, uuid, uuid, uuid, uuid, jsonb
) from public, anon, authenticated;

create or replace function app_theatre_budget.assign_purchase_fiscal_year()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_theatre_budget
as $$
declare
  v_project_fiscal_year_id uuid;
  v_organization_fiscal_year_id uuid;
  v_explicit_fiscal_year_id uuid := new.fiscal_year_id;
  v_resolved_fiscal_year_id uuid;
begin
  if new.project_id is not null then
    select project.fiscal_year_id
    into v_project_fiscal_year_id
    from app_theatre_budget.projects project
    where project.id = new.project_id;
  end if;

  if new.organization_id is not null then
    select organization.fiscal_year_id
    into v_organization_fiscal_year_id
    from app_theatre_budget.organizations organization
    where organization.id = new.organization_id;
  end if;

  if v_project_fiscal_year_id is not null
     and v_organization_fiscal_year_id is not null
     and v_project_fiscal_year_id <> v_organization_fiscal_year_id then
    new.fiscal_year_id := null;
    perform app_theatre_budget.record_fiscal_year_assignment_conflict(
      'purchases', new.id, 'project_organization_mismatch',
      v_project_fiscal_year_id, v_organization_fiscal_year_id,
      v_explicit_fiscal_year_id, null,
      jsonb_build_object('operation', tg_op)
    );
    return new;
  end if;

  v_resolved_fiscal_year_id := coalesce(
    v_project_fiscal_year_id,
    v_organization_fiscal_year_id
  );

  if v_explicit_fiscal_year_id is not null
     and v_resolved_fiscal_year_id is not null
     and v_explicit_fiscal_year_id <> v_resolved_fiscal_year_id then
    new.fiscal_year_id := null;
    perform app_theatre_budget.record_fiscal_year_assignment_conflict(
      'purchases', new.id, 'explicit_fiscal_year_mismatch',
      v_project_fiscal_year_id, v_organization_fiscal_year_id,
      v_explicit_fiscal_year_id, v_resolved_fiscal_year_id,
      jsonb_build_object('operation', tg_op)
    );
    return new;
  end if;

  new.fiscal_year_id := coalesce(
    v_explicit_fiscal_year_id,
    v_resolved_fiscal_year_id
  );

  if new.fiscal_year_id is null then
    perform app_theatre_budget.record_fiscal_year_assignment_conflict(
      'purchases', new.id, 'unresolved',
      v_project_fiscal_year_id, v_organization_fiscal_year_id,
      v_explicit_fiscal_year_id, null,
      jsonb_build_object('operation', tg_op)
    );
  else
    update app_theatre_budget.fiscal_year_assignment_conflicts
    set status = 'auto_resolved', updated_at = now()
    where entity_table = 'purchases'
      and entity_id = new.id
      and status = 'open';
  end if;

  return new;
end;
$$;

revoke all on function app_theatre_budget.assign_purchase_fiscal_year()
  from public, anon;
grant execute on function app_theatre_budget.assign_purchase_fiscal_year()
  to authenticated;

drop trigger if exists purchases_assign_fiscal_year
  on app_theatre_budget.purchases;
create trigger purchases_assign_fiscal_year
before insert or update of project_id, organization_id, fiscal_year_id
on app_theatre_budget.purchases
for each row execute function app_theatre_budget.assign_purchase_fiscal_year();

update app_theatre_budget.purchases purchase
set fiscal_year_id = coalesce(
  (select project.fiscal_year_id
   from app_theatre_budget.projects project
   where project.id = purchase.project_id),
  (select organization.fiscal_year_id
   from app_theatre_budget.organizations organization
   where organization.id = purchase.organization_id)
)
where purchase.fiscal_year_id is null;

notify pgrst, 'reload schema';
