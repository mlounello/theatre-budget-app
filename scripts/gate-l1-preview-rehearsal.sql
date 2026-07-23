\set ON_ERROR_STOP on
\pset pager off

begin;

create temporary table gate_l1_baseline as
select
  (select count(*) from app_theatre_budget.projects) as project_count,
  (select count(*) from app_theatre_budget.account_codes) as account_code_count,
  (select count(*) from app_theatre_budget.project_budget_lines) as budget_line_count,
  (select count(*) from app_theatre_budget.contracts) as contract_count,
  (select count(*) from app_theatre_budget.purchases) as purchase_count,
  (select count(*) from app_theatre_budget.user_access_scopes) as access_scope_count,
  (select count(*) from app_theatre_budget.project_memberships) as project_membership_count;

\ir ../supabase/migrations/202607231700_gate_l1_theatre_budget_function_auth.sql

do $test$
declare
  function_oid regprocedure;
begin
  foreach function_oid in array array[
    'app_theatre_budget.seed_all_project_budget_lines_from_account_codes()'::regprocedure,
    'app_theatre_budget.seed_project_budget_lines_for_account_code(uuid)'::regprocedure,
    'app_theatre_budget.seed_project_budget_lines_for_project(uuid)'::regprocedure
  ]
  loop
    if has_function_privilege('anon', function_oid, 'execute')
       or has_function_privilege('authenticated', function_oid, 'execute') then
      raise exception 'Client role still has seed execution: %', function_oid;
    end if;
    if not has_function_privilege('service_role', function_oid, 'execute') then
      raise exception 'Service role lost seed execution: %', function_oid;
    end if;
  end loop;

  function_oid :=
    'app_theatre_budget.ensure_project_category_line(uuid,uuid)'::regprocedure;
  if has_function_privilege('anon', function_oid, 'execute') then
    raise exception 'Anonymous role can still ensure a budget line.';
  end if;
  if not has_function_privilege('authenticated', function_oid, 'execute')
     or not has_function_privilege('service_role', function_oid, 'execute') then
    raise exception 'Required ensure-project-category-line grant is missing.';
  end if;
end;
$test$;

create temporary table gate_l1_context as
select
  line.project_id,
  line.production_category_id,
  line.id as expected_line_id,
  (
    select alternate.production_category_id
    from app_theatre_budget.project_budget_lines alternate
    where alternate.project_id = line.project_id
      and alternate.production_category_id is not null
      and alternate.production_category_id <> line.production_category_id
    order by alternate.created_at, alternate.id
    limit 1
  ) as alternate_category_id,
  (
    select owner_record.user_id
    from core.platform_owners owner_record
    order by owner_record.created_at
    limit 1
  ) as owner_user_id,
  (
    select candidate.id
    from app_theatre_budget.users candidate
    where not core.is_platform_owner(candidate.id)
      and not exists (
        select 1
        from core.app_memberships membership
        where membership.user_id = candidate.id
          and membership.app_id = 'theatre_budget'
          and membership.is_active
      )
      and not exists (
        select 1
        from app_theatre_budget.project_memberships membership
        where membership.user_id = candidate.id
      )
      and not exists (
        select 1
        from app_theatre_budget.user_access_scopes scope
        where scope.user_id = candidate.id
          and scope.active
      )
    order by candidate.created_at
    limit 1
  ) as unrelated_user_id
from app_theatre_budget.project_budget_lines line
where line.production_category_id is not null
order by line.created_at, line.id
limit 1;

create temporary table gate_l1_member_context as
select
  membership.user_id,
  line.project_id,
  line.production_category_id,
  line.id as expected_line_id
from app_theatre_budget.project_memberships membership
join app_theatre_budget.project_budget_lines line
  on line.project_id = membership.project_id
where membership.role in (
    'admin'::app_theatre_budget.app_role,
    'project_manager'::app_theatre_budget.app_role,
    'buyer'::app_theatre_budget.app_role
  )
  and line.production_category_id is not null
