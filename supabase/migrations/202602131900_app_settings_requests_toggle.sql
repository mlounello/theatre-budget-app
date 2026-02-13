-- App-level settings (singleton row), including optional planning requests module toggle.

create table if not exists public.app_settings (
  id integer primary key check (id = 1),
  planning_requests_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

insert into public.app_settings (id, planning_requests_enabled)
values (1, true)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "authenticated can read app settings" on public.app_settings;
create policy "authenticated can read app settings"
on public.app_settings
for select
to authenticated
using (true);

drop policy if exists "admins can update app settings" on public.app_settings;
create policy "admins can update app settings"
on public.app_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
);

drop policy if exists "admins can insert app settings" on public.app_settings;
create policy "admins can insert app settings"
on public.app_settings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.project_memberships pm
    where pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
);

grant select, insert, update on public.app_settings to authenticated;
