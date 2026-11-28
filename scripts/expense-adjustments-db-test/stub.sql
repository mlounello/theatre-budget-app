do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth; create schema app_theatre_budget;
grant usage on schema auth, app_theatre_budget to authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'sub','')::uuid $$;
create function app_theatre_budget.get_user_role() returns text language sql stable as $$ select coalesce(current_setting('test.role', true), 'admin') $$;
create function app_theatre_budget.is_admin_user() returns boolean language sql stable as $$ select app_theatre_budget.get_user_role() = 'admin' $$;
create table app_theatre_budget.users (id uuid primary key);
create table app_theatre_budget.cc_statement_months (id uuid primary key, fiscal_year_id uuid, credit_card_id uuid, statement_month date, posted_at timestamptz, posted_to_banner_at timestamptz);
create table app_theatre_budget.expense_claims (
  id uuid primary key default gen_random_uuid(), fiscal_year_id uuid not null, project_id uuid, organization_id uuid, credit_card_id uuid,
  claim_number text not null, claim_type text not null, claim_month date, status text not null default 'draft',
  authorized_amount numeric(12,2), settled_amount numeric(12,2), authorization_claim_id uuid references app_theatre_budget.expense_claims(id),
  entered_by_user_id uuid not null, updated_at timestamptz not null default now(),
  unique (fiscal_year_id, claim_number), check (claim_number ~ '^EC[0-9]{6}$'));
create table app_theatre_budget.purchases (
  id uuid primary key default gen_random_uuid(), fiscal_year_id uuid not null, request_type text, status text, title text, reference_number text,
  estimated_amount numeric(12,2) default 0, requested_amount numeric(12,2) default 0, encumbered_amount numeric(12,2) default 0,
  pending_cc_amount numeric(12,2) default 0, posted_amount numeric(12,2) default 0, authorized_amount numeric(12,2), cc_workflow_status text,
  expense_claim_id uuid references app_theatre_budget.expense_claims(id), expense_number text, expense_stage text,
  authorization_purchase_id uuid references app_theatre_budget.purchases(id) on delete restrict, cc_statement_month_id uuid, updated_at timestamptz default now());
create unique index uq_purchases_expense_number on app_theatre_budget.purchases (fiscal_year_id, expense_number) where expense_number is not null;
create table app_theatre_budget.purchase_allocations (id uuid primary key default gen_random_uuid(), purchase_id uuid not null references app_theatre_budget.purchases(id) on delete cascade, amount numeric(12,2), note text, updated_at timestamptz default now());
create table app_theatre_budget.purchase_events (id uuid primary key default gen_random_uuid(), purchase_id uuid not null references app_theatre_budget.purchases(id) on delete cascade, from_status text, to_status text,
  estimated_amount_snapshot numeric, requested_amount_snapshot numeric, encumbered_amount_snapshot numeric, pending_cc_amount_snapshot numeric, posted_amount_snapshot numeric, changed_by_user_id uuid, note text);
create table app_theatre_budget.purchase_receipts (id uuid primary key default gen_random_uuid(), purchase_id uuid not null references app_theatre_budget.purchases(id) on delete cascade,
  authorization_purchase_id uuid references app_theatre_budget.purchases(id) on delete restrict, cc_statement_month_id uuid, amount_received numeric(12,2), fully_received boolean default true);
create table app_theatre_budget.cc_statement_lines (id uuid primary key default gen_random_uuid(), matched_purchase_ids uuid[] not null default '{}');
grant select, insert, update, delete on all tables in schema app_theatre_budget to authenticated;
