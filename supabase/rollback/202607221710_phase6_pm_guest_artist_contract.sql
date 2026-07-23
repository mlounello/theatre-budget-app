revoke all on function app_theatre_budget.production_management_create_guest_artist(text, text, text, text)
  from service_role;
revoke all on function app_theatre_budget.production_management_guest_artists(uuid)
  from service_role;

drop function if exists app_theatre_budget.production_management_create_guest_artist(text, text, text, text);
drop function if exists app_theatre_budget.production_management_guest_artists(uuid);

