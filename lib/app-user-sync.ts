import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { APP_ID } from "@/lib/supabase-schema";

type AppRole = "admin" | "project_manager" | "buyer" | "viewer" | "procurement_tracker" | "none";

type SyncUserPayload = {
  fullName: string;
  email: string;
  globalRole: "admin" | "member";
  accountStatus: "active" | "archived" | "inactive";
  appRole: AppRole | "unknown";
  permissionLevel: "managed" | "scoped" | "none";
  membershipStatus: "active" | "inactive";
  notes: string;
};

type SyncResult = {
  ok: boolean;
  status: number | null;
  count: number;
  error?: string;
};

const ROLE_PRIORITY: Record<string, number> = {
  admin: 5,
  project_manager: 4,
  buyer: 3,
  viewer: 2,
  procurement_tracker: 1
};

function toRole(value: unknown): AppRole | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized in ROLE_PRIORITY) return normalized as AppRole;
  return null;
}

function selectHighestRole(roles: Array<string | null | undefined>): AppRole | null {
  let selected: AppRole | null = null;
  let best = -1;
  for (const role of roles) {
    const parsed = toRole(role);
    if (!parsed) continue;
    const score = ROLE_PRIORITY[parsed];
    if (score > best) {
      best = score;
      selected = parsed;
    }
  }
  return selected;
}

function mapPermissionLevel(role: AppRole | null): "managed" | "scoped" | "none" {
  if (!role) return "none";
  if (role === "admin" || role === "project_manager") return "managed";
  if (role === "buyer" || role === "viewer" || role === "procurement_tracker") return "scoped";
  return "none";
}

function isArchivedName(fullName: string): boolean {
  return fullName.toLowerCase().includes("(deleted)");
}

async function listAllAuthUsers(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const users: Array<{ id: string; email?: string | null; user_metadata?: Record<string, unknown> }> = [];
  let page = 1;
  const perPage = 1000;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...(data?.users ?? []));
    if (!data?.users || data.users.length < perPage) break;
    page += 1;
  }

  return users;
}

export async function syncAppUsers(options?: { fullSync?: boolean; reason?: string }): Promise<SyncResult> {
  const syncSecret = process.env.APP_SYNC_SECRET ?? process.env.APP_USER_SYNC_SECRET;
  if (!syncSecret) {
    return { ok: false, status: null, count: 0, error: "Missing APP_SYNC_SECRET" };
  }

  const admin = createSupabaseAdminClient();
  const fullSync = options?.fullSync !== false;

  const [authUsers, usersResponse, membershipsResponse, scopesResponse, coreMembershipsResponse] = await Promise.all([
    listAllAuthUsers(admin),
    admin.from("users").select("id, full_name"),
    admin.from("project_memberships").select("user_id, role"),
    admin.from("user_access_scopes").select("user_id, scope_role, active"),
    admin
      .schema("core")
      .from("app_memberships")
      .select("user_id, role, is_active, app_id")
      .eq("app_id", APP_ID)
  ]);

  if (usersResponse.error) throw usersResponse.error;
  if (membershipsResponse.error) throw membershipsResponse.error;
  if (scopesResponse.error) throw scopesResponse.error;
  if (coreMembershipsResponse.error) throw coreMembershipsResponse.error;

  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const membershipByUser = new Map<string, string[]>();
  for (const row of membershipsResponse.data ?? []) {
    const id = String(row.user_id);
    const list = membershipByUser.get(id) ?? [];
    list.push(String(row.role ?? ""));
    membershipByUser.set(id, list);
  }

  const scopeByUser = new Map<string, string[]>();
  const activeScopeByUser = new Set<string>();
  for (const row of scopesResponse.data ?? []) {
    const id = String(row.user_id);
    const list = scopeByUser.get(id) ?? [];
    list.push(String(row.scope_role ?? ""));
    scopeByUser.set(id, list);
    if (row.active) activeScopeByUser.add(id);
  }

  const coreByUser = new Map<string, { role: string | null; isActive: boolean }>();
  for (const row of coreMembershipsResponse.data ?? []) {
    const id = String(row.user_id);
    const existing = coreByUser.get(id);
    const role = String(row.role ?? "");
    const isActive = Boolean(row.is_active);
    if (!existing) {
      coreByUser.set(id, { role, isActive });
      continue;
    }
    const existingRole = selectHighestRole([existing.role]);
    const incomingRole = selectHighestRole([role]);
    const bestRole = selectHighestRole([existingRole, incomingRole]);
    coreByUser.set(id, { role: bestRole ?? role, isActive: existing.isActive || isActive });
  }

  const usersPayload: SyncUserPayload[] = (usersResponse.data ?? []).map((row) => {
    const id = String(row.id);
    const fullName = String(row.full_name ?? "").trim() || id;
    const authUser = authById.get(id);
    const email = authUser?.email ?? "";

    const core = coreByUser.get(id);
    const role = selectHighestRole([
      core?.role,
      ...(membershipByUser.get(id) ?? []),
      ...(scopeByUser.get(id) ?? [])
    ]);
    const appRole: AppRole | "unknown" = role ?? "none";
    const permissionLevel = mapPermissionLevel(role);
    const membershipStatus =
      core?.isActive || membershipByUser.has(id) || activeScopeByUser.has(id) ? "active" : "inactive";
    const accountStatus = isArchivedName(fullName) ? "archived" : "active";
    const globalRole = role === "admin" ? "admin" : "member";

    return {
      fullName,
      email,
      globalRole,
      accountStatus,
      appRole,
      permissionLevel,
      membershipStatus,
      notes: "Imported from Theatre Budget App"
    };
  });

  const payload = {
    appSlug: "theatre-budget-app",
    fullSync,
    users: usersPayload
  };

  const response = await fetch("https://mlounello.com/api/admin/sync/app-users", {
    method: "POST",
    headers: {
      "X-App-Sync-Secret": syncSecret,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status,
      count: usersPayload.length,
      error: text || `Sync failed with status ${response.status}`
    };
  }

  return { ok: true, status: response.status, count: usersPayload.length };
}

export async function syncAppUsersSafe(reason?: string): Promise<void> {
  try {
    const result = await syncAppUsers({ fullSync: true, reason });
    if (!result.ok) {
      console.error("[sync-app-users] failed", { reason, status: result.status, error: result.error });
    }
  } catch (error) {
    console.error("[sync-app-users] error", { reason, message: (error as Error).message });
  }
}
