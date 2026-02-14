-- Phase 1 validation pack
-- Run after applying 202602151400_phase1_access_rls_cleanup.sql.

-- 1) Verify helper functions exist.
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('is_admin_user', 'is_project_member', 'has_project_role', 'is_org_member', 'has_org_role')
order by proname;

-- 2) Verify duplicate project/vendor/purchase policies are collapsed.
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'projects' and policyname in (
      'project members can read projects',
      'members can read projects',
      'admins can manage projects',
      'project admins can manage projects'
    ))
    or (tablename = 'vendors' and policyname in (
      'pm admin can manage vendors',
      'pm admin buyer can manage vendors'
    ))
    or (tablename = 'purchases' and policyname in (
      'members can read purchases',
      'buyer pm admin can create purchases',
      'pm admin can update purchases',
      'admin can delete purchases',
      'purchases_select_member',
      'purchases_insert_buyer_pm_admin',
      'purchases_update_pm_admin',
      'purchases_delete_admin'
    ))
    or (tablename = 'purchase_events' and policyname in (
      'members can read purchase events',
      'buyer pm admin can create purchase events',
      'purchase_events_select_member',
      'purchase_events_insert_member'
    ))
  )
order by tablename, policyname;

-- Expected after migration:
-- projects: members can read projects + project admins can manage projects
-- vendors: pm admin buyer can manage vendors
-- purchases: purchases_select_member + purchases_insert_buyer_pm_admin + purchases_update_pm_admin + purchases_delete_admin
-- purchase_events: purchase_events_select_member + purchase_events_insert_member

-- 3) Check for duplicate scopes that would violate identity uniqueness.
select
  user_id,
  scope_role,
  coalesce(fiscal_year_id, '00000000-0000-0000-0000-000000000000'::uuid) as fiscal_year_id,
  coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid) as organization_id,
  coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid) as project_id,
  coalesce(production_category_id, '00000000-0000-0000-0000-000000000000'::uuid) as production_category_id,
  count(*) as duplicate_count
from public.user_access_scopes
group by 1,2,3,4,5,6
having count(*) > 1;

-- 4) Sanity check one scoped user has visible projects via helper.
-- Replace USER_ID with the test user's UUID.
-- select p.id, p.name, public.is_project_member(p.id) as can_see
-- from public.projects p
-- where exists (
--   select 1 from public.user_access_scopes uas
--   where uas.user_id = 'USER_ID'::uuid
--     and uas.active = true
-- )
-- order by p.name;
