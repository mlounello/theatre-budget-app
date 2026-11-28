"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { APP_ID } from "@/lib/supabase-schema";
import { ensureBudgetAccessUser, sendBudgetAccessMagicLink } from "@/lib/budget-access-invite";
import { type ActionState, emptyState, getErrorMessage } from "@/lib/action-helpers";
import { requireProjectSettingsWrite, settingsSuccess, settingsError, requiredText, requireSettingsAdmin } from "@/app/settings/actions/_shared";

export async function createUserAccessScopeAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const userId = String(formData.get("userId") ?? "").trim();
    const rawScopeRole = String(formData.get("scopeRole") ?? "").trim();
    const scopeRole = (rawScopeRole === "buyer" ? "viewer" : rawScopeRole) as
      | "admin"
      | "project_manager"
      | "viewer"
      | "procurement_tracker";
    const projectId = String(formData.get("projectId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const projectIds = formData
      .getAll("projectIds")
      .map((entry) => String(entry).trim())
      .filter(Boolean);
    const categoryIds = formData
      .getAll("productionCategoryIds")
      .map((entry) => String(entry).trim())
      .filter(Boolean);
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();

    if (!userId || !scopeRole) throw new Error("User and role are required.");
    if (scopeRole === "procurement_tracker" && !organizationId) {
      throw new Error("Procurement Tracker scope requires an organization.");
    }

    if (access.role !== "admin") {
      if (scopeRole !== "viewer") {
        throw new Error("Project managers can only assign Viewer scopes.");
      }
      const effectiveProjects = projectIds.length > 0 ? projectIds : projectId ? [projectId] : [];
      if (effectiveProjects.length === 0) throw new Error("Project is required for PM-assigned scopes.");
      for (const pid of effectiveProjects) {
        await requireProjectSettingsWrite(supabase, pid);
      }
    }

    const resolvedProjects =
      scopeRole === "procurement_tracker" ? [""] : projectIds.length > 0 ? projectIds : projectId ? [projectId] : [""];
    const resolvedCategories =
      scopeRole === "procurement_tracker"
        ? [""]
        : categoryIds.length > 0
          ? categoryIds
          : productionCategoryId
            ? [productionCategoryId]
            : [""];

    const requestedRows = new Map<string, { projectId: string; categoryId: string }>();
    for (const pid of resolvedProjects) {
      for (const cid of resolvedCategories) {
        const key = [pid || "", cid || "", fiscalYearId || "", organizationId || ""].join("|");
        if (!requestedRows.has(key)) {
          requestedRows.set(key, { projectId: pid || "", categoryId: cid || "" });
        }
      }
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("user_access_scopes")
      .select("project_id, production_category_id, fiscal_year_id, organization_id")
      .eq("user_id", userId)
      .eq("scope_role", scopeRole);
    if (existingError) throw new Error(existingError.message);

    const existingKeys = new Set(
      (existingRows ?? []).map((row) =>
        [
          (row.project_id as string | null) ?? "",
          (row.production_category_id as string | null) ?? "",
          (row.fiscal_year_id as string | null) ?? "",
          (row.organization_id as string | null) ?? ""
        ].join("|")
      )
    );

    let createdCount = 0;
    let skippedCount = 0;

    for (const row of requestedRows.values()) {
      if (access.role !== "admin" && row.projectId) {
        await requireProjectSettingsWrite(supabase, row.projectId);
      }

      const key = [row.projectId || "", row.categoryId || "", fiscalYearId || "", organizationId || ""].join("|");
      if (existingKeys.has(key)) {
        skippedCount += 1;
        continue;
      }

      const { error } = await supabase.from("user_access_scopes").insert({
        user_id: userId,
        scope_role: scopeRole,
        project_id: scopeRole === "procurement_tracker" ? null : row.projectId || null,
        production_category_id: scopeRole === "procurement_tracker" ? null : row.categoryId || null,
        fiscal_year_id: fiscalYearId || null,
        organization_id: organizationId || null,
        active: true
      });
      if (error) {
        const duplicate = error.code === "23505" || /duplicate key/i.test(error.message ?? "");
        if (duplicate) {
          skippedCount += 1;
          continue;
        }
        throw new Error(error.message);
      }

      createdCount += 1;
      existingKeys.add(key);
    }

    revalidatePath("/settings");
    return settingsSuccess(`User scope saved. Added ${createdCount}, skipped ${skippedCount} existing.`);
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not save user scope."));
  }
}

export async function addProjectMembershipAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const userId = String(formData.get("userId") ?? "").trim();
    const rawRole = String(formData.get("role") ?? "").trim();
    const role = (rawRole === "buyer" ? "viewer" : rawRole) as "admin" | "project_manager" | "viewer";

    if (!projectId || !userId || !role) throw new Error("Project, user, and role are required.");
    if (access.role !== "admin") {
      await requireProjectSettingsWrite(supabase, projectId);
      if (role === "admin") throw new Error("Project managers cannot assign admin role.");
    }

    const { error } = await supabase.rpc("assign_project_membership", {
      p_project_id: projectId,
      p_user_id: userId,
      p_role: role
    });
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    return settingsSuccess("Project membership saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not save project membership."));
  }
}

