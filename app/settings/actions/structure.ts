"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { type ActionState, emptyState, getErrorMessage } from "@/lib/action-helpers";
import { requireSettingsAdmin, isExternalProcurementProjectName, validateProjectOrganizationFiscalYear, createProjectViaRpc, settingsSuccess, settingsError, requireProjectSettingsWrite } from "@/app/settings/actions/_shared";

export async function createProjectAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error("You must be signed in.");

    const projectName = String(formData.get("projectName") ?? "").trim();
    const season = String(formData.get("season") ?? "").trim();
    const useTemplate = formData.get("useTemplate") === "on";
    const templateName = String(formData.get("templateName") ?? "Play/Musical Default").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const planningRequestsEnabled =
      !isExternalProcurementProjectName(projectName) && formData.get("planningRequestsEnabled") === "on";

    if (!projectName) throw new Error("Project name is required.");
    await validateProjectOrganizationFiscalYear(supabase, {
      fiscalYearId: fiscalYearId || null,
      organizationId: organizationId || null
    });

    const newProjectId = await createProjectViaRpc(supabase, {
      name: projectName,
      season: season || null,
      useTemplate,
      templateName: templateName || "Play/Musical Default",
      organizationId: organizationId || null
    });

    if (!newProjectId) throw new Error("Project creation returned no project id.");

    let maxProjectSortQuery = supabase.from("projects").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    maxProjectSortQuery = organizationId
      ? maxProjectSortQuery.eq("organization_id", organizationId)
      : maxProjectSortQuery.is("organization_id", null);
    const { data: maxProjectSortRows } = await maxProjectSortQuery;
    const nextProjectSort = ((maxProjectSortRows?.[0]?.sort_order as number | null) ?? -1) + 1;
    const { data: projectUpdated, error: projectUpdateError } = await supabase
      .from("projects")
      .update({
        sort_order: nextProjectSort,
        planning_requests_enabled: planningRequestsEnabled,
        fiscal_year_id: fiscalYearId || null
      })
      .eq("id", newProjectId)
      .select("id")
      .maybeSingle();
    if (projectUpdateError) throw new Error(projectUpdateError.message);
    if (!projectUpdated?.id) throw new Error("New project defaults were not applied.");

    const isExternalProject = isExternalProcurementProjectName(projectName);
    if (!isExternalProject) {
      const { data: categories, error: categoriesError } = await supabase
        .from("production_categories")
        .select("id, name")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (categoriesError) throw new Error(categoriesError.message);

      for (const category of categories ?? []) {
        const { error: ensureError } = await supabase.rpc("ensure_project_category_line", {
          p_project_id: newProjectId,
          p_production_category_id: category.id as string
        });
        if (ensureError) throw new Error(ensureError.message);
      }
    }

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/settings");
    revalidatePath("/requests");
    revalidatePath(`/projects/${newProjectId}`);
    return settingsSuccess("Project saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Project creation failed."));
  }
}

export async function createFiscalYearAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const name = String(formData.get("name") ?? "").trim();
    const startDate = String(formData.get("startDate") ?? "").trim();
    const endDate = String(formData.get("endDate") ?? "").trim();

    if (!name) throw new Error("Fiscal year name is required.");

    const { data: maxSortRows, error: maxSortError } = await supabase
      .from("fiscal_years")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    if (maxSortError) throw new Error(maxSortError.message);
    const nextSort = ((maxSortRows?.[0]?.sort_order as number | null) ?? -1) + 1;

    const { error } = await supabase.from("fiscal_years").insert({
      name,
      start_date: startDate || null,
      end_date: endDate || null,
      sort_order: nextSort
    });
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    revalidatePath("/overview");
    return settingsSuccess("Fiscal year saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not save fiscal year."));
  }
}

