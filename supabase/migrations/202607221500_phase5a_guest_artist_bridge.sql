begin;

create table if not exists app_production_management.integration_reconciliation_log (
  id uuid primary key default gen_random_uuid(),
  integration_key text not null,
  source_entity_id uuid,
  target_entity_id uuid,
  status text not null,
  detail text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (status in ('created', 'linked', 'updated', 'disabled', 'not_ready', 'conflict', 'failed'))
);

create index if not exists idx_integration_reconciliation_log_source
  on app_production_management.integration_reconciliation_log (integration_key, source_entity_id, created_at desc);

alter table app_production_management.integration_reconciliation_log enable row level security;
revoke all on app_production_management.integration_reconciliation_log from public, anon, authenticated;
grant select, insert on app_production_management.integration_reconciliation_log to service_role;

create unique index if not exists uq_pm_budget_guest_artist_source_link
  on app_production_management.external_links (external_app, external_schema, external_table, external_id)
  where local_entity_type = 'person'
    and external_app = 'theatre_budget'
    and external_schema = 'app_theatre_budget'
    and external_table = 'guest_artists';

create or replace function app_production_management.reconcile_theatre_budget_guest_artist(
  target_guest_artist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  guest_artist app_theatre_budget.guest_artists%rowtype;
  matched_person_id uuid;
  existing_source_id text;
  email_match_count integer := 0;
  reconciliation_status text;
  match_method text := 'source_id';
  first_name_value text;
  last_name_value text;
begin
  perform pg_advisory_xact_lock(hashtextextended('theatre_budget_guest_artist:' || target_guest_artist_id::text, 0));

  select * into guest_artist
  from app_theatre_budget.guest_artists
  where id = target_guest_artist_id;

  if guest_artist.id is null then
    raise exception 'Theatre Budget guest artist was not found.';
  end if;

  select link.local_entity_id into matched_person_id
  from app_production_management.external_links link
  where link.local_entity_type = 'person'
    and link.external_app = 'theatre_budget'
    and link.external_schema = 'app_theatre_budget'
    and link.external_table = 'guest_artists'
    and link.external_id = guest_artist.id::text
  order by link.created_at
  limit 1;

  if matched_person_id is not null and not exists (
    select 1 from app_production_management.people person where person.id = matched_person_id
  ) then
    matched_person_id := null;
  end if;

  if matched_person_id is null and nullif(trim(coalesce(guest_artist.email, '')), '') is not null then
    select count(*), (array_agg(person.id order by person.created_at, person.id))[1]
    into email_match_count, matched_person_id
    from app_production_management.people person
    where lower(trim(person.email)) = lower(trim(guest_artist.email));

    if email_match_count > 1 then
      insert into app_production_management.integration_reconciliation_log (
        integration_key, source_entity_id, status, detail, metadata
      ) values (
        'theatre_budget_guest_artist_to_pm_person', guest_artist.id, 'conflict',
        'More than one Production Management person has this email; no automatic link was created.',
        jsonb_build_object('email_match_count', email_match_count)
      );
      return jsonb_build_object('status', 'conflict', 'reason', 'duplicate_email', 'match_count', email_match_count);
    end if;

    if email_match_count = 1 then
      match_method := 'email';

      select link.external_id into existing_source_id
      from app_production_management.external_links link
      where link.local_entity_type = 'person'
        and link.local_entity_id = matched_person_id
        and link.external_app = 'theatre_budget'
        and link.external_schema = 'app_theatre_budget'
        and link.external_table = 'guest_artists'
        and link.external_id <> guest_artist.id::text
      order by link.created_at
      limit 1;

      if existing_source_id is not null then
        insert into app_production_management.integration_reconciliation_log (
          integration_key, source_entity_id, target_entity_id, status, detail
        ) values (
          'theatre_budget_guest_artist_to_pm_person', guest_artist.id, matched_person_id, 'conflict',
          'The email-matched Production Management person is already linked to another Theatre Budget guest artist.'
        );
        return jsonb_build_object('status', 'conflict', 'reason', 'person_already_linked', 'person_id', matched_person_id);
      end if;
    end if;
  end if;

  if matched_person_id is null then
    first_name_value := split_part(trim(guest_artist.display_name), ' ', 1);
    last_name_value := trim(substring(trim(guest_artist.display_name) from length(first_name_value) + 1));

    insert into app_production_management.people (
      first_name, last_name, full_name, email, phone, affiliation, person_type, status
    ) values (
      first_name_value,
      last_name_value,
      trim(guest_artist.display_name),
      coalesce(trim(guest_artist.email), ''),
      coalesce(trim(guest_artist.phone), ''),
      'Theatre Budget guest artist',
      'guest_artist',
      'active'
    )
    returning id into matched_person_id;

    reconciliation_status := 'created';
    match_method := 'created';
  else
    update app_production_management.people person
    set full_name = trim(guest_artist.display_name),
        email = case when nullif(trim(coalesce(guest_artist.email, '')), '') is not null then trim(guest_artist.email) else person.email end,
        phone = case when nullif(trim(coalesce(guest_artist.phone, '')), '') is not null then trim(guest_artist.phone) else person.phone end,
        person_type = case when person.person_type = 'person' then 'guest_artist' else person.person_type end,
        affiliation = case when nullif(trim(person.affiliation), '') is null then 'Theatre Budget guest artist' else person.affiliation end,
        updated_at = now()
    where person.id = matched_person_id;

    reconciliation_status := case when match_method = 'email' then 'linked' else 'updated' end;
  end if;

  insert into app_production_management.external_links (
    local_entity_type, local_entity_id, external_app, external_schema, external_table,
    external_id, sync_direction, sync_status, metadata, updated_at
  ) values (
    'person', matched_person_id, 'theatre_budget', 'app_theatre_budget', 'guest_artists',
    guest_artist.id::text, 'pull', case when guest_artist.active then 'synced' else 'disabled' end,
    jsonb_build_object(
      'display_name', guest_artist.display_name,
      'email', guest_artist.email,
      'active', guest_artist.active,
      'linked_from', 'theatre_budget_guest_artist_reconciliation',
      'match_method', match_method
    ),
    now()
  )
  on conflict (external_app, external_schema, external_table, external_id)
    where local_entity_type = 'person'
      and external_app = 'theatre_budget'
      and external_schema = 'app_theatre_budget'
      and external_table = 'guest_artists'
  do update set
    local_entity_id = excluded.local_entity_id,
    sync_direction = excluded.sync_direction,
    sync_status = excluded.sync_status,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at;

  if not guest_artist.active then
    reconciliation_status := 'disabled';
  end if;

  insert into app_production_management.integration_reconciliation_log (
    integration_key, source_entity_id, target_entity_id, status, detail, metadata
  ) values (
    'theatre_budget_guest_artist_to_pm_person', guest_artist.id, matched_person_id,
    reconciliation_status, 'Guest artist identity/contact reconciliation completed.',
    jsonb_build_object('match_method', match_method, 'source_active', guest_artist.active)
  );

  return jsonb_build_object(
    'status', reconciliation_status,
    'person_id', matched_person_id,
    'match', match_method
  );
exception when others then
  insert into app_production_management.integration_reconciliation_log (
    integration_key, source_entity_id, status, detail
  ) values (
    'theatre_budget_guest_artist_to_pm_person', target_guest_artist_id, 'failed', sqlerrm
  );
  raise;
end;
$$;

create or replace function app_production_management.reconcile_all_theatre_budget_guest_artists()
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  guest_artist_id uuid;
  result jsonb;
  processed integer := 0;
  attention integer := 0;
begin
  for guest_artist_id in
    select id from app_theatre_budget.guest_artists order by created_at, id
  loop
    result := app_production_management.reconcile_theatre_budget_guest_artist(guest_artist_id);
    processed := processed + 1;
    if result ->> 'status' in ('conflict', 'failed') then attention := attention + 1; end if;
  end loop;

  return jsonb_build_object('processed', processed, 'attention', attention);
end;
$$;

alter table app_production_management.integration_reconciliation_log owner to postgres;
alter function app_production_management.reconcile_theatre_budget_guest_artist(uuid) owner to postgres;
alter function app_production_management.reconcile_all_theatre_budget_guest_artists() owner to postgres;

grant usage on schema app_production_management, app_theatre_budget to postgres;
grant select on app_theatre_budget.guest_artists to postgres;
grant select, insert, update on app_production_management.people to postgres;
grant select, insert, update on app_production_management.external_links to postgres;
grant select, insert on app_production_management.integration_reconciliation_log to postgres;

revoke all on function app_production_management.reconcile_theatre_budget_guest_artist(uuid) from public, anon, authenticated;
revoke all on function app_production_management.reconcile_all_theatre_budget_guest_artists() from public, anon, authenticated;
grant execute on function app_production_management.reconcile_theatre_budget_guest_artist(uuid) to service_role;
grant execute on function app_production_management.reconcile_all_theatre_budget_guest_artists() to service_role;

commit;