export async function removeProjectMembershipAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const userId = String(formData.get("userId") ?? "").trim();
    if (!projectId || !userId) throw new Error("Project and user are required.");
    if (userId === access.userId) throw new Error("You cannot remove your own project membership.");

    if (access.role !== "admin") {
      await requireProjectSettingsWrite(supabase, projectId);
    }

    const { error } = await supabase.rpc("remove_project_membership", {
      p_project_id: projectId,
      p_user_id: userId
    });
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    return settingsSuccess("Project membership removed.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not remove project membership."));
  }
}

export async function deleteUserAccessScopeAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const id = String(formData.get("id") ?? "").trim();
    if (!id) throw new Error("Scope id is required.");

    const { data: row, error: rowError } = await supabase
      .from("user_access_scopes")
      .select("id, user_id, scope_role, project_id")
      .eq("id", id)
      .single();
    if (rowError || !row) throw new Error(rowError?.message ?? "Scope not found.");
    if ((row.user_id as string | null) === access.userId) throw new Error("You cannot remove your own access scope.");

    if (access.role !== "admin") {
      if ((row.scope_role as string) !== "buyer" && (row.scope_role as string) !== "viewer") {
        throw new Error("Project managers can only remove Viewer scopes.");
      }
      const projectId = (row.project_id as string | null) ?? "";
      if (!projectId) throw new Error("PM can only remove project-scoped access rows.");
      await requireProjectSettingsWrite(supabase, projectId);
    }

    const { error } = await supabase.from("user_access_scopes").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    return settingsSuccess("User scope removed.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not remove user scope."));
  }
}

export async function updateUserAccessScopeAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const id = String(formData.get("id") ?? "").trim();
    const rawScopeRole = String(formData.get("scopeRole") ?? "").trim();
    const scopeRole = (rawScopeRole === "buyer" ? "viewer" : rawScopeRole) as
      | "admin"
      | "project_manager"
      | "viewer"
      | "procurement_tracker";
    const projectId = String(formData.get("projectId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const active = String(formData.get("active") ?? "true").trim() === "true";

    if (!id || !scopeRole) throw new Error("Scope id and role are required.");
    if (scopeRole === "procurement_tracker" && !organizationId) {
      throw new Error("Procurement Tracker scope requires an organization.");
    }

    const { data: existing, error: existingError } = await supabase
      .from("user_access_scopes")
      .select("id, user_id, scope_role, project_id")
      .eq("id", id)
      .single();
    if (existingError || !existing) throw new Error(existingError?.message ?? "Scope not found.");
    if ((existing.user_id as string | null) === access.userId && !active) {
      throw new Error("You cannot deactivate your own access scope.");
    }

    if (access.role !== "admin") {
      if (scopeRole !== "viewer") {
        throw new Error("Project managers can only set Viewer scopes.");
      }
      const targetProjectId = projectId || (existing.project_id as string | null) || "";
      if (!targetProjectId) throw new Error("Project is required for PM-managed scopes.");
      await requireProjectSettingsWrite(supabase, targetProjectId);
      if ((existing.scope_role as string) !== "buyer" && (existing.scope_role as string) !== "viewer") {
        throw new Error("Project managers cannot edit Admin/PM scopes.");
      }
    }

    const { data: updated, error } = await supabase
      .from("user_access_scopes")
      .update({
        scope_role: scopeRole,
        project_id: scopeRole === "procurement_tracker" ? null : projectId || null,
        production_category_id: scopeRole === "procurement_tracker" ? null : productionCategoryId || null,
        fiscal_year_id: fiscalYearId || null,
        organization_id: organizationId || null,
        active
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated?.id) {
      throw new Error("Scope update was not applied. You may not have permission for this change.");
    }

    revalidatePath("/settings");
    return settingsSuccess("User scope updated.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not update user scope."));
  }
}

type TeamBudgetAccessRole = "none" | "viewer" | "project_manager";

function normalizeTeamBudgetAccessRole(value: FormDataEntryValue | null): TeamBudgetAccessRole {
  const normalized = String(value ?? "viewer").trim().toLowerCase();
  if (normalized === "none" || normalized === "project_manager") return normalized;
  return "viewer";
}

