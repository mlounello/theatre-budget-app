-- Repair CC statement RLS to support global admins and project managers.

drop policy if exists "pm admin can manage statement months" on public.cc_statement_months;
create policy "pm admin can manage statement months"
on public.cc_statement_months
for all
using (
  public.is_any_admin()
  or public.has_project_role(project_id, array['project_manager']::public.app_role[])
)
with check (
  public.is_any_admin()
  or public.has_project_role(project_id, array['project_manager']::public.app_role[])
);

drop policy if exists "pm admin can manage statement lines" on public.cc_statement_lines;
create policy "pm admin can manage statement lines"
on public.cc_statement_lines
for all
using (
  exists (
    select 1
    from public.cc_statement_months csm
    where csm.id = cc_statement_lines.statement_month_id
      and (
        public.is_any_admin()
        or public.has_project_role(csm.project_id, array['project_manager']::public.app_role[])
      )
  )
)
with check (
  exists (
    select 1
    from public.cc_statement_months csm
    where csm.id = cc_statement_lines.statement_month_id
      and (
        public.is_any_admin()
        or public.has_project_role(csm.project_id, array['project_manager']::public.app_role[])
      )
  )
);
