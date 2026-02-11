-- Statement months are card+month, not project-scoped.

alter table public.cc_statement_months
alter column project_id drop not null;

-- Drop old project-scoped uniqueness if present.
alter table public.cc_statement_months
drop constraint if exists cc_statement_months_project_id_credit_card_id_statement_month_key;

-- Best-effort card+month uniqueness for new null-project months.
create unique index if not exists idx_cc_statement_months_card_month_unscoped
on public.cc_statement_months (credit_card_id, statement_month)
where project_id is null;

-- RLS: statement months/lines managed by any Admin or Project Manager.
drop policy if exists "members can read statement months" on public.cc_statement_months;
drop policy if exists "pm admin can manage statement months" on public.cc_statement_months;

create policy "members can read statement months"
on public.cc_statement_months
for select
to authenticated
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin', 'project_manager')
  )
);

create policy "pm admin can manage statement months"
on public.cc_statement_months
for all
to authenticated
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin', 'project_manager')
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin', 'project_manager')
  )
);

drop policy if exists "members can read statement lines" on public.cc_statement_lines;
drop policy if exists "pm admin can manage statement lines" on public.cc_statement_lines;

create policy "members can read statement lines"
on public.cc_statement_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin', 'project_manager')
  )
);

create policy "pm admin can manage statement lines"
on public.cc_statement_lines
for all
to authenticated
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin', 'project_manager')
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin', 'project_manager')
  )
);
