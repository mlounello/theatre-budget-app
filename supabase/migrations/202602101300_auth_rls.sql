-- Auth bootstrap + RLS policies for MVP

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.users (id, full_name)
select au.id, coalesce(au.raw_user_meta_data ->> 'full_name', au.email)
from auth.users au
where not exists (select 1 from public.users u where u.id = au.id);

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.has_project_role(target_project_id uuid, allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
      and pm.role = any(allowed_roles)
  );
$$;

alter table public.users enable row level security;

alter view public.v_budget_line_totals set (security_invoker = true);
alter view public.v_project_totals set (security_invoker = true);
alter view public.v_project_category_totals set (security_invoker = true);
alter view public.v_cc_pending_by_code set (security_invoker = true);
alter view public.v_cc_posted_by_month set (security_invoker = true);
alter view public.v_portfolio_summary set (security_invoker = true);

drop policy if exists "project members can read projects" on public.projects;
drop policy if exists "admins can manage projects" on public.projects;

create policy "users can read own profile"
on public.users
for select
using (id = auth.uid());

create policy "users can update own profile"
on public.users
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "members can read projects"
on public.projects
for select
using (public.is_project_member(id));

create policy "project admins can manage projects"
on public.projects
for all
using (public.has_project_role(id, array['admin']::public.app_role[]))
with check (public.has_project_role(id, array['admin']::public.app_role[]));

create policy "members can read memberships"
on public.project_memberships
for select
using (
  user_id = auth.uid()
  or public.has_project_role(project_id, array['admin']::public.app_role[])
);

create policy "project admins can manage memberships"
on public.project_memberships
for all
using (public.has_project_role(project_id, array['admin']::public.app_role[]))
with check (public.has_project_role(project_id, array['admin']::public.app_role[]));

create policy "members can read budget lines"
on public.project_budget_lines
for select
using (public.is_project_member(project_id));

create policy "pm or admin can manage budget lines"
on public.project_budget_lines
for all
using (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]))
with check (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]));

create policy "members can read purchases"
on public.purchases
for select
using (public.is_project_member(project_id));

create policy "buyer pm admin can create purchases"
on public.purchases
for insert
with check (public.has_project_role(project_id, array['admin','project_manager','buyer']::public.app_role[]));

create policy "pm admin can update purchases"
on public.purchases
for update
using (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]))
with check (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]));

create policy "admin can delete purchases"
on public.purchases
for delete
using (public.has_project_role(project_id, array['admin']::public.app_role[]));

create policy "members can read purchase events"
on public.purchase_events
for select
using (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_events.purchase_id
      and public.is_project_member(p.project_id)
  )
);

create policy "buyer pm admin can create purchase events"
on public.purchase_events
for insert
with check (
  exists (
    select 1
    from public.purchases p
    where p.id = purchase_events.purchase_id
      and public.has_project_role(p.project_id, array['admin','project_manager','buyer']::public.app_role[])
  )
);

create policy "members can read income lines"
on public.income_lines
for select
using (public.is_project_member(project_id));

create policy "pm admin can manage income lines"
on public.income_lines
for all
using (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]))
with check (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]));

create policy "members can read statement months"
on public.cc_statement_months
for select
using (public.is_project_member(project_id));

create policy "pm admin can manage statement months"
on public.cc_statement_months
for all
using (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]))
with check (public.has_project_role(project_id, array['admin','project_manager']::public.app_role[]));

create policy "members can read statement lines"
on public.cc_statement_lines
for select
using (
  exists (
    select 1
    from public.cc_statement_months csm
    where csm.id = cc_statement_lines.statement_month_id
      and public.is_project_member(csm.project_id)
  )
);

create policy "pm admin can manage statement lines"
on public.cc_statement_lines
for all
using (
  exists (
    select 1
    from public.cc_statement_months csm
    where csm.id = cc_statement_lines.statement_month_id
      and public.has_project_role(csm.project_id, array['admin','project_manager']::public.app_role[])
  )
)
with check (
  exists (
    select 1
    from public.cc_statement_months csm
    where csm.id = cc_statement_lines.statement_month_id
      and public.has_project_role(csm.project_id, array['admin','project_manager']::public.app_role[])
  )
);

create policy "members can read credit cards"
on public.credit_cards
for select
using (auth.uid() is not null);

create policy "admins can manage credit cards"
on public.credit_cards
for all
using (
  exists (
    select 1 from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
);

create policy "members can read vendors"
on public.vendors
for select
using (auth.uid() is not null);

create policy "pm admin can manage vendors"
on public.vendors
for all
using (
  exists (
    select 1 from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin', 'project_manager')
  )
)
with check (
  exists (
    select 1 from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role in ('admin', 'project_manager')
  )
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.v_budget_line_totals to authenticated;
grant select on public.v_project_totals to authenticated;
grant select on public.v_project_category_totals to authenticated;
grant select on public.v_cc_pending_by_code to authenticated;
grant select on public.v_cc_posted_by_month to authenticated;
grant select on public.v_portfolio_summary to authenticated;
