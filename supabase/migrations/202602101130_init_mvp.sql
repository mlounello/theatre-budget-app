-- Theatre Budget App MVP schema
create extension if not exists "pgcrypto";

create type public.app_role as enum (
  'admin',
  'project_manager',
  'buyer',
  'viewer'
);

create type public.purchase_status as enum (
  'requested',
  'encumbered',
  'pending_cc',
  'posted',
  'cancelled'
);

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text,
  status text not null default 'active',
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.app_role not null,
  code_scope text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.budget_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.budget_template_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.budget_templates (id) on delete cascade,
  budget_code text not null,
  category text not null,
  line_name text not null,
  default_allocated_amount numeric(12, 2) not null default 0,
  sort_order int not null default 0,
  unique (template_id, budget_code, category, line_name)
);

create table if not exists public.project_budget_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  budget_code text not null,
  category text not null,
  line_name text not null,
  allocated_amount numeric(12, 2) not null default 0,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_id, budget_code, category, line_name)
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  nickname text not null unique,
  masked_number text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  budget_line_id uuid not null references public.project_budget_lines (id) on delete restrict,
  vendor_id uuid references public.vendors (id) on delete set null,
  entered_by_user_id uuid not null references public.users (id) on delete restrict,
  title text not null,
  reference_number text,
  notes text,
  estimated_amount numeric(12, 2) not null default 0,
  requested_amount numeric(12, 2) not null default 0,
  encumbered_amount numeric(12, 2) not null default 0,
  pending_cc_amount numeric(12, 2) not null default 0,
  posted_amount numeric(12, 2) not null default 0,
  status public.purchase_status not null default 'requested',
  purchase_date date,
  posted_date date,
  credit_card_id uuid references public.credit_cards (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_events (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  from_status public.purchase_status,
  to_status public.purchase_status not null,
  estimated_amount_snapshot numeric(12, 2) not null default 0,
  requested_amount_snapshot numeric(12, 2) not null default 0,
  encumbered_amount_snapshot numeric(12, 2) not null default 0,
  pending_cc_amount_snapshot numeric(12, 2) not null default 0,
  posted_amount_snapshot numeric(12, 2) not null default 0,
  changed_by_user_id uuid not null references public.users (id) on delete restrict,
  note text,
  changed_at timestamptz not null default now()
);

create table if not exists public.cc_statement_months (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards (id) on delete restrict,
  statement_month date not null,
  posted_at timestamptz,
  created_by_user_id uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, credit_card_id, statement_month)
);

create table if not exists public.cc_statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_month_id uuid not null references public.cc_statement_months (id) on delete cascade,
  project_budget_line_id uuid not null references public.project_budget_lines (id) on delete restrict,
  amount numeric(12, 2) not null,
  note text,
  matched_purchase_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.income_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  line_name text not null,
  reference_number text,
  amount numeric(12, 2) not null,
  received_on date,
  created_by_user_id uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create or replace view public.v_budget_line_totals as
select
  pbl.id as project_budget_line_id,
  pbl.project_id,
  pbl.budget_code,
  pbl.category,
  pbl.line_name,
  pbl.allocated_amount,
  coalesce(sum(pr.requested_amount) filter (where pr.status = 'requested'), 0)::numeric(12, 2) as requested_open_total,
  coalesce(sum(pr.encumbered_amount) filter (where pr.status = 'encumbered'), 0)::numeric(12, 2) as enc_total,
  coalesce(sum(pr.pending_cc_amount) filter (where pr.status = 'pending_cc'), 0)::numeric(12, 2) as pending_cc_total,
  coalesce(sum(pr.posted_amount) filter (where pr.status = 'posted'), 0)::numeric(12, 2) as ytd_total,
  (
    coalesce(sum(pr.encumbered_amount) filter (where pr.status = 'encumbered'), 0)
    + coalesce(sum(pr.pending_cc_amount) filter (where pr.status = 'pending_cc'), 0)
    + coalesce(sum(pr.posted_amount) filter (where pr.status = 'posted'), 0)
  )::numeric(12, 2) as obligated_total,
  (
    pbl.allocated_amount
    - (
      coalesce(sum(pr.encumbered_amount) filter (where pr.status = 'encumbered'), 0)
      + coalesce(sum(pr.pending_cc_amount) filter (where pr.status = 'pending_cc'), 0)
      + coalesce(sum(pr.posted_amount) filter (where pr.status = 'posted'), 0)
    )
  )::numeric(12, 2) as remaining_true,
  (
    pbl.allocated_amount
    - (
      coalesce(sum(pr.encumbered_amount) filter (where pr.status = 'encumbered'), 0)
      + coalesce(sum(pr.pending_cc_amount) filter (where pr.status = 'pending_cc'), 0)
      + coalesce(sum(pr.posted_amount) filter (where pr.status = 'posted'), 0)
      + coalesce(sum(pr.requested_amount) filter (where pr.status = 'requested'), 0)
    )
  )::numeric(12, 2) as remaining_if_requested_approved