export async function createOrganizationAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const name = String(formData.get("name") ?? "").trim();
    const orgCode = String(formData.get("orgCode") ?? "").trim();
    const fiscalYearIds = Array.from(
      new Set(formData.getAll("fiscalYearIds").map((value) => String(value).trim()).filter(Boolean))
    );
    const projectTrackingRequired = formData.get("projectTrackingRequired") === "on";

    if (!name || !orgCode) throw new Error("Organization name and org code are required.");
    if (fiscalYearIds.length === 0) throw new Error("Select at least one fiscal year for this organization.");

    const { count: existingCodeCount, error: existingCodeError } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .ilike("org_code", orgCode)
      .is("superseded_by_organization_id", null);
    if (existingCodeError) throw new Error(existingCodeError.message);
    if ((existingCodeCount ?? 0) > 0) throw new Error("An active organization already uses this org code.");

    const { data: maxSortRows, error: maxSortError } = await supabase
      .from("organizations")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    if (maxSortError) throw new Error(maxSortError.message);
    const nextSort = ((maxSortRows?.[0]?.sort_order as number | null) ?? -1) + 1;

    const { data: organization, error } = await supabase
      .from("organizations")
      .insert({
      name,
      org_code: orgCode,
      fiscal_year_id: null,
      project_tracking_required: projectTrackingRequired,
      sort_order: nextSort
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: membershipError } = await supabase.from("fiscal_year_organizations").insert(
      fiscalYearIds.map((fiscalYearId) => ({
        fiscal_year_id: fiscalYearId,
        organization_id: organization.id as string,
        active: true,
        sort_order: nextSort,
        project_tracking_required: projectTrackingRequired
      }))
    );
    if (membershipError) throw new Error(membershipError.message);

    revalidatePath("/settings");
    revalidatePath("/overview");
    return settingsSuccess("Organization saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not save organization."));
  }
}

export async function createAccountCodeAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const code = String(formData.get("code") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const active = formData.get("active") === "on";
    const isRevenue = formData.get("isRevenue") === "on";

    if (!code || !category || !name) throw new Error("Code, category, and name are required.");

    const { error } = await supabase.from("account_codes").upsert(
      {
        code,
        category,
        name,
        active,
        is_revenue: isRevenue
      },
      { onConflict: "code" }
    );
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    return settingsSuccess("Account code saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not save account code."));
  }
}

export async function createProductionCategoryAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const name = String(formData.get("name") ?? "").trim();
    const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();
    const active = formData.get("active") === "on";

    if (!name) throw new Error("Category name is required.");

    let sortOrder = 0;
    if (sortOrderRaw) {
      const parsed = Number.parseInt(sortOrderRaw, 10);
      if (!Number.isFinite(parsed)) throw new Error("Sort order must be a number.");
      sortOrder = parsed;
    } else {
      const { data: maxSortRows, error: maxSortError } = await supabase
        .from("production_categories")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1);
      if (maxSortError) throw new Error(maxSortError.message);
      sortOrder = ((maxSortRows?.[0]?.sort_order as number | null) ?? -1) + 1;
    }

    const { data: insertedCategory, error } = await supabase
      .from("production_categories")
      .insert({ name, sort_order: sortOrder, active })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);

    if (active && insertedCategory) {
      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("id, name")
        .not("name", "ilike", "external procurement");
      if (projectsError) throw new Error(projectsError.message);

      for (const project of projectsData ?? []) {
        const { error: ensureError } = await supabase.rpc("ensure_project_category_line", {
          p_project_id: project.id as string,
          p_production_category_id: insertedCategory.id as string
        });
        if (ensureError) throw new Error(ensureError.message);
      }
    }

    revalidatePath("/settings");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    revalidatePath("/income");
    return settingsSuccess("Production category saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not save production category."));
  }
}

export async function updateAccountCodeAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const code = String(formData.get("code") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const active = String(formData.get("active") ?? "true").trim() === "true";
    const isRevenue = String(formData.get("isRevenue") ?? "false").trim() === "true";

    if (!id || !code || !category || !name) throw new Error("Account code id, code, category, and name are required.");

    const { data: updated, error } = await supabase
      .from("account_codes")
      .update({
        code,
        category,
        name,
        active,
        is_revenue: isRevenue
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated?.id) throw new Error("Account code update was not applied.");

    revalidatePath("/settings");
    revalidatePath("/requests");
    return settingsSuccess("Account code updated.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not update account code."));
  }
}

