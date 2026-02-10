-- Repair credit card RLS so PM/Admin can manage cards.

drop policy if exists "admins can manage credit cards" on public.credit_cards;
drop policy if exists "pm admin can manage credit cards" on public.credit_cards;

create policy "pm admin can manage credit cards"
on public.credit_cards
for all
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
