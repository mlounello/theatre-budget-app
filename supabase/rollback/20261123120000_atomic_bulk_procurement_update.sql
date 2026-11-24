-- Roll back apply_procurement_bulk_update. Deploy the application revision that
-- no longer calls this function BEFORE running this, or bulk updates will fail.
-- The function holds no data, so dropping it loses nothing.
drop function if exists app_theatre_budget.apply_procurement_bulk_update(jsonb);
