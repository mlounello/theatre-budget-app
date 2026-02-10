-- Fixed university account codes (read-only in app)

create table if not exists public.account_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.account_codes enable row level security;

insert into public.account_codes (code, category, name, active)
values
  ('11300', 'Scenic', 'Scenic', true),
  ('11301', 'Lighting', 'Lighting', true),
  ('11302', 'Sound', 'Sound', true),
  ('11303', 'Video', 'Video', true),
  ('11304', 'Props', 'Props', true),
  ('11305', 'Costumes', 'Costumes', true),
  ('11306', 'Music', 'Music', true),
  ('11307', 'Ticketing Supplies', 'Ticketing Supplies', true),
  ('11308', 'Production Supplies', 'Miscellaneous', true),
  ('11309', 'Rights', 'Rights', true),
  ('11220', 'Travel', 'Lodging', true),
  ('11412', 'Hospitality', 'Meals with Guests', true)
on conflict (code) do update
set
  category = excluded.category,
  name = excluded.name,
  active = excluded.active;

alter table public.project_budget_lines
add column if not exists account_code_id uuid references public.account_codes (id) on delete restrict;

update public.project_budget_lines pbl
set account_code_id = ac.id
from public.account_codes ac
where ac.code = pbl.budget_code
  and pbl.account_code_id is null;

drop policy if exists "members can read account codes" on public.account_codes;
create policy "members can read account codes"
on public.account_codes
for select
using (auth.uid() is not null);

grant select on public.account_codes to authenticated;
