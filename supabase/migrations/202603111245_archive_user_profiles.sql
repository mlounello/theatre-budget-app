-- Per-user archival flow for legacy account cleanup.
-- This keeps historical record attribution while removing app access.

alter table public.users
  add column if not exists deleted_at timestamptz;

create or replace function public.archive_user_profile(
  p_user_id uuid,
  p_app_id text default 'theatre_budget'
)
returns void
language plpgsql
security definer
set search_path = public, core
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.is_admin_user() then
    raise exception 'Only admins can archive users.';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id is required.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot archive your own account.';
  end if;

  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'User % does not exist.', p_user_id;
  end if;

  delete from public.user_access_scopes
  where user_id = p_user_id;

  delete from public.project_memberships
  where user_id = p_user_id;

  update core.app_memberships
  set is_active = false
  where user_id = p_user_id
    and (p_app_id is null or app_id = p_app_id);

  update public.users
  set full_name = case
      when coalesce(trim(full_name), '') = '' then 'Deleted User'
      when position(' (Deleted)' in full_name) > 0 then full_name
      else full_name || ' (Deleted)'
    end,
    deleted_at = coalesce(deleted_at, now())
  where id = p_user_id;
end;
$$;

revoke all on function public.archive_user_profile(uuid, text) from public;
grant execute on function public.archive_user_profile(uuid, text) to authenticated;