from public.project_budget_lines pbl
left join public.purchases pr on pr.budget_line_id = pbl.id
group by pbl.id;

create or replace view public.v_project_totals as
select
  project_id,
  sum(allocated_amount)::numeric(12, 2) as allocated_total,
  sum(requested_open_total)::numeric(12, 2) as requested_open_total,
  sum(enc_total)::numeric(12, 2) as enc_total,
  sum(pending_cc_total)::numeric(12, 2) as pending_cc_total,
  sum(ytd_total)::numeric(12, 2) as ytd_total,
  sum(obligated_total)::numeric(12, 2) as obligated_total,
  sum(remaining_true)::numeric(12, 2) as remaining_true,
  sum(remaining_if_requested_approved)::numeric(12, 2) as remaining_if_requested_approved
from public.v_budget_line_totals
group by project_id;

create or replace view public.v_project_category_totals as
select
  project_id,
  category,
  sum(allocated_amount)::numeric(12, 2) as allocated_total,
  sum(requested_open_total)::numeric(12, 2) as requested_open_total,
  sum(enc_total)::numeric(12, 2) as enc_total,
  sum(pending_cc_total)::numeric(12, 2) as pending_cc_total,
  sum(ytd_total)::numeric(12, 2) as ytd_total,
  sum(obligated_total)::numeric(12, 2) as obligated_total,
  sum(remaining_true)::numeric(12, 2) as remaining_true,
  sum(remaining_if_requested_approved)::numeric(12, 2) as remaining_if_requested_approved
from public.v_budget_line_totals
group by project_id, category;

create or replace view public.v_cc_pending_by_code as
select
  p.project_id,
  pbl.budget_code,
  cc.id as credit_card_id,
  cc.nickname as credit_card_name,
  sum(p.pending_cc_amount)::numeric(12, 2) as pending_cc_total
from public.purchases p
left join public.project_budget_lines pbl on pbl.id = p.budget_line_id
left join public.credit_cards cc on cc.id = p.credit_card_id
where p.status = 'pending_cc'
group by p.project_id, pbl.budget_code, cc.id, cc.nickname;

create or replace view public.v_cc_posted_by_month as
select
  csm.project_id,
  csm.statement_month,
  pbl.budget_code,
  sum(csl.amount)::numeric(12, 2) as posted_total
from public.cc_statement_lines csl
join public.cc_statement_months csm on csm.id = csl.statement_month_id
join public.project_budget_lines pbl on pbl.id = csl.project_budget_line_id
group by csm.project_id, csm.statement_month, pbl.budget_code;

create or replace view public.v_portfolio_summary as
select
  p.id as project_id,
  p.name as project_name,
  p.season,
  coalesce(vpt.allocated_total, 0)::numeric(12, 2) as allocated_total,
  coalesce(vpt.obligated_total, 0)::numeric(12, 2) as obligated_total,
  coalesce(vpt.remaining_true, 0)::numeric(12, 2) as remaining_true,
  coalesce(vpt.remaining_if_requested_approved, 0)::numeric(12, 2) as remaining_if_requested_approved,
  coalesce(sum(il.amount), 0)::numeric(12, 2) as income_total
from public.projects p
left join public.v_project_totals vpt on vpt.project_id = p.id
left join public.income_lines il on il.project_id = p.id
group by p.id, p.name, p.season, vpt.allocated_total, vpt.obligated_total, vpt.remaining_true, vpt.remaining_if_requested_approved;

alter table public.projects enable row level security;
alter table public.project_memberships enable row level security;
alter table public.project_budget_lines enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_events enable row level security;
alter table public.credit_cards enable row level security;
alter table public.cc_statement_months enable row level security;
alter table public.cc_statement_lines enable row level security;
alter table public.income_lines enable row level security;
alter table public.vendors enable row level security;

create policy "project members can read projects"
on public.projects
for select
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = projects.id
      and pm.user_id = auth.uid()
  )
);

create policy "admins can manage projects"
on public.projects
for all
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = projects.id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = projects.id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
);
