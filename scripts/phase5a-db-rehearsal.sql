\set ON_ERROR_STOP on

do $$
declare
  people_before bigint;
  links_before bigint;
  people_after bigint;
  links_after bigint;
  result jsonb;
begin
  select count(*) into people_before from app_production_management.people;
  select count(*) into links_before
  from app_production_management.external_links
  where local_entity_type = 'person'
    and external_app = 'theatre_budget'
    and external_table = 'guest_artists';

  result := app_production_management.reconcile_all_theatre_budget_guest_artists();

  select count(*) into people_after from app_production_management.people;
  select count(*) into links_after
  from app_production_management.external_links
  where local_entity_type = 'person'
    and external_app = 'theatre_budget'
    and external_table = 'guest_artists';

  if people_after <> people_before or links_after <> links_before then
    raise exception 'Idempotency failed: people % -> %, links % -> %', people_before, people_after, links_before, links_after;
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('authenticated', 'app_production_management.reconcile_theatre_budget_guest_artist(uuid)', 'execute') then
    raise exception 'Authenticated unexpectedly has guest-artist bridge execution.';
  end if;
  if not has_function_privilege('service_role', 'app_production_management.reconcile_theatre_budget_guest_artist(uuid)', 'execute') then
    raise exception 'Service role lacks guest-artist bridge execution.';
  end if;
end;
$$;

begin;

do $$
declare
  guest_id uuid := gen_random_uuid();
  person_id uuid;
  result jsonb;
  copied_vendor text;
  copied_notes text;
  copied_email text;
begin
  insert into app_theatre_budget.guest_artists (
    id, display_name, vendor_number, email, phone, vendor_address1,
    tax_id_encrypted, tax_id_last4, notes, active
  ) values (
    guest_id, 'Phase Five Rehearsal Artist', 'DO-NOT-COPY',
    'phase5a-unique@example.invalid', '555-0100', 'Private address',
    'encrypted-private-tax-value', '9999', 'Private contract note', true
  );

  result := app_production_management.reconcile_theatre_budget_guest_artist(guest_id);
  if result ->> 'status' <> 'created' then
    raise exception 'Expected a created result, got %', result;
  end if;

  select link.local_entity_id into person_id
  from app_production_management.external_links link
  where link.external_id = guest_id::text
    and link.external_app = 'theatre_budget'
    and link.external_table = 'guest_artists';

  select vendor_number, notes, email into copied_vendor, copied_notes, copied_email
  from app_production_management.people
  where id = person_id;

  if copied_vendor <> '' or copied_notes <> '' then
    raise exception 'Financial or private notes crossed the application boundary.';
  end if;
  if copied_email <> 'phase5a-unique@example.invalid' then
    raise exception 'Expected identity email was not reconciled.';
  end if;
end;
$$;

do $$
declare
  first_guest_id uuid := gen_random_uuid();
  guest_id uuid := gen_random_uuid();
  result jsonb;
  source_link_count integer;
begin
  insert into app_theatre_budget.guest_artists (id, display_name, email, active)
  values (first_guest_id, 'Phase Five First Source', 'phase5a-duplicate@example.invalid', true);

  result := app_production_management.reconcile_theatre_budget_guest_artist(first_guest_id);
  if result ->> 'status' <> 'created' then
    raise exception 'Expected the first source to create a person, got %', result;
  end if;

  insert into app_theatre_budget.guest_artists (id, display_name, email, active)
  values (guest_id, 'Phase Five Conflict Artist', 'phase5a-duplicate@example.invalid', true);

  result := app_production_management.reconcile_theatre_budget_guest_artist(guest_id);
  if result ->> 'status' <> 'conflict' then
    raise exception 'Expected already-linked-person conflict, got %', result;
  end if;

  select count(*) into source_link_count
  from app_production_management.external_links
  where external_app = 'theatre_budget'
    and external_table = 'guest_artists'
    and external_id = guest_id::text;
  if source_link_count <> 0 then
    raise exception 'Conflict case created an unsafe source link.';
  end if;
end;
$$;

rollback;

select 'phase5a_db_rehearsal_passed' as result;