export async function updateProductionCategoryAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();
    const active = String(formData.get("active") ?? "true").trim() === "true";

    if (!id || !name) throw new Error("Category id and name are required.");

    const updateValues: { name: string; active: boolean; sort_order?: number } = { name, active };
    if (sortOrderRaw !== "") {
      const parsed = Number.parseInt(sortOrderRaw, 10);
      if (!Number.isFinite(parsed)) throw new Error("Sort order must be a number.");
      updateValues.sort_order = parsed;
    }

    const { data: updated, error } = await supabase
      .from("production_categories")
      .update(updateValues)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated?.id) throw new Error("Production category update was not applied.");

    revalidatePath("/settings");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    revalidatePath("/income");
    return settingsSuccess("Production category updated.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not update production category."));
  }
}

export async function deleteAccountCodeAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) throw new Error("Account code id is required.");

    const [{ count: budgetLineCount, error: budgetLineCountError }, { count: allocationCount, error: allocationCountError }] =
      await Promise.all([
        supabase.from("project_budget_lines").select("id", { head: true, count: "exact" }).eq("account_code_id", id),
        supabase.from("purchase_allocations").select("id", { head: true, count: "exact" }).eq("account_code_id", id)
      ]);

    if (budgetLineCountError) throw new Error(budgetLineCountError.message);
    if (allocationCountError) throw new Error(allocationCountError.message);

    const hasReferences = (budgetLineCount ?? 0) > 0 || (allocationCount ?? 0) > 0;

    if (hasReferences) {
      const { data: deactivated, error: deactivateError } = await supabase
        .from("account_codes")
        .update({ active: false })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (deactivateError) throw new Error(deactivateError.message);
      if (!deactivated?.id) throw new Error("Account code deactivation was not applied.");
      revalidatePath("/settings");
      revalidatePath("/requests");
      return settingsSuccess("Account code is in use and was deactivated.");
    }

    const { error } = await supabase.from("account_codes").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    revalidatePath("/requests");
    return settingsSuccess("Account code deleted.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not delete account code."));
  }
}

export async function deleteProductionCategoryAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) throw new Error("Category id is required.");

    const [
      { count: pblCount, error: pblError },
      { count: allocationCount, error: allocationError },
      { count: purchaseCount, error: purchaseError },
      { count: incomeCount, error: incomeError }
    ] = await Promise.all([
      supabase.from("project_budget_lines").select("id", { head: true, count: "exact" }).eq("production_category_id", id),
      supabase.from("purchase_allocations").select("id", { head: true, count: "exact" }).eq("production_category_id", id),
      supabase.from("purchases").select("id", { head: true, count: "exact" }).eq("production_category_id", id),
      supabase.from("income_lines").select("id", { head: true, count: "exact" }).eq("production_category_id", id)
    ]);
    if (pblError) throw new Error(pblError.message);
    if (allocationError) throw new Error(allocationError.message);
    if (purchaseError) throw new Error(purchaseError.message);
    if (incomeError) throw new Error(incomeError.message);

    const inUse = (pblCount ?? 0) > 0 || (allocationCount ?? 0) > 0 || (purchaseCount ?? 0) > 0 || (incomeCount ?? 0) > 0;

    if (inUse) {
      const { data: deactivated, error: deactivateError } = await supabase
        .from("production_categories")
        .update({ active: false })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (deactivateError) throw new Error(deactivateError.message);
      if (!deactivated?.id) throw new Error("Category deactivation was not applied.");
      revalidatePath("/settings");
      revalidatePath("/requests");
      revalidatePath("/procurement");
      revalidatePath("/income");
      return settingsSuccess("Category is in use and was deactivated.");
    }

    const { error } = await supabase.from("production_categories").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    revalidatePath("/income");
    return settingsSuccess("Production category deleted.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not delete production category."));
  }
}

