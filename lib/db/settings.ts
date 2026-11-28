import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import type { SettingsProject } from "@/lib/db/shared";

export type ProjectDeletionImpact = {
  projectId: string;
  budgetLines: number;
  purchases: number;
  creditCardStatementMonths: number;
  incomeEntries: number;
  contracts: number;
  projectMemberships: number;
  productionTeamAssignments: number;
  accessScopesDetached: number;
  associatedContractsDetached: number;
};

export type SettingsUserRow = {
  id: string;
  fullName: string;
};

export type ProductionManagementProfileOption = {
  id: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  personType: string | null;
  roleLabel: string | null;
  projectLabel: string | null;
};

export type ProductionManagementProfileResult = {
  profiles: ProductionManagementProfileOption[];
  warning: string | null;
};

export type SettingsAccessScopeRow = {
  id: string;
  userId: string;
  userName: string;
  scopeRole: "admin" | "project_manager" | "buyer" | "viewer" | "procurement_tracker";
  fiscalYearId: string | null;
  organizationId: string | null;
  projectId: string | null;
  productionCategoryId: string | null;
  active: boolean;
};

export type SettingsProjectMembershipRow = {
  projectId: string;
  projectLabel: string;
  userId: string;
  userName: string;
  role: "admin" | "project_manager" | "buyer" | "viewer" | "procurement_tracker";
};

export type SettingsProductionTeamAssignmentRow = {
  id: string;
  projectId: string;
  projectLabel: string;
  userId: string | null;
  userName: string | null;
  profileName: string;
  profileEmail: string | null;
  productionRole: string | null;
  productionCategoryId: string | null;
  productionCategoryName: string | null;
  budgetAccessRole: "none" | "viewer" | "project_manager";
  derivedAccessScopeId: string | null;
  active: boolean;
  lastInvitedAt: string | null;
};

export async function getSettingsProjects(): Promise<SettingsProject[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, season, organization_id, fiscal_year_id, planning_requests_enabled, sort_order")
    .not("name", "ilike", "external procurement")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    season: (row.season as string | null) ?? null,
    organizationId: (row.organization_id as string | null) ?? null,
    fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
    planningRequestsEnabled: (row.planning_requests_enabled as boolean | null) ?? true,
    sortOrder: (row.sort_order as number | null) ?? 0
  }));
}

export async function getProjectDeletionImpact(projectId: string): Promise<ProjectDeletionImpact> {
  const supabase = await getSupabaseServerClient();

  async function countLinkedRows(
    table: string,
    column = "project_id",
    excludeDirectProject = false,
    optionalColumn = false
  ): Promise<number> {
    let query = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, projectId);
    if (excludeDirectProject) query = query.neq("project_id", projectId);
    const { count, error } = await query;
    if (error) {
      if (optionalColumn && (error.code === "42703" || error.message.includes(column))) return 0;
      throw error;
    }
    return count ?? 0;
  }

  async function countAssociatedContracts(): Promise<number> {
    const { data: links, error: linksError } = await supabase
      .from("contract_productions")
      .select("contract_id")
      .eq("project_id", projectId);

    if (linksError) {
      if (linksError.code === "42P01" || linksError.message.includes("contract_productions")) {
        return countLinkedRows("contracts", "production_project_id", true, true);
      }
      throw linksError;
    }

    const contractIds = [...new Set((links ?? []).map((link) => link.contract_id as string))];
    if (contractIds.length === 0) return 0;

    const { data: linkedContracts, error: contractsError } = await supabase
      .from("contracts")
      .select("id, project_id")
      .in("id", contractIds);
    if (contractsError) throw contractsError;

    return (linkedContracts ?? []).filter((contract) => contract.project_id !== projectId).length;
  }

  const [
    budgetLines,
    purchases,
    creditCardStatementMonths,
    incomeEntries,
    contracts,
    projectMemberships,
    productionTeamAssignments,
    accessScopesDetached,
    associatedContractsDetached
  ] = await Promise.all([
    countLinkedRows("project_budget_lines"),
    countLinkedRows("purchases"),
    countLinkedRows("cc_statement_months"),
    countLinkedRows("income_lines"),
    countLinkedRows("contracts"),
    countLinkedRows("project_memberships"),
    countLinkedRows("production_team_assignments"),
    countLinkedRows("user_access_scopes"),
    countAssociatedContracts()
  ]);

  return {
    projectId,
    budgetLines,
    purchases,
    creditCardStatementMonths,
    incomeEntries,
    contracts,
    projectMemberships,
    productionTeamAssignments,
    accessScopesDetached,
    associatedContractsDetached
  };
}

