-- Hiring cancellation is historical, not destructive: paid rows remain paid while
-- future planned payments can be cancelled without appearing in alerts or budgets.

alter table app_theatre_budget.contracts
  drop constraint if exists contracts_workflow_status_check;

alter table app_theatre_budget.contracts
  add constraint contracts_workflow_status_check
  check (
    workflow_status in (
      'w9_requested',
      'contract_sent',
      'contract_signed_returned',
      'siena_signed',
      'cancelled'
    )
  );

alter table app_theatre_budget.contract_installments
  drop constraint if exists contract_installments_status_check;

alter table app_theatre_budget.contract_installments
  add constraint contract_installments_status_check
  check (status in ('planned', 'check_request_submitted', 'check_paid', 'cancelled'));

alter table app_theatre_budget.contract_union_contributions
  drop constraint if exists contract_union_contributions_status_check;

alter table app_theatre_budget.contract_union_contributions
  add constraint contract_union_contributions_status_check
  check (status in ('planned', 'check_request_submitted', 'check_paid', 'cancelled'));
