-- Fix: admins must be able to read all fiscal years, including newly created FY rows
-- that have no linked organizations/projects yet.

drop policy if exists "admins can read fiscal years" on public.fiscal_years;
create policy "admins can read fiscal years"
on public.fiscal_years
for select
to authenticated
using (public.is_admin_user());
