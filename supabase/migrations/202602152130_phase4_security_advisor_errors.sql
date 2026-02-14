-- Phase 4 Step 1: resolve current Security Advisor ERROR findings
-- Safe/idempotent changes only.

-- 1) Ensure RLS is enabled where policies exist / public tables are exposed.
alter table if exists public.users enable row level security;
alter table if exists public.budget_templates enable row level security;
alter table if exists public.budget_template_lines enable row level security;
alter table if exists public.stg_procurement_import enable row level security;

-- 2) Remove SECURITY DEFINER behavior on portfolio summary view.
-- Keep caller-context permissions/RLS behavior.
alter view if exists public.v_portfolio_summary set (security_invoker = true);
