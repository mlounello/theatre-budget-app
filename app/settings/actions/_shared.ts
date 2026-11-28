import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { type ActionState, ok, err } from "@/lib/action-helpers";

export function requiredText(formData: FormData, name: string, label: string): string {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

export function isExternalProcurementProjectName(name: string): boolean {
  return name.trim().toLowerCase() === "external procurement";
}

export async function requireSettingsAdmin(): Promise<void> {
  const access = await getAccessContext();
  if (!access.userId) throw new Error("You must be signed in.");
  if (access.role !== "admin") throw new Error("Only admins can change global settings.");
}

export async function requireProjectSettingsWrite(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  projectId: string
): Promise<void> {
  const access = await getAccessContext();
  if (!access.userId) throw new Error("You must be signed in.");
  if (access.role === "admin") return;

  const { data, error } = await supabase
    .from("project_memberships")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", access.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const role = (data?.role as string | undefined) ?? null;
  if (role !== "admin" && role !== "project_manager") {
    throw new Error("Only project managers/admins for this project can edit these settings.");
  }
}

export async function validateProjectOrganizationFiscalYear(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  params: { fiscalYearId: string | null; organizationId: string | null }
): Promise<void> {
  if (!params.fiscalYearId || !params.organizationId) return;

  const { data: membership, error } = await supabase
    .from("fiscal_year_organizations")
    .select("id")
    .eq("fiscal_year_id", params.fiscalYearId)
    .eq("organization_id", params.organizationId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!membership?.id) throw new Error("Selected organization is not active in the selected project fiscal year.");
}

export function settingsSuccess(message: string): ActionState {
  return ok(message);
}

export function settingsError(message: string): ActionState {
  return err(message);
}

export async function createProjectViaRpc(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  params: {
    name: string;
    season: string | null;
    useTemplate: boolean;
    templateName: string;
    organizationId: string | null;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc("create_project_with_admin", {
    p_name: params.name,
    p_season: params.season,
    p_use_template: params.useTemplate,
    p_template_name: params.templateName,
    p_organization_id: params.organizationId
  });

  if (!error && data) return data as string;

  const fallback = await supabase.rpc("create_project_with_admin", {
    p_name: params.name,
    p_season: params.season,
    p_use_template: params.useTemplate,
    p_template_name: params.templateName
  });

  if (fallback.error || !fallback.data) {
    throw new Error(error?.message ?? fallback.error?.message ?? "Project creation failed.");
  }

  if (params.organizationId) {
    const { data: fallbackUpdated, error: fallbackUpdateError } = await supabase
      .from("projects")
      .update({ organization_id: params.organizationId })
      .eq("id", fallback.data as string)
      .select("id")
      .maybeSingle();
    if (fallbackUpdateError) throw new Error(fallbackUpdateError.message);
    if (!fallbackUpdated?.id) throw new Error("Project organization update was not applied.");
  }

  return fallback.data as string;
}
