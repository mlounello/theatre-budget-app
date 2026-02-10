-- Add explicit income types for starting budget, donations, and ticket sales tracking.

alter table public.income_lines
add column if not exists income_type text not null default 'other';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'income_lines_income_type_check'
      and conrelid = 'public.income_lines'::regclass
  ) then
    alter table public.income_lines
    add constraint income_lines_income_type_check
    check (income_type in ('starting_budget', 'donation', 'ticket_sales', 'other'));
  end if;
end $$;

create index if not exists idx_income_lines_income_type on public.income_lines (income_type);

update public.income_lines
set income_type = 'starting_budget'
where income_type = 'other'
  and line_name ilike '%starting budget%';

update public.income_lines
set income_type = 'donation'
where income_type = 'other'
  and line_name ilike '%donation%';

update public.income_lines
set income_type = 'ticket_sales'
where income_type = 'other'
  and (
    line_name ilike '%ticket%'
    or line_name ilike '%box office%'
  );