export async function updateFiscalYearAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const startDate = String(formData.get("startDate") ?? "").trim();
    const endDate = String(formData.get("endDate") ?? "").trim();

    if (!id || !name) throw new Error("Fiscal year id and name are required.");

    const { data: updated, error } = await supabase
      .from("fiscal_years")
      .update({ name, start_date: startDate || null, end_date: endDate || null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated?.id) throw new Error("Fiscal year update was not applied.");

    revalidatePath("/settings");
    revalidatePath("/overview");
    return settingsSuccess("Fiscal year updated.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not update fiscal year."));
  }
}

export async function deleteFiscalYearAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const clearProjectAssignments = formData.get("clearProjectAssignments") === "on";
    if (!id) throw new Error("Fiscal year id is required.");

    const { count: linkedProjects, error: linkedProjectsError } = await supabase
      .from("projects")
      .select("id", { head: true, count: "exact" })
      .eq("fiscal_year_id", id);
    if (linkedProjectsError) throw new Error(linkedProjectsError.message);

    if ((linkedProjects ?? 0) > 0 && !clearProjectAssignments) {
      throw new Error(
        "This fiscal year is assigned to one or more projects. Check 'Clear project fiscal year assignments' to continue."
      );
    }

    if ((linkedProjects ?? 0) > 0 && clearProjectAssignments) {
      const { error: clearAssignmentsError } = await supabase
        .from("projects")
        .update({ fiscal_year_id: null })
        .eq("fiscal_year_id", id);
      if (clearAssignmentsError) throw new Error(clearAssignmentsError.message);
    }

    const { error } = await supabase.from("fiscal_years").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    revalidatePath("/overview");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    revalidatePath("/");
    return settingsSuccess("Fiscal year deleted.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not delete fiscal year."));
  }
}

export async function updateOrganizationAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const orgCode = String(formData.get("orgCode") ?? "").trim();
    const fiscalYearIds = Array.from(
      new Set(formData.getAll("fiscalYearIds").map((value) => String(value).trim()).filter(Boolean))
    );
    const projectTrackingRequired = formData.get("projectTrackingRequired") === "on";

    if (!id || !name || !orgCode) throw new Error("Organization id, name, and org code are required.");

    if (fiscalYearIds.length === 0) throw new Error("Select at least one fiscal year for this organization.");

    const { data: currentOrganization, error: currentOrganizationError } = await supabase
      .from("organizations")
      .select("org_code, sort_order, superseded_by_organization_id")
      .eq("id", id)
      .maybeSingle();
    if (currentOrganizationError) throw new Error(currentOrganizationError.message);
    if (!currentOrganization?.org_code) throw new Error("Organization was not found.");
    if (currentOrganization.superseded_by_organization_id) throw new Error("Superseded organizations cannot be edited.");

    const { count: conflictingCodeCount, error: conflictingCodeError } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .ilike("org_code", orgCode)
      .is("superseded_by_organization_id", null)
      .neq("id", id);
    if (conflictingCodeError) throw new Error(conflictingCodeError.message);
    if ((conflictingCodeCount ?? 0) > 0) throw new Error("Another active organization already uses this org code.");

    const { data: updated, error } = await supabase
      .from("organizations")
      .update({ name, org_code: orgCode, project_tracking_required: projectTrackingRequired, active: true })
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("Organization update was not applied.");

    const { data: existingMemberships, error: membershipsError } = await supabase
      .from("fiscal_year_organizations")
      .select("fiscal_year_id, sort_order")
      .eq("organization_id", id);
    if (membershipsError) throw new Error(membershipsError.message);
    const sortByFiscalYear = new Map(
      (existingMemberships ?? []).map((membership) => [
        membership.fiscal_year_id as string,
        (membership.sort_order as number | null) ?? (currentOrganization.sort_order as number | null) ?? 0
      ])
    );

    const { error: deactivateMembershipsError } = await supabase
      .from("fiscal_year_organizations")
      .update({ active: false })
      .eq("organization_id", id);
    if (deactivateMembershipsError) throw new Error(deactivateMembershipsError.message);

    const { error: upsertMembershipsError } = await supabase.from("fiscal_year_organizations").upsert(
      fiscalYearIds.map((fiscalYearId) => ({
        fiscal_year_id: fiscalYearId,
        organization_id: id,
        active: true,
        sort_order: sortByFiscalYear.get(fiscalYearId) ?? (currentOrganization.sort_order as number | null) ?? 0,
        project_tracking_required: projectTrackingRequired
      })),
      { onConflict: "fiscal_year_id,organization_id" }
    );
    if (upsertMembershipsError) throw new Error(upsertMembershipsError.message);

    revalidatePath("/settings");
    revalidatePath("/overview");
    return settingsSuccess("Organization updated.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not update organization."));
  }
}

