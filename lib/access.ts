import { getSupabaseServerClient } from "@/lib/supabase-server";
import { APP_ID } from "@/lib/supabase-schema";
import type { AppRole } from "@/lib/types";

export type EffectiveAppRole = AppRole | "none";

export type AccessScopeRow = {
  scopeRole: AppRole;
  fiscalYearId: string | null;
  organizationId: string | null;
  projectId: string | null;
  productionCategoryId: string | null;
};

export type AccessContext = {
  userId: string | null;
  email: string | null;
  role: EffectiveAppRole;
  membershipRoles: Set<AppRole>;
  scopedRoles: Set<AppRole>;
  manageableProjectIds: Set<string>;
  scopes: AccessScopeRow[];
};

function toRole(value: unknown): AppRole | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "admin" ||
    normalized === "project_manager" ||
    normalized === "buyer" ||
    normalized === "viewer" ||
    normalized === "procurement_tracker"
  ) {
    return normalized as AppRole;
  }
  return null;
}

function rolePriority(role: AppRole): number {
  if (role === "admin") return 5;
  if (role === "project_manager") return 4;
  if (role === "buyer") return 3;
  if (role === "viewer") return 2;
  return 1;
}

export function hasRole(context: AccessContext, allowed: AppRole[]): boolean {
  return context.role !== "none" && allowed.includes(context.role);
}

export async function getAccessContext(): Promise<AccessContext> {
  const supabase = await getSupabaseServerClient();
  const debugAccess = process.env.DEBUG_DASHBOARD_ACCESS === "true";
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      userId: null,
      email: null,
      role: "none",
      membershipRoles: new Set<AppRole>(),
      scopedRoles: new Set<AppRole>(),
      manageableProjectIds: new Set<string>(),
      scopes: []
    };
  }

  const coreAppId = APP_ID;
  const { data: coreMembership, error: coreErr } = await supabase
    .schema("core")
    .from("app_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("app_id", coreAppId)
    .eq("is_active", true)
    .maybeSingle();

  if (debugAccess) {
    console.log("[access] core membership", { coreAppId, coreMembership, coreErr });
    if (coreErr) {
      console.error("[access] core membership error", coreErr);
    }
  }

  const coreRole = toRole(coreMembership?.role);
  if (coreRole) {
    if (debugAccess) {
      console.info(`[access] uid=${user.id} email=${user.email ?? ""} role=${coreRole} source=core.app_memberships`);
    }
    return {
      userId: user.id,
      email: user.email ?? null,
      role: coreRole,
      membershipRoles: new Set<AppRole>(),
      scopedRoles: new Set<AppRole>(),
      manageableProjectIds: new Set<string>(),
      scopes: []
    };
  }

  const [membershipResponse, scopeResponse] = await Promise.all([
    supabase.from("project_memberships").select("project_id, role").eq("user_id", user.id),
    supabase
      .from("user_access_scopes")
      .select("scope_role, fiscal_year_id, organization_id, project_id, production_category_id")
      .eq("user_id", user.id)
      .eq("active", true)
  ]);

  if (membershipResponse.error) throw membershipResponse.error;
  if (scopeResponse.error) throw scopeResponse.error;

  const membershipRoles = new Set<AppRole>();
  const scopedRoles = new Set<AppRole>();
  const manageableProjectIds = new Set<string>();
  const scopes: AccessScopeRow[] = [];

  for (const row of membershipResponse.data ?? []) {
    const role = toRole(row.role);
    if (!role) continue;
    membershipRoles.add(role);
    if (role === "admin" || role === "project_manager") {
      manageableProjectIds.add(row.project_id as string);
    }
  }

  for (const row of scopeResponse.data ?? []) {
    const scopeRole = toRole(row.scope_role);
    if (!scopeRole) continue;
    scopedRoles.add(scopeRole);
    scopes.push({
      scopeRole,
      fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
      organizationId: (row.organization_id as string | null) ?? null,
      projectId: (row.project_id as string | null) ?? null,
      productionCategoryId: (row.production_category_id as string | null) ?? null
    });
  }

  let role: EffectiveAppRole = "none";
  const allRoles = new Set<AppRole>([...membershipRoles, ...scopedRoles]);
  const sortedRoles = [...allRoles].sort((a, b) => rolePriority(b) - rolePriority(a));
  if (sortedRoles.length > 0) {
    role = sortedRoles[0];
  }

  if (debugAccess) {
    let source = "none";
    if (role !== "none") {
      const inProjectMemberships = membershipRoles.has(role);
      const inUserScopes = scopedRoles.has(role);
      if (inProjectMemberships) source = "project_memberships";
      else if (inUserScopes) source = "user_access_scopes";
    }
    console.info(`[access] uid=${user.id} email=${user.email ?? ""} role=${role} source=${source}`);
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    role,
    membershipRoles,
    scopedRoles,
    manageableProjectIds,
    scopes
  };
}
