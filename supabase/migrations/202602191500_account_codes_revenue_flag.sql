-- Mark account codes as revenue-capable for income tracking while keeping them usable everywhere.

alter table public.account_codes
add column if not exists is_revenue boolean not null default false;

create index if not exists idx_account_codes_is_revenue on public.account_codes (is_revenue);
