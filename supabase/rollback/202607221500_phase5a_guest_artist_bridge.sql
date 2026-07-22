begin;

revoke all on function app_production_management.reconcile_all_theatre_budget_guest_artists() from service_role;
revoke all on function app_production_management.reconcile_theatre_budget_guest_artist(uuid) from service_role;

drop function if exists app_production_management.reconcile_all_theatre_budget_guest_artists();
drop function if exists app_production_management.reconcile_theatre_budget_guest_artist(uuid);
drop index if exists app_production_management.uq_pm_budget_guest_artist_source_link;

-- Reconciliation history is intentionally retained by rollback. It is audit
-- evidence, and removing it could discard information needed to diagnose or
-- reverse individual links safely.

commit;
