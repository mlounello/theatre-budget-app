set search_path = app_theatre_budget, public;

-- Planned contract installments are not POs yet, but they are real production
-- budget commitments. Keep them visible in requested/commitment rollups until
-- they move to encumbered or posted.
update app_theatre_budget.purchases
set requested_amount = coalesce(nullif(estimated_amount, 0), requested_amount, 0)
where request_type = 'contract_payment'
  and status = 'requested'
  and coalesce(requested_amount, 0) = 0
  and coalesce(estimated_amount, 0) <> 0;