export async function getSettingsAccessScopes(): Promise<{
  users: SettingsUserRow[];
  scopes: SettingsAccessScopeRow[];
}> {
  const supabase = await getSupabaseServerClient();
  const access = await getAccessContext();

  const [usersResponse, scopesResponse, membershipsResponse, projectsResponse, categoriesResponse] = await Promise.all([
    supabase.from("users").select("id, full_name").order("full_name", { ascending: true }),
    supabase
      .from("user_access_scopes")
      .select("id, user_id, scope_role, fiscal_year_id, organization_id, project_id, production_category_id, active")
      .order("created_at", { ascending: false }),
    supabase
      .from("project_memberships")
      .select("user_id, project_id, role")
      .in("role", ["admin", "project_manager", "buyer", "viewer"]),
    supabase.from("projects").select("id, name, season"),
    supabase.from("production_categories").select("id, name")
  ]);

  if (usersResponse.error) throw usersResponse.error;
  if (scopesResponse.error) throw scopesResponse.error;
  if (membershipsResponse.error) throw membershipsResponse.error;
  if (projectsResponse.error) throw projectsResponse.error;
  if (categoriesResponse.error) throw categoriesResponse.error;

  const isAdmin = access.role === "admin";
  const manageableProjects = access.manageableProjectIds;

  const adminUserIds = new Set<string>([access.userId].filter((id): id is string => Boolean(id)));
  for (const row of membershipsResponse.data ?? []) {
    if (row.role === "admin") adminUserIds.add(row.user_id as string);
  }
  for (const row of scopesResponse.data ?? []) {
    if (row.scope_role === "admin") adminUserIds.add(row.user_id as string);
  }

  const users = (usersResponse.data ?? [])
    .map((row) => ({
      id: row.id as string,
      fullName: ((row.full_name as string | null) ?? "").trim() || (row.id as string)
    }))
    .filter((user) => !adminUserIds.has(user.id))
    .filter((user) => !user.fullName.toLowerCase().includes("(deleted)"));
  const userNameById = new Map(users.map((user) => [user.id, user.fullName]));

  const projectsById = new Map(
    (projectsResponse.data ?? []).map((row) => [
      row.id as string,
      `${row.name as string}${(row.season as string | null) ? ` (${row.season as string})` : ""}`
    ])
  );
  const categoriesById = new Map((categoriesResponse.data ?? []).map((row) => [row.id as string, row.name as string]));

  const usersInManagedProjects = new Set<string>();
  for (const membership of membershipsResponse.data ?? []) {
    const projectId = membership.project_id as string;
    if (isAdmin || manageableProjects.has(projectId)) {
      usersInManagedProjects.add(membership.user_id as string);
    }
  }

  const filteredUsers = isAdmin ? users : users.filter((user) => usersInManagedProjects.has(user.id));

  const scopes = (scopesResponse.data ?? [])
    .filter((row) => {
      const projectId = (row.project_id as string | null) ?? null;
      if (isAdmin) return true;
      if (!projectId) return false;
      return manageableProjects.has(projectId);
    })
    .map((row) => {
      const projectId = (row.project_id as string | null) ?? null;
      const productionCategoryId = (row.production_category_id as string | null) ?? null;
      const userId = row.user_id as string;
      const userName = userNameById.get(userId) ?? userId;
      const projectLabel = projectId ? projectsById.get(projectId) ?? projectId : null;
      const categoryLabel = productionCategoryId ? categoriesById.get(productionCategoryId) ?? productionCategoryId : null;
      return {
        id: row.id as string,
        userId,
        userName: projectLabel && categoryLabel ? `${userName} | ${projectLabel} | ${categoryLabel}` : userName,
        scopeRole: (row.scope_role as "admin" | "project_manager" | "buyer" | "viewer" | "procurement_tracker") ?? "viewer",
        fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
        organizationId: (row.organization_id as string | null) ?? null,
        projectId,
        productionCategoryId,
        active: Boolean(row.active as boolean | null)
      };
    });

  return { users: filteredUsers, scopes };
}

const PRODUCTION_MANAGEMENT_SCHEMA = "app_production_management";

const PRODUCTION_TEAM_BUDGET_ROLE_GROUPS = ["creative_team", "directorial_team"];

