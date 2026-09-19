\set ON_ERROR_STOP on
\echo 'Phase 4: timestamped, fixed-record-set FY baseline (read only)'

begin read only;
set local search_path = app_theatre_budget, public;

select 'snapshot_utc' as metric, (clock_timestamp() at time zone 'utc')::text as value;

with totals as (
  select fiscal_year.name as fiscal_year, project.id, project_total.*
  from projects project
  join fiscal_years fiscal_year on fiscal_year.id = project.fiscal_year_id
  left join v_project_totals project_total on project_total.project_id = project.id
)
select
  'project_totals' as metric,
  fiscal_year,
  count(*) as record_count,
  sum(coalesce(allocated_total, 0)) as allocated,
  sum(coalesce(requested_open_total, 0)) as requested_open,
  sum(coalesce(held_total, 0)) as held,
  sum(coalesce(enc_total, 0)) as encumbered,
  sum(coalesce(pending_cc_total, 0)) as pending_cc,
  sum(coalesce(ytd_total, 0)) as posted,
  sum(coalesce(obligated_total, 0)) as obligated,
  sum(coalesce(remaining_true, 0)) as remaining,
  sum(coalesce(remaining_if_requested_approved, 0)) as remaining_if_approved,
  md5(string_agg(id::text, ',' order by id)) as record_set_hash
from totals
group by fiscal_year
order by fiscal_year;

with plans as (
  select fiscal_year.name as fiscal_year, account.is_revenue, plan.*
  from budget_plans plan
  join fiscal_years fiscal_year on fiscal_year.id = plan.fiscal_year_id
  join account_codes account on account.id = plan.account_code_id
)
select 'budget_plans' as metric, fiscal_year, is_revenue, count(*) as record_count,
  sum(annual_amount) as amount, md5(string_agg(id::text, ',' order by id)) as record_set_hash
from plans group by fiscal_year, is_revenue order by fiscal_year, is_revenue;

with purchases_with_fy as (
  select purchase.*, purchase.fiscal_year_id as resolved_fiscal_year_id
  from purchases purchase
)
select 'purchases' as metric, fiscal_year.name as fiscal_year, count(*) as record_count,
  sum(coalesce(purchase.estimated_amount, 0)) as estimated,
  sum(coalesce(purchase.requested_amount, 0)) as requested,
  sum(coalesce(purchase.encumbered_amount, 0)) as encumbered,
  sum(coalesce(purchase.pending_cc_amount, 0)) as pending_cc,
  sum(coalesce(purchase.posted_amount, 0)) as posted,
  md5(string_agg(purchase.id::text, ',' order by purchase.id)) as record_set_hash
from purchases_with_fy purchase
left join fiscal_years fiscal_year on fiscal_year.id = purchase.resolved_fiscal_year_id
group by fiscal_year.name order by fiscal_year.name nulls last;

select 'commitments' as metric, fiscal_year.name as fiscal_year, commitment.commitment_status,
  count(*) as record_count, sum(commitment.committed_amount) as amount,
  md5(string_agg(commitment.id::text, ',' order by commitment.id)) as record_set_hash
from institutional_budget_commitments commitment
join fiscal_years fiscal_year on fiscal_year.id = commitment.fiscal_year_id
group by fiscal_year.name, commitment.commitment_status
order by fiscal_year.name, commitment.commitment_status;

select 'contracts' as metric, fiscal_year.name as fiscal_year, contract.workflow_status,
  count(*) as record_count, sum(contract.contract_value) as amount,
  md5(string_agg(contract.id::text, ',' order by contract.id)) as record_set_hash
from contracts contract
join fiscal_years fiscal_year on fiscal_year.id = contract.fiscal_year_id
group by fiscal_year.name, contract.workflow_status
order by fiscal_year.name, contract.workflow_status;

with income_with_fy as (
  select income.*, income.fiscal_year_id as resolved_fiscal_year_id
  from income_lines income
)
select 'income' as metric, fiscal_year.name as fiscal_year, count(*) as record_count,
  sum(income.amount) as amount,
  md5(string_agg(income.id::text, ',' order by income.id)) as record_set_hash
from income_with_fy income
left join fiscal_years fiscal_year on fiscal_year.id = income.resolved_fiscal_year_id
group by fiscal_year.name order by fiscal_year.name nulls last;

select 'variances' as metric, fiscal_year.name as fiscal_year, variance.status,
  count(*) as record_count, sum(variance.total_transfer_amount) as amount,
  md5(string_agg(variance.id::text, ',' order by variance.id)) as record_set_hash
from variance_requests variance
join fiscal_years fiscal_year on fiscal_year.id = variance.fiscal_year_id
group by fiscal_year.name, variance.status
order by fiscal_year.name, variance.status;

with statements_with_fy as (
  select statement.*, statement.fiscal_year_id as resolved_fiscal_year_id
  from cc_statement_months statement
)
select 'cc_statements' as metric, fiscal_year.name as fiscal_year, count(*) as record_count,
  count(*) filter (where statement.posted_at is not null) as posted_count,
  count(*) filter (where statement.posted_to_banner_at is not null) as banner_posted_count,
  md5(string_agg(statement.id::text, ',' order by statement.id)) as record_set_hash
from statements_with_fy statement
left join fiscal_years fiscal_year on fiscal_year.id = statement.resolved_fiscal_year_id
group by fiscal_year.name order by fiscal_year.name nulls last;

rollback;
