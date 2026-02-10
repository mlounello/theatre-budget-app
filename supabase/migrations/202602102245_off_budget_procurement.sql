-- Allow procurement records that should not affect budget rollups.

alter table public.purchases
add column if not exists budget_tracked boolean not null default true;

alter table public.purchases
alter column budget_line_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchases_budget_line_required_when_tracked'
  ) then
    alter table public.purchases
    add constraint purchases_budget_line_required_when_tracked
      check (not budget_tracked or budget_line_id is not null);
  end if;
end $$;
