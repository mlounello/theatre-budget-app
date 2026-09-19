\set ON_ERROR_STOP on
\echo 'Phase 4 Gate 2: scoped RLS assertions (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select user_id as admin_user_id
from core.app_memberships
where app_id = 'theatre_budget'
  and is_active
  and lower(role) = 'admin'
order by user_id
limit 1
\gset

with expected_by_user as (
  select
    scoped_user.user_id,
    count(distinct purchase.id) as expected_purchase_count
  from (
    select distinct user_id
    from user_access_scopes
    where active and scope_role = 'viewer'
  ) scoped_user
  left join user_access_scopes scope
    on scope.user_id = scoped_user.user_id and scope.active
  left join purchases purchase
    on (scope.fiscal_year_id is null or scope.fiscal_year_id = purchase.fiscal_year_id)
   and (
     scope.organization_id is null
     or scope.organization_id = coalesce(
       purchase.organization_id,
       (select project.organization_id from projects project where project.id = purchase.project_id)
     )
   )
   and (scope.project_id is null or scope.project_id = purchase.project_id)
   and (
     scope.production_category_id is null
     or scope.production_category_id = purchase.production_category_id
   )
  group by scoped_user.user_id
)
select user_id as viewer_user_id, expected_purchase_count
from expected_by_user
where expected_purchase_count > 0
order by expected_purchase_count desc, user_id
limit 1
\gset

select count(*) as total_purchase_count from purchases \gset
select count(*) as total_income_count from income_lines \gset

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_user_id')::text, true);

select 1 / case when (select count(*) from purchases) = :total_purchase_count
  then 1 else 0 end as admin_can_read_all_purchases;
select 1 / case when (select count(*) from income_lines) = :total_income_count
  then 1 else 0 end as admin_can_read_all_income;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'viewer_user_id')::text, true);

select 1 / case when (select count(*) from purchases) = :expected_purchase_count
  then 1 else 0 end as viewer_purchase_scope_is_exact;
select 1 / case when (select count(*) from purchases) < :total_purchase_count
  then 1 else 0 end as viewer_is_denied_out_of_scope_purchases;

reset role;
rollback;
