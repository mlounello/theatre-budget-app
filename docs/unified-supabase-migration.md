	1.	What changed

	•	New Supabase project: mlounello-database
	•	Schema: app_theatre_budget
	•	Auth users reauth in new project
	•	Roles now come from core.app_memberships

	2.	DB changes we made

	•	Grants:
	•	GRANT SELECT on core.app_memberships to authenticated
	•	GRANT EXECUTE on core.is_member to authenticated (if used)
	•	Policies:
	•	membership-based SELECT policies for dashboard tables
	•	View settings:
	•	security_invoker=true on v_portfolio_summary and v_project_totals

	3.	Local env variables

	•	list the env vars you standardized on

	4.	Final sync procedure

	•	command sequence you’ll run right before cutover (next step)