export async function deleteOrganizationAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const clearProjectAssignments = formData.get("clearProjectAssignments") === "on";
    if (!id) throw new Error("Organization id is required.");

    const { count: linkedProjects, error: linkedProjectsError } = await supabase
      .from("projects")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", id);
    if (linkedProjectsError) throw new Error(linkedProjectsError.message);

    if ((linkedProjects ?? 0) > 0 && !clearProjectAssignments) {
      throw new Error(
        "This organization is assigned to one or more projects. Check 'Clear project organization assignments' to continue."
      );
    }

    if ((linkedProjects ?? 0) > 0 && clearProjectAssignments) {
      const { error: clearAssignmentsError } = await supabase
        .from("projects")
        .update({ organization_id: null })
        .eq("organization_id", id);
      if (clearAssignmentsError) throw new Error(clearAssignmentsError.message);
    }

    const { error: membershipError } = await supabase
      .from("fiscal_year_organizations")
      .update({ active: false })
      .eq("organization_id", id);
    if (membershipError) throw new Error(membershipError.message);

    const { error } = await supabase.from("organizations").update({ active: false }).eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    revalidatePath("/overview");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    revalidatePath("/");
    return settingsSuccess("Organization archived.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not delete organization."));
  }
}

export async function updateProjectAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const season = String(formData.get("season") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const planningRequestsEnabled = !isExternalProcurementProjectName(name) && formData.get("planningRequestsEnabled") === "on";

    if (!id || !name) throw new Error("Project id and name are required.");
    await requireProjectSettingsWrite(supabase, id);
    await validateProjectOrganizationFiscalYear(supabase, {
      fiscalYearId: fiscalYearId || null,
      organizationId: organizationId || null
    });

    const { data: updated, error } = await supabase
      .from("projects")
      .update({
        name,
        season: season || null,
        organization_id: organizationId || null,
        fiscal_year_id: fiscalYearId || null,
        planning_requests_enabled: planningRequestsEnabled
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated?.id) throw new Error("Project update was not applied.");

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${id}`);
    return settingsSuccess("Project updated.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not update project."));
  }
}

export async function deleteProjectAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const confirmationName = String(formData.get("confirmationName") ?? "").trim();
    const acknowledged = formData.get("acknowledgeProjectDeletion") === "on";
    if (!id) throw new Error("Project id is required.");

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project?.id) throw new Error("Project was not found or has already been deleted.");

    const projectName = String(project.name ?? "").trim();
    if (isExternalProcurementProjectName(projectName)) {
      throw new Error("The External Procurement system project cannot be deleted.");
    }
    if (!acknowledged) {
      throw new Error("Acknowledge that linked project data will be permanently deleted.");
    }
    if (confirmationName !== projectName) {
      throw new Error(`Type the exact project name “${projectName}” to confirm deletion.`);
    }

    const { data: deletedProjectName, error } = await supabase.rpc("delete_project_cascade", {
      p_project_id: id,
      p_confirmation_name: confirmationName
    });
    if (error) throw new Error(error.message);
    if (String(deletedProjectName ?? "").trim() !== projectName) {
      throw new Error("Project deletion was not applied.");
    }

    revalidatePath("/settings");
    revalidatePath("/overview");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    revalidatePath("/contracts");
    revalidatePath("/income");
    revalidatePath("/cc");
    revalidatePath("/");
    return settingsSuccess(`Project “${projectName}” deleted.`);
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not delete project."));
  }
}
