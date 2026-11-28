import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";

export async function requireCcManagerRole(): Promise<void> {
  const access = await getAccessContext();
  if (access.role !== "admin" && access.role !== "project_manager") {
    throw new Error("You must be an Admin or Project Manager to manage credit card statements.");
  }
}

export async function requireOrganizationMembership(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  fiscalYearId: string,
  organizationId: string,
  options: { projectlessOnly?: boolean } = {}
): Promise<void> {
  const { data, error } = await supabase
    .from("fiscal_year_organizations")
    .select("id, project_tracking_required")
    .eq("fiscal_year_id", fiscalYearId)
    .eq("organization_id", organizationId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("That organization is not active in the selected fiscal year.");
  if (options.projectlessOnly && data.project_tracking_required) {
    throw new Error("That organization requires a project in the selected fiscal year.");
  }
}