order by membership.created_at, line.created_at, line.id
limit 1;

do $test$
declare
  context_record gate_l1_context%rowtype;
  member_record gate_l1_member_context%rowtype;
  temporary_scope_id uuid;
begin
  select * into strict context_record from gate_l1_context;
  if context_record.owner_user_id is null
     or context_record.unrelated_user_id is null
     or context_record.alternate_category_id is null then
    raise exception 'Required authorization test identity is missing.';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', context_record.unrelated_user_id,
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    context_record.unrelated_user_id::text,
    true
  );

  begin
    perform app_theatre_budget.ensure_project_category_line(
      context_record.project_id,
      context_record.production_category_id
    );
    raise exception 'Gate L1 expected unrelated-user denial.';
  exception
    when others then
      if sqlerrm = 'Gate L1 expected unrelated-user denial.' then
        raise;
      end if;
      if sqlerrm <> 'You do not have permission to manage this project budget line.' then
        raise exception 'Unexpected unrelated-user result: %', sqlerrm;
      end if;
  end;

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', context_record.owner_user_id,
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    context_record.owner_user_id::text,
    true
  );

  if app_theatre_budget.ensure_project_category_line(
       context_record.project_id,
       context_record.production_category_id
     ) <> context_record.expected_line_id then
    raise exception 'Owner did not receive the existing budget line.';
  end if;

  select * into strict member_record from gate_l1_member_context;
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', member_record.user_id,
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    member_record.user_id::text,
    true
  );

  if app_theatre_budget.ensure_project_category_line(
       member_record.project_id,
       member_record.production_category_id
     ) <> member_record.expected_line_id then
    raise exception 'Project member did not receive the existing budget line.';
  end if;

  insert into app_theatre_budget.user_access_scopes (
    user_id,
    scope_role,
    project_id,
    production_category_id,
    active
  )
  values (
    context_record.unrelated_user_id,
    'buyer'::app_theatre_budget.app_role,
    context_record.project_id,
    context_record.production_category_id,
    true
  )
  returning id into temporary_scope_id;

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', context_record.unrelated_user_id,
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    context_record.unrelated_user_id::text,
    true
  );

  if app_theatre_budget.ensure_project_category_line(
       context_record.project_id,
       context_record.production_category_id
     ) <> context_record.expected_line_id then
    raise exception 'Category-scoped buyer did not receive the matching line.';
  end if;

  begin
    perform app_theatre_budget.ensure_project_category_line(
      context_record.project_id,
      context_record.alternate_category_id
    );
    raise exception 'Gate L1 expected category-scope denial.';
  exception
    when others then
      if sqlerrm = 'Gate L1 expected category-scope denial.' then
        raise;
      end if;
      if sqlerrm <> 'You do not have permission to manage this project budget line.' then
        raise exception 'Unexpected category-scope result: %', sqlerrm;
      end if;
  end;

  delete from app_theatre_budget.user_access_scopes
  where id = temporary_scope_id;
end;
$test$;

do $test$
declare
  before_record gate_l1_baseline%rowtype;
  after_record gate_l1_baseline%rowtype;
begin
  select * into strict before_record from gate_l1_baseline;
  select
    (select count(*) from app_theatre_budget.projects),
    (select count(*) from app_theatre_budget.account_codes),
    (select count(*) from app_theatre_budget.project_budget_lines),
    (select count(*) from app_theatre_budget.contracts),
    (select count(*) from app_theatre_budget.purchases),
    (select count(*) from app_theatre_budget.user_access_scopes),
    (select count(*) from app_theatre_budget.project_memberships)
  into strict after_record;

  if row(before_record.*) is distinct from row(after_record.*) then
    raise exception 'Protected Theatre Budget counts changed during rehearsal.';
  end if;
end;
$test$;

select
  'gate_l1_preview_passed' as result,
  project_count,
  account_code_count,
  budget_line_count,
  contract_count,
  purchase_count,
  access_scope_count,
  project_membership_count
from gate_l1_baseline;

rollback;
