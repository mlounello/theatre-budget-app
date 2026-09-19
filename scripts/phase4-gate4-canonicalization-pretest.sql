\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 4: canonical organization consolidation preconditions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 1 / case when (
  select count(*) from organizations
  where active = true and superseded_by_organization_id is null
) = 9 then 1 else 0 end as expected_pre_consolidation_organization_count;

select 1 / case when (
  select count(distinct lower(trim(org_code))) from organizations
  where active = true and superseded_by_organization_id is null
) = 4 then 1 else 0 end as expected_four_organization_identities;

with proposed(legacy_id, canonical_id, org_code) as (
  values
    ('6054084f-3be7-4b35-bb87-08543e41365c'::uuid, '3a3c0ae6-9be3-4e82-950b-15ad820244cd'::uuid, '2AC200'),
    ('d9d3d185-ce96-46bf-9da4-2f8818f6c86c'::uuid, '52b71d8a-6e73-4b12-8ef1-bc1e59d52f2e'::uuid, '2AC230'),
    ('9a6802af-6559-424c-9f6c-62a94877dfd0'::uuid, '210e3c74-e1a6-47fa-819d-b444c06e5736'::uuid, '3PE000'),
    ('07abbbb4-0877-4988-a868-187fc6dc01d9'::uuid, '3370dae1-1140-47ac-9a01-ee8d15033fe0'::uuid, 'SJ5000'),
    ('0b102505-50c3-4ffc-9737-6f9ee189f606'::uuid, '3370dae1-1140-47ac-9a01-ee8d15033fe0'::uuid, 'SJ5000')
)
select 1 / case when count(*) = 5
  and bool_and(lower(trim(legacy.org_code)) = lower(trim(proposed.org_code)))
  and bool_and(lower(trim(canonical.org_code)) = lower(trim(proposed.org_code)))
  then 1 else 0 end as proposed_mappings_match_exact_org_codes
from proposed
join organizations legacy on legacy.id = proposed.legacy_id
join organizations canonical on canonical.id = proposed.canonical_id;

-- One older SJ5000 / 11080 plan intentionally remains historical because
-- repointing it would collide with the newer plan selected as current.
with proposed(legacy_id, canonical_id) as (
  values
    ('6054084f-3be7-4b35-bb87-08543e41365c'::uuid, '3a3c0ae6-9be3-4e82-950b-15ad820244cd'::uuid),
    ('d9d3d185-ce96-46bf-9da4-2f8818f6c86c'::uuid, '52b71d8a-6e73-4b12-8ef1-bc1e59d52f2e'::uuid),
    ('9a6802af-6559-424c-9f6c-62a94877dfd0'::uuid, '210e3c74-e1a6-47fa-819d-b444c06e5736'::uuid),
    ('07abbbb4-0877-4988-a868-187fc6dc01d9'::uuid, '3370dae1-1140-47ac-9a01-ee8d15033fe0'::uuid),
    ('0b102505-50c3-4ffc-9737-6f9ee189f606'::uuid, '3370dae1-1140-47ac-9a01-ee8d15033fe0'::uuid)
), collisions as (
  select legacy_plan.id
  from proposed
  join budget_plans legacy_plan on legacy_plan.organization_id = proposed.legacy_id
  join budget_plans canonical_plan
    on canonical_plan.organization_id = proposed.canonical_id
   and canonical_plan.fiscal_year_id = legacy_plan.fiscal_year_id
   and canonical_plan.account_code_id = legacy_plan.account_code_id
)
select 1 / case when count(*) = 1
  and min(id::text) = 'c1478552-6149-4b16-a161-888e3762ed0c'
  then 1 else 0 end as one_approved_historical_plan_collision
from collisions;

select 1 / case when not exists (
  select 1 from user_access_scopes
  where organization_id is not null and fiscal_year_id is null
) then 1 else 0 end as organization_scopes_never_lose_fiscal_year_identity;

rollback;
