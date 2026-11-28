\set ON_ERROR_STOP on
\echo 'Reconcile migration history: speed up institutional source candidates'

begin;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure('app_theatre_budget.get_institutional_source_candidates(uuid,uuid,uuid,date,text,uuid,boolean)')
      and l.lanname = 'plpgsql'
      and not p.prosecdef
  ) then
    raise exception 'Faster plpgsql get_institutional_source_candidates is not live.';
  end if;
end;
$$;

insert into supabase_migrations.schema_migrations (version, statements, name)
values (
  '20261128020000',
  array['Applied and verified manually in the Supabase SQL Editor.'],
  'speed_up_institutional_source_candidates'
)
on conflict (version) do nothing;

commit;
