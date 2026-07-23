-- Narrow service-only Theatre Budget contracts for Production Management.
-- The catalog exposes only the identity/contact fields already required by the
-- active guest-artist integration. The create contract accepts the same narrow
-- field set and cannot write contract, payment, tax, banking, or budget data.

create or replace function app_theatre_budget.production_management_guest_artists(
  p_guest_artist_id uuid default null
)
returns table (
  id uuid,
  display_name text,
  email text,
  phone text,
  vendor_number text,
  active boolean
)
language sql
stable
security definer
set search_path = app_theatre_budget, pg_catalog
as $$
  select
    guest_artist.id,
    guest_artist.display_name,
    guest_artist.email,
    guest_artist.phone,
    guest_artist.vendor_number,
    guest_artist.active
  from app_theatre_budget.guest_artists guest_artist
  where p_guest_artist_id is null or guest_artist.id = p_guest_artist_id
  order by guest_artist.display_name, guest_artist.id;
$$;

create or replace function app_theatre_budget.production_management_create_guest_artist(
  p_display_name text,
  p_email text default null,
  p_phone text default null,
  p_vendor_number text default null
)
returns table (
  id uuid,
  display_name text,
  email text,
  phone text,
  vendor_number text,
  active boolean
)
language plpgsql
security definer
set search_path = app_theatre_budget, pg_catalog
as $$
declare
  normalized_name text := nullif(trim(p_display_name), '');
  normalized_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  normalized_phone text := nullif(trim(coalesce(p_phone, '')), '');
  normalized_vendor_number text := nullif(trim(coalesce(p_vendor_number, '')), '');
begin
  if normalized_name is null then
    raise exception 'Guest artist display name is required.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from app_theatre_budget.guest_artists guest_artist
    where (
      normalized_vendor_number is not null
      and guest_artist.vendor_number = normalized_vendor_number
    )
    or (
      normalized_email is not null
      and lower(trim(coalesce(guest_artist.email, ''))) = normalized_email
    )
    or (
      normalized_vendor_number is null
      and normalized_email is null
      and lower(trim(guest_artist.display_name)) = lower(normalized_name)
    )
  ) then
    raise exception 'A matching Theatre Budget guest artist already exists.'
      using errcode = '23505';
  end if;

  return query
  insert into app_theatre_budget.guest_artists (
    display_name,
    email,
    phone,
    vendor_number,
    active,
    notes
  ) values (
    normalized_name,
    normalized_email,
    normalized_phone,
    normalized_vendor_number,
    true,
    'Created deliberately from Production Management; complete financial and contract details in Theatre Budget.'
  )
  returning
    guest_artists.id,
    guest_artists.display_name,
    guest_artists.email,
    guest_artists.phone,
    guest_artists.vendor_number,
    guest_artists.active;
end;
$$;

alter function app_theatre_budget.production_management_guest_artists(uuid) owner to postgres;
alter function app_theatre_budget.production_management_create_guest_artist(text, text, text, text) owner to postgres;

revoke all on function app_theatre_budget.production_management_guest_artists(uuid)
  from public, anon, authenticated;
revoke all on function app_theatre_budget.production_management_create_guest_artist(text, text, text, text)
  from public, anon, authenticated;

grant usage on schema app_theatre_budget to service_role;
grant execute on function app_theatre_budget.production_management_guest_artists(uuid)
  to service_role;
grant execute on function app_theatre_budget.production_management_create_guest_artist(text, text, text, text)
  to service_role;

