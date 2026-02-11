-- Follow-up for cross-project statement months:
-- v_cc_posted_by_month must derive project from statement lines, not statement month.

create or replace view public.v_cc_posted_by_month as
select
  pbl.project_id,
  csm.statement_month,
  pbl.budget_code,
  sum(csl.amount)::numeric(12, 2) as posted_total
from public.cc_statement_lines csl
join public.cc_statement_months csm on csm.id = csl.statement_month_id
join public.project_budget_lines pbl on pbl.id = csl.project_budget_line_id
group by pbl.project_id, csm.statement_month, pbl.budget_code;

alter view public.v_cc_posted_by_month set (security_invoker = true);
grant select on public.v_cc_posted_by_month to authenticated;
