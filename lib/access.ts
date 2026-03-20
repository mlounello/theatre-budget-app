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
  projectMembershipRolesByProjectId: Map<string, Set<AppRole>>;
  scopes: AccessScopeRow[];
};

type ProjectAccessTarget = {
  id: string;
  organizationId: string | null;
  fiscalYearId: string | null;
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

function selectHighestRole(roles: Array<AppRole | null | undefined>): AppRole | null {
  let selected: AppRole | null = null;
  let best = -1;
  for (const role of roles) {
    if (!role) continue;
    const score = rolePriority(role);
    if (score > best) {
      best = score;
      selected = role;
    }
  }
  return selected;
}

export function hasRole(context: AccessContext, allowed: AppRole[]): boolean {
  return context.role !== "none" && allowed.includes(context.role);
}

function addProjectMembershipRole(
  target: Map<string, Set<AppRole>>,
  projectId: string,
  role: AppRole
): void {
  const existing = target.get(projectId) ?? new Set<AppRole>();
  existing.add(role);
  target.set(projectId, existing);
}

function scopeMatchesProject(
  scope: AccessScopeRow,
  project: ProjectAccessTarget,
  productionCategoryId?: string | null
): boolean {
  if (scope.projectId && scope.projectId !== project.id) return false;
  if (scope.organizationId && scope.organizationId !== project.organizationId) return false;
  if (scope.fiscalYearId && scope.fiscalYearId !== project.fiscalYearId) return false;
  if (scope.productionCategoryId) {
    if (!productionCategoryId) return false;
    if (scope.productionCategoryId !== productionCategoryId) return false;
  }

  // Keep mutation access narrow: category-only scopes without project/org/FY context
  // are too broad to trust for writes.
  if (!scope.projectId && !scope.organizationId && !scope.fiscalYearId) {
    return false;
  }

  return true;
}

export async function getProjectScopedRole(
  projectId: string,
  options?: { productionCategoryId?: string | null }
): Promise<{ access: AccessContext; role: AppRole | null }> {
  const access = await getAccessContext();
  if (!access.userId) {
    return { access, role: null };
  }

  if (access.role === "admin") {
    return { access, role: "admin" };
  }

  if (access.manageableProjectIds.has(projectId)) {
    return { access, role: "project_manager" };
  }

  const membershipRoles = [...(access.projectMembershipRolesByProjectId.get(projectId) ?? new Set<AppRole>())];
  let selectedRole = selectHighestRole(membershipRoles);

  const supabase = await getSupabaseServerClient();
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, organization_id, fiscal_year_id")
    .eq("id", projectId)
    .single();
  if (error || !project) {
    throw error ?? new Error("Project not found.");
  }

  const projectTarget: ProjectAccessTarget = {
    id: project.id as string,
    organizationId: (project.organization_id as string | null) ?? null,
    fiscalYearId: (project.fiscal_year_id as string | null) ?? null
  };

  const scopeRoles = access.scopes
    .filter((scope) => scopeMatchesProject(scope, projectTarget, options?.productionCategoryId ?? null))
    .map((scope) => scope.scopeRole);
  const scopedRole = selectHighestRole(scopeRoles);

  selectedRole = selectHighestRole([selectedRole, scopedRole]);

  return {
    access,
    role: selectedRole
  };
}

export async function requireProjectRole(
  projectId: string,
  allowed: AppRole[],
  options?: { productionCategoryId?: string | null; errorMessage?: string }
): Promise<AccessContext> {
  const { access, role } = await getProjectScopedRole(projectId, options);
  if (role && allowed.includes(role)) {
    return access;
  }
  throw new Error(options?.errorMessage ?? "You do not have permission for this project.");
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
      projectMembershipRolesByProjectId: new Map<string, Set<AppRole>>(),
      scopes: []
    };
  }

  const coreAppId = APP_ID;
  const { data: rpcRoleValue, error: rpcRoleError } = await supabase.rpc("get_user_role", { p_app_id: coreAppId });
  const rpcRole = toRole(rpcRoleValue);
  if (debugAccess) {
    console.info("[access] rpc get_user_role", { coreAppId, rpcRoleValue, rpcRoleError });
  }
  let preferredRole: AppRole | null = rpcRole;
  let preferredSource: "rpc.get_user_role" | "core.app_memberships" | null = rpcRole ? "rpc.get_user_role" : null;

  // Backward-compatible fallback while get_user_role is being rolled out.
  const { data: coreMembership, error: coreErr } = await supabase
    .schema("core")
    .from("app_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("app_id", coreAppId)
    .eq("is_active", true)
    .maybeSingle();
  if (debugAccess) {
    console.info("[access] core membership fallback", { coreAppId, coreMembership, coreErr });
    if (coreErr) {
      console.error("[access] core membership error", coreErr);
    }
    if (rpcRoleError) {
      console.error("[access] get_user_role error", rpcRoleError);
    }
  }

  const coreRole = toRole(coreMembership?.role);
  if (!preferredRole && coreRole) {
    preferredRole = coreRole;
    preferredSource = "core.app_memberships";
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
  const projectMembershipRolesByProjectId = new Map<string, Set<AppRole>>();
  const scopes: AccessScopeRow[] = [];

  for (const row of membershipResponse.data ?? []) {
    const role = toRole(row.role);
    if (!role) continue;
    membershipRoles.add(role);
    addProjectMembershipRole(projectMembershipRolesByProjectId, row.project_id as string, role);
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
  if (preferredRole) {
    role = preferredRole;
  }

  if (debugAccess) {
    let source = "none";
    if (preferredSource && role === preferredRole) {
      source = preferredSource;
    } else if (role !== "none") {
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
    projectMembershipRolesByProjectId,
    scopes
  };
}
