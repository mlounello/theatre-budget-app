-- Add a distinct final posting timestamp for CC statements.
-- posted_at = statement paid/submitted
-- posted_to_banner_at = moved from Pending CC to Posted/YTD

alter table public.cc_statement_months
add column if not exists posted_to_banner_at timestamptz;

create index if not exists idx_cc_statement_months_posted_to_banner_at
on public.cc_statement_months (posted_to_banner_at);
