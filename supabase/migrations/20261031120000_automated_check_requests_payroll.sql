-- Automated contract check-request review/sending and temporary-employee payroll schedules.

alter table app_theatre_budget.contracts
  add column if not exists w9_attachment_path text null,
  add column if not exists employment_start_date date null,
  add column if not exists employment_end_date date null,
  add column if not exists payroll_first_pay_date date null,
  add column if not exists payroll_frequency text not null default 'biweekly';

alter table app_theatre_budget.contracts drop constraint if exists contracts_installment_count_check;
alter table app_theatre_budget.contracts add constraint contracts_installment_count_check
  check (installment_count between 1 and 40);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where connamespace = 'app_theatre_budget'::regnamespace
      and conname = 'contracts_payroll_frequency_check'
  ) then
    alter table app_theatre_budget.contracts
      add constraint contracts_payroll_frequency_check check (payroll_frequency = 'biweekly');
  end if;
end;
$$;

alter table app_theatre_budget.contract_installments
  add column if not exists automation_status text not null default 'not_ready',
  add column if not exists automation_ready_at timestamptz null,
  add column if not exists automation_ready_by_user_id uuid null references app_theatre_budget.users(id) on delete set null,
  add column if not exists automation_sent_at timestamptz null,
  add column if not exists automation_run_id uuid null,
  add column if not exists automation_last_error text null;

alter table app_theatre_budget.contract_union_contributions
  add column if not exists automation_status text not null default 'not_ready',
  add column if not exists automation_ready_at timestamptz null,
  add column if not exists automation_ready_by_user_id uuid null references app_theatre_budget.users(id) on delete set null,
  add column if not exists automation_sent_at timestamptz null,
  add column if not exists automation_run_id uuid null,
  add column if not exists automation_last_error text null;

do $$
begin
  if not exists (select 1 from pg_constraint where connamespace = 'app_theatre_budget'::regnamespace and conname = 'contract_installments_automation_status_check') then
    alter table app_theatre_budget.contract_installments add constraint contract_installments_automation_status_check
      check (automation_status in ('not_ready', 'ready', 'sending', 'sent', 'failed'));
  end if;
  if not exists (select 1 from pg_constraint where connamespace = 'app_theatre_budget'::regnamespace and conname = 'contract_union_contributions_automation_status_check') then
    alter table app_theatre_budget.contract_union_contributions add constraint contract_union_contributions_automation_status_check
      check (automation_status in ('not_ready', 'ready', 'sending', 'sent', 'failed'));
  end if;
end;
$$;

create index if not exists idx_contract_installments_automation_due
  on app_theatre_budget.contract_installments (automation_status, mail_by)
  where automation_status in ('ready', 'sending');
create index if not exists idx_union_contributions_automation_due
  on app_theatre_budget.contract_union_contributions (automation_status, mail_by)
  where automation_status in ('ready', 'sending');

create table if not exists app_theatre_budget.check_request_runs (
  id uuid primary key default gen_random_uuid(),
  scheduled_for date not null,
  status text not null default 'building',
  item_count integer not null default 0,
  recipient_email text not null,
  cc_email text null,
  resend_email_id text null,
  attachment_names text[] not null default '{}',
  error_message text null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  constraint check_request_runs_status_check check (status in ('building', 'sent', 'failed'))
);

alter table app_theatre_budget.check_request_runs enable row level security;
grant select, insert, update on app_theatre_budget.check_request_runs to authenticated;

drop policy if exists check_request_runs_admin_read on app_theatre_budget.check_request_runs;
create policy check_request_runs_admin_read on app_theatre_budget.check_request_runs
for select to authenticated using (
  app_theatre_budget.get_user_role() in ('admin', 'project_manager')
);

drop policy if exists check_request_runs_admin_manage on app_theatre_budget.check_request_runs;
create policy check_request_runs_admin_manage on app_theatre_budget.check_request_runs
for all to authenticated using (
  app_theatre_budget.get_user_role() = 'admin'
) with check (
  app_theatre_budget.get_user_role() = 'admin'
);

insert into storage.buckets (id, name, public)
values ('contract-w9s', 'contract-w9s', false)
on conflict (id) do update set public = false;

drop policy if exists contract_w9s_authenticated_read on storage.objects;
create policy contract_w9s_authenticated_read on storage.objects
for select to authenticated using (bucket_id = 'contract-w9s');

drop policy if exists contract_w9s_authenticated_insert on storage.objects;
create policy contract_w9s_authenticated_insert on storage.objects
for insert to authenticated with check (bucket_id = 'contract-w9s');

drop policy if exists contract_w9s_authenticated_update on storage.objects;
create policy contract_w9s_authenticated_update on storage.objects
for update to authenticated using (bucket_id = 'contract-w9s') with check (bucket_id = 'contract-w9s');

drop policy if exists contract_w9s_authenticated_delete on storage.objects;
create policy contract_w9s_authenticated_delete on storage.objects
for delete to authenticated using (bucket_id = 'contract-w9s');