function normalizePmRoleGroup(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export async function getProductionManagementProfileOptions(): Promise<ProductionManagementProfileResult> {
  const supabase = await getSupabaseServerClient();

  type PmPersonRow = {
    id?: string;
    full_name?: string | null;
    preferred_name?: string | null;
    email?: string | null;
    person_type?: string | null;
    status?: string | null;
  };
  type PmAssignmentRow = {
    person_id?: string | null;
    status?: string | null;
    project_roles?: { name?: string | null; role_group?: string | null; department?: string | null } | null;
    projects?: { title?: string | null; season_label?: string | null } | null;
  };

  const pmDb = supabase.schema(PRODUCTION_MANAGEMENT_SCHEMA);
  const assignmentResponse = await pmDb
    .from("role_assignments")
    .select("person_id, status, project_roles!inner(name, role_group, department), projects(title, season_label)")
    .not("status", "in", "(declined,withdrawn)")
    .in("project_roles.role_group", PRODUCTION_TEAM_BUDGET_ROLE_GROUPS)
    .order("updated_at", { ascending: false })
    .limit(1500);

  if (assignmentResponse.error) {
    console.warn("[settings] Production Management profiles unavailable", {
      schema: PRODUCTION_MANAGEMENT_SCHEMA,
      message: assignmentResponse.error.message
    });
    return {
      profiles: [],
      warning:
        "Production Management profiles are not available to this signed-in account. You can still enter a name/email manually and send a magic link."
    };
  }

  const eligiblePersonIds = [
    ...new Set(
      ((assignmentResponse.data ?? []) as PmAssignmentRow[])
        .filter((assignment) => PRODUCTION_TEAM_BUDGET_ROLE_GROUPS.includes(String(assignment.project_roles?.role_group ?? "")))
        .map((assignment) => String(assignment.person_id ?? ""))
        .filter(Boolean)
    )
  ];

  if (eligiblePersonIds.length === 0) return { profiles: [], warning: null };

  const peopleResponse = await pmDb
    .from("people")
    .select("id, full_name, preferred_name, email, person_type, status")
    .eq("status", "active")
    .in("id", eligiblePersonIds)
    .order("full_name", { ascending: true })
    .limit(750);

  if (peopleResponse.error) {
    console.warn("[settings] Production Management people unavailable", {
      schema: PRODUCTION_MANAGEMENT_SCHEMA,
      message: peopleResponse.error.message
    });
    return {
      profiles: [],
      warning:
        "Production Management profiles are not available to this signed-in account. You can still enter a name/email manually and send a magic link."
    };
  }

  const people = ((peopleResponse.data ?? []) as PmPersonRow[])
    .filter((person) => person.id && String(person.full_name ?? "").trim())
    .map((person) => ({
      id: String(person.id),
      fullName: String(person.full_name ?? "").trim(),
      preferredName: String(person.preferred_name ?? "").trim() || null,
      email: String(person.email ?? "").trim().toLowerCase() || null,
      personType: String(person.person_type ?? "").trim() || null,
      roleLabel: null as string | null,
      projectLabel: null as string | null
    }));

  if (people.length === 0) return { profiles: [], warning: null };

  const roleByPersonId = new Map<string, { roleLabel: string | null; projectLabel: string | null }>();
  for (const assignment of ((assignmentResponse.data ?? []) as PmAssignmentRow[])) {
    const personId = String(assignment.person_id ?? "");
    if (!personId || roleByPersonId.has(personId)) continue;
    const role = assignment.project_roles;
    const project = assignment.projects;
    const roleName = String(role?.name ?? "").trim();
    const department = String(role?.department ?? "").trim();
    const roleGroup = normalizePmRoleGroup(role?.role_group);
    const projectTitle = String(project?.title ?? "").trim();
    const season = String(project?.season_label ?? "").trim();
    roleByPersonId.set(personId, {
      roleLabel: [roleName, department || roleGroup].filter(Boolean).join(", ") || null,
      projectLabel: [projectTitle, season].filter(Boolean).join(" ") || null
    });
  }

  return {
    profiles: people.map((person) => ({
      ...person,
      roleLabel: roleByPersonId.get(person.id)?.roleLabel ?? null,
      projectLabel: roleByPersonId.get(person.id)?.projectLabel ?? null
    })),
    warning: assignmentResponse.error ? "Production Management people loaded, but role labels could not be loaded." : null
  };
}

export async function getSettingsProjectMemberships(): Promise<{
  users: SettingsUserRow[];
  memberships: SettingsProjectMembershipRow[];
}> {
  const supabase = await getSupabaseServerClient();
  const access = await getAccessContext();

  const [membershipsResponse, usersResponse, projectsResponse] = await Promise.all([
    supabase
      .from("project_memberships")
      .select("project_id, user_id, role")
      .order("project_id", { ascending: true }),
    supabase.from("users").select("id, full_name").order("full_name", { ascending: true }),
    supabase.from("projects").select("id, name, season")
  ]);

  if (membershipsResponse.error) throw membershipsResponse.error;
  if (usersResponse.error) throw usersResponse.error;
  if (projectsResponse.error) throw projectsResponse.error;

  const isAdmin = access.role === "admin";
  const manageableProjects = access.manageableProjectIds;
  const users = (usersResponse.data ?? []).map((row) => ({
    id: row.id as string,
    fullName: ((row.full_name as string | null) ?? "").trim() || (row.id as string)
  }));
  const userNameById = new Map(users.map((user) => [user.id, user.fullName]));
  const projectLabelById = new Map(
    (projectsResponse.data ?? []).map((row) => [
      row.id as string,
      `${row.name as string}${(row.season as string | null) ? ` (${row.season as string})` : ""}`
    ])
  );

  const memberships = (membershipsResponse.data ?? [])
    .filter((row) => {
      if (isAdmin) return true;
      return manageableProjects.has(row.project_id as string);
    })
    .map((row) => ({
      projectId: row.project_id as string,
      projectLabel: projectLabelById.get(row.project_id as string) ?? (row.project_id as string),
      userId: row.user_id as string,
      userName: userNameById.get(row.user_id as string) ?? (row.user_id as string),
      role: (row.role as "admin" | "project_manager" | "buyer" | "viewer" | "procurement_tracker") ?? "viewer"
    }))
    .sort((a, b) => a.projectLabel.localeCompare(b.projectLabel) || a.role.localeCompare(b.role) || a.userName.localeCompare(b.userName));

  const membershipUserIds = new Set(memberships.map((row) => row.userId));
  const filteredUsers = isAdmin ? users : users.filter((user) => membershipUserIds.has(user.id));

  return { users: filteredUsers, memberships };
}

export async function getSettingsProductionTeamAssignments(): Promise<SettingsProductionTeamAssignmentRow[]> {
  const supabase = await getSupabaseServerClient();
  const access = await getAccessContext();

  const [
    assignmentsResponse,
    usersResponse,
    projectsResponse,
    categoriesResponse
  ] = await Promise.all([
    supabase
      .from("production_team_assignments")
      .select(
        "id, project_id, user_id, profile_name, profile_email, production_role, production_category_id, budget_access_role, derived_access_scope_id, active, last_invited_at, created_at"
      )
      .eq("active", true)
      .order("created_at", { ascending: false }),
    supabase.from("users").select("id, full_name"),
    supabase.from("projects").select("id, name, season"),
    supabase.from("production_categories").select("id, name")
  ]);

  if (assignmentsResponse.error) throw assignmentsResponse.error;
  if (usersResponse.error) throw usersResponse.error;
  if (projectsResponse.error) throw projectsResponse.error;
  if (categoriesResponse.error) throw categoriesResponse.error;

  const isAdmin = access.role === "admin";
  const manageableProjects = access.manageableProjectIds;
  const userNameById = new Map(
    (usersResponse.data ?? []).map((row) => [
      row.id as string,
      ((row.full_name as string | null) ?? "").trim() || (row.id as string)
    ])
  );
  const projectLabelById = new Map(
    (projectsResponse.data ?? []).map((row) => [
      row.id as string,
      `${row.name as string}${(row.season as string | null) ? ` (${row.season as string})` : ""}`
    ])
  );
  const categoryNameById = new Map((categoriesResponse.data ?? []).map((row) => [row.id as string, row.name as string]));

  return ((assignmentsResponse.data ?? []) as Array<{
    id?: string;
    project_id?: string | null;
    user_id?: string | null;
    profile_name?: string | null;
    profile_email?: string | null;
    production_role?: string | null;
    production_category_id?: string | null;
    budget_access_role?: string | null;
    derived_access_scope_id?: string | null;
    active?: boolean | null;
    last_invited_at?: string | null;
  }>)
    .filter((row) => {
      const projectId = row.project_id ?? "";
      return isAdmin || manageableProjects.has(projectId);
    })
    .map((row) => {
      const projectId = row.project_id ?? "";
      const userId = row.user_id ?? null;
      const productionCategoryId = row.production_category_id ?? null;
      const budgetAccessRole = row.budget_access_role === "project_manager" || row.budget_access_role === "none"
        ? row.budget_access_role
        : "viewer";
      return {
        id: row.id ?? "",
        projectId,
        projectLabel: projectLabelById.get(projectId) ?? projectId,
        userId,
        userName: userId ? userNameById.get(userId) ?? userId : null,
        profileName: row.profile_name ?? "Production team member",
        profileEmail: row.profile_email ?? null,
        productionRole: row.production_role ?? null,
        productionCategoryId,
        productionCategoryName: productionCategoryId ? categoryNameById.get(productionCategoryId) ?? productionCategoryId : null,
        budgetAccessRole: budgetAccessRole as "none" | "viewer" | "project_manager",
        derivedAccessScopeId: row.derived_access_scope_id ?? null,
        active: row.active ?? true,
        lastInvitedAt: row.last_invited_at ?? null
      };
    })
    .sort((a, b) => a.projectLabel.localeCompare(b.projectLabel) || a.profileName.localeCompare(b.profileName));
}
