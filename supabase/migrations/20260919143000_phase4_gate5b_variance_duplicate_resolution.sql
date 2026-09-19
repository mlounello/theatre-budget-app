-- Gate 5B: resolve duplicate variance drafts without deleting their history.
-- Combining is intentionally limited to open drafts in the same fiscal year
-- with the exact same target bucket set.

create or replace function app_theatre_budget.resolve_duplicate_variance_draft(
  p_primary_variance_id uuid,
  p_duplicate_variance_id uuid,
  p_mode text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, app_theatre_budget, public
as $$
declare
  v_primary app_theatre_budget.variance_requests%rowtype;
  v_duplicate app_theatre_budget.variance_requests%rowtype;
  v_primary_targets uuid[];
  v_duplicate_targets uuid[];
begin
  if p_primary_variance_id = p_duplicate_variance_id then
    raise exception 'Choose two different variance drafts.';
  end if;
  if p_mode not in ('combine', 'dismiss') then
    raise exception 'Choose how to resolve the duplicate draft.';
  end if;

  select * into v_primary
  from app_theatre_budget.variance_requests
  where id = p_primary_variance_id
  for update;

  select * into v_duplicate
  from app_theatre_budget.variance_requests
  where id = p_duplicate_variance_id
  for update;

  if v_primary.id is null or v_duplicate.id is null then
    raise exception 'One of the variance drafts could not be found.';
  end if;
  if not app_theatre_budget.can_manage_variance_request(v_primary.id)
     or not app_theatre_budget.can_manage_variance_request(v_duplicate.id) then
    raise exception 'You do not have permission to combine these variance drafts.';
  end if;
  if v_primary.status not in ('draft', 'ready_for_review')
     or v_duplicate.status not in ('draft', 'ready_for_review') then
    raise exception 'Only Draft or Ready for Review variances can be combined.';
  end if;
  if v_primary.fiscal_year_id is distinct from v_duplicate.fiscal_year_id then
    raise exception 'Variance drafts from different fiscal years cannot be combined.';
  end if;

  select coalesce(array_agg(target_id order by target_id), array[]::uuid[])
  into v_primary_targets
  from (
    select budget_plan_month_id as target_id
    from app_theatre_budget.variance_request_targets
    where variance_request_id = v_primary.id
    union
    select v_primary.target_budget_plan_month_id
    where v_primary.target_budget_plan_month_id is not null
  ) targets;

  select coalesce(array_agg(target_id order by target_id), array[]::uuid[])
  into v_duplicate_targets
  from (
    select budget_plan_month_id as target_id
    from app_theatre_budget.variance_request_targets
    where variance_request_id = v_duplicate.id
    union
    select v_duplicate.target_budget_plan_month_id
    where v_duplicate.target_budget_plan_month_id is not null
  ) targets;

  if v_primary_targets is distinct from v_duplicate_targets then
    raise exception 'Only drafts with the same target buckets can be combined.';
  end if;

  if p_mode = 'combine' then
    update app_theatre_budget.variance_request_lines
    set variance_request_id = v_primary.id,
        updated_at = now()
    where variance_request_id = v_duplicate.id;

    update app_theatre_budget.variance_requests
    set generated_file_path = null,
        generated_file_url = null,
        updated_at = now()
    where id = v_primary.id;
  end if;

  update app_theatre_budget.variance_requests
  set status = 'denied',
      denied_at = now(),
      reason = concat_ws(
        E'\n',
        nullif(reason, ''),
        case when p_mode = 'combine' then 'Combined into variance ' else 'Dismissed as duplicate of variance ' end || v_primary.id::text
      ),
      updated_at = now()
  where id = v_duplicate.id;

  insert into app_theatre_budget.variance_events (
    variance_request_id, from_status, to_status, changed_by_user_id, note
  ) values
    (
      v_primary.id,
      v_primary.status,
      v_primary.status,
      auth.uid(),
      case when p_mode = 'combine' then 'Source lines combined from duplicate variance ' else 'Duplicate variance dismissed: ' end || v_duplicate.id::text
    ),
    (
      v_duplicate.id,
      v_duplicate.status,
      'denied',
      auth.uid(),
      case when p_mode = 'combine' then 'Combined into variance ' else 'Dismissed as duplicate of variance ' end || v_primary.id::text
    );
end;
$$;

grant execute on function app_theatre_budget.resolve_duplicate_variance_draft(uuid, uuid, text) to authenticated;