async function findOrCreateProjectScope(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
  projectId: string;
  productionCategoryId: string | null;
  role: "viewer";
}): Promise<string> {
  const { supabase, userId, projectId, productionCategoryId, role } = params;
  const existingQuery = supabase
    .from("user_access_scopes")
    .select("id, active")
    .eq("user_id", userId)
    .eq("scope_role", role)
    .eq("project_id", projectId)
    .is("fiscal_year_id", null)
    .is("organization_id", null);

  const { data: existingRows, error: existingError } = productionCategoryId
    ? await existingQuery.eq("production_category_id", productionCategoryId)
    : await existingQuery.is("production_category_id", null);
  if (existingError) throw new Error(existingError.message);

  const existing = (existingRows ?? [])[0] as { id?: string; active?: boolean | null } | undefined;
  if (existing?.id) {
    if (!existing.active) {
      const { error } = await supabase.from("user_access_scopes").update({ active: true }).eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return existing.id;
  }

  const { data: inserted, error } = await supabase
    .from("user_access_scopes")
    .insert({
      user_id: userId,
      scope_role: role,
      project_id: projectId,
      production_category_id: productionCategoryId,
      fiscal_year_id: null,
      organization_id: null,
      active: true
    })
    .select("id")
    .single();
  if (error || !inserted?.id) throw new Error(error?.message ?? "Could not create derived budget access scope.");
  return inserted.id as string;
}

async function applyProductionTeamBudgetAccess(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  assignmentId: string;
  userId: string | null;
  projectId: string;
  productionCategoryId: string | null;
  budgetAccessRole: TeamBudgetAccessRole;
}): Promise<string | null> {
  const { supabase, assignmentId, userId, projectId, productionCategoryId, budgetAccessRole } = params;
  if (!userId || budgetAccessRole === "none") {
    const { error } = await supabase.from("production_team_assignments").update({ derived_access_scope_id: null }).eq("id", assignmentId);
    if (error) throw new Error(error.message);
    return null;
  }

  if (budgetAccessRole === "project_manager") {
    const { error } = await supabase.rpc("assign_project_membership", {
      p_project_id: projectId,
      p_user_id: userId,
      p_role: "project_manager"
    });
    if (error) throw new Error(error.message);
    const { error: updateError } = await supabase
      .from("production_team_assignments")
      .update({ derived_access_scope_id: null })
      .eq("id", assignmentId);
    if (updateError) throw new Error(updateError.message);
    return null;
  }

  const scopeId = await findOrCreateProjectScope({
    supabase,
    userId,
    projectId,
    productionCategoryId,
    role: budgetAccessRole
  });
  const { error } = await supabase
    .from("production_team_assignments")
    .update({ derived_access_scope_id: scopeId })
    .eq("id", assignmentId);
  if (error) throw new Error(error.message);
  return scopeId;
}

export async function saveProductionTeamAssignmentAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const projectId = requiredText(formData, "projectId", "Project");
    await requireProjectSettingsWrite(supabase, projectId);

    const assignmentId = String(formData.get("assignmentId") ?? "").trim();
    const userId = String(formData.get("userId") ?? "").trim() || null;
    const profileName = requiredText(formData, "profileName", "Name");
    const profileEmail = String(formData.get("profileEmail") ?? "").trim().toLowerCase() || null;
    const productionRole = String(formData.get("productionRole") ?? "").trim() || null;
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim() || null;
    const budgetAccessRole = normalizeTeamBudgetAccessRole(formData.get("budgetAccessRole"));
    const active = String(formData.get("active") ?? "true") !== "false";

    if (budgetAccessRole !== "none" && !userId && !profileEmail) {
      throw new Error("Budget access needs either an existing app user or an email for magic-link access.");
    }
    if (userId === access.userId && !active) throw new Error("You cannot deactivate your own production-team access.");
    if (budgetAccessRole === "project_manager" && access.role !== "admin") {
      throw new Error("Only admins can assign Project Manager access from production-team assignments.");
    }

    const payload = {
      project_id: projectId,
      user_id: userId,
      profile_name: profileName,
      profile_email: profileEmail,
      production_role: productionRole,
      production_category_id: productionCategoryId,
      budget_access_role: budgetAccessRole,
      active,
      updated_by_user_id: access.userId
    };

    let savedId = assignmentId;
    if (assignmentId) {
      const { data: existing, error: existingError } = await supabase
        .from("production_team_assignments")
        .select("id, user_id, derived_access_scope_id")
        .eq("id", assignmentId)
        .single();
      if (existingError || !existing) throw new Error(existingError?.message ?? "Assignment not found.");
      if ((existing.user_id as string | null) === access.userId && !active) {
        throw new Error("You cannot deactivate your own production-team access.");
      }
      const { error } = await supabase.from("production_team_assignments").update(payload).eq("id", assignmentId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabase
        .from("production_team_assignments")
        .insert({
          ...payload,
          created_by_user_id: access.userId
        })
        .select("id")
        .single();
      if (error || !inserted?.id) throw new Error(error?.message ?? "Could not save production-team assignment.");
      savedId = inserted.id as string;
    }

    if (active) {
      await applyProductionTeamBudgetAccess({
        supabase,
        assignmentId: savedId,
        userId,
        projectId,
        productionCategoryId,
        budgetAccessRole
      });
    }

    revalidatePath("/settings");
    return settingsSuccess(userId ? "Production-team budget access saved." : "Production-team assignment saved. Send the magic link to create/link account access.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not save production-team assignment."));
  }
}

export async function sendProductionTeamAccessLinkAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const assignmentId = requiredText(formData, "assignmentId", "Assignment");
    const { data: assignment, error: assignmentError } = await supabase
      .from("production_team_assignments")
      .select("id, project_id, user_id, profile_name, profile_email, production_category_id, budget_access_role, active")
      .eq("id", assignmentId)
      .single();
    if (assignmentError || !assignment) throw new Error(assignmentError?.message ?? "Assignment not found.");

    const projectId = assignment.project_id as string;
    await requireProjectSettingsWrite(supabase, projectId);

    if (!assignment.active) throw new Error("Reactivate this assignment before sending access.");
    const email = String(assignment.profile_email ?? "").trim().toLowerCase();
    if (!email) throw new Error("This assignment needs an email before a magic link can be sent.");
    const budgetAccessRole = normalizeTeamBudgetAccessRole(assignment.budget_access_role as string);
    if (budgetAccessRole === "none") throw new Error("Set Viewer or Project Manager access before sending a magic link.");

    const linked = await ensureBudgetAccessUser({
      email,
      fullName: String(assignment.profile_name ?? "").trim() || email
    });

    await applyProductionTeamBudgetAccess({
      supabase,
      assignmentId,
      userId: linked.userId,
      projectId,
      productionCategoryId: (assignment.production_category_id as string | null) ?? null,
      budgetAccessRole
    });

    if (!linked.created) {
      await sendBudgetAccessMagicLink(email);
    }

    const { error: updateError } = await supabase
      .from("production_team_assignments")
      .update({
        user_id: linked.userId,
        last_invited_at: new Date().toISOString(),
        updated_by_user_id: access.userId
      })
      .eq("id", assignmentId);
    if (updateError) throw new Error(updateError.message);

    revalidatePath("/settings");
    return settingsSuccess(linked.created ? "Account created and magic link sent." : "Magic link sent.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not send budget access link."));
  }
}

export async function deactivateProductionTeamAssignmentAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const assignmentId = requiredText(formData, "assignmentId", "Assignment");
    const { data: assignment, error: assignmentError } = await supabase
      .from("production_team_assignments")
      .select("id, project_id, user_id, derived_access_scope_id")
      .eq("id", assignmentId)
      .single();
    if (assignmentError || !assignment) throw new Error(assignmentError?.message ?? "Assignment not found.");

    await requireProjectSettingsWrite(supabase, assignment.project_id as string);
    if ((assignment.user_id as string | null) === access.userId) {
      throw new Error("You cannot deactivate your own production-team assignment.");
    }

    const derivedScopeId = (assignment.derived_access_scope_id as string | null) ?? null;
    if (derivedScopeId) {
      const { error: scopeError } = await supabase.from("user_access_scopes").update({ active: false }).eq("id", derivedScopeId);
      if (scopeError) throw new Error(scopeError.message);
    }

    const { error } = await supabase
      .from("production_team_assignments")
      .update({
        active: false,
        updated_by_user_id: access.userId
      })
      .eq("id", assignmentId);
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    return settingsSuccess("Production-team assignment deactivated.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not deactivate production-team assignment."));
  }
}

export async function archiveUserProfileAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error("You must be signed in.");

    const targetUserId = String(formData.get("userId") ?? "").trim();
    if (!targetUserId) throw new Error("User id is required.");
    if (targetUserId === user.id) throw new Error("You cannot archive your own account.");

    const { data: targetUser, error: targetUserError } = await supabase
      .from("users")
      .select("id")
      .eq("id", targetUserId)
      .maybeSingle();
    if (targetUserError) throw new Error(targetUserError.message);
    if (!targetUser?.id) throw new Error("User was not found.");

    const { error: archiveError } = await supabase.rpc("archive_user_profile", {
      p_user_id: targetUserId,
      p_app_id: APP_ID
    });
    if (archiveError) throw new Error(archiveError.message);

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    return settingsSuccess("User archived. Access and memberships removed.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not archive user."));
  }
}
