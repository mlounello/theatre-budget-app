"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalSortOrder(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOrderedIds(raw: string): string[] {
  let orderedIds: string[] = [];
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    orderedIds = parsed.map((item) => String(item)).filter(Boolean);
  }
  return orderedIds;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      current = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    current += ch;
  }

  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = (cells[idx] ?? "").trim();
    });
    return record;
  });
}

function isExternalProcurementProjectName(name: string): boolean {
  return name.trim().toLowerCase() === "external procurement";
}

async function requireSettingsAdmin(): Promise<void> {
  const access = await getAccessContext();
  if (!access.userId) throw new Error("You must be signed in.");
  if (access.role !== "admin") throw new Error("Only admins can change global settings.");
}

async function requireProjectSettingsWrite(
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

function settingsSuccess(message: string, hash?: string): never {
  const target = `/settings?ok=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`;
  redirect(target);
}

function settingsError(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`);
}

async function createProjectViaRpc(
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

export async function createProjectAction(formData: FormData): Promise<void> {
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
    settingsSuccess("Project saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Project creation failed."));
  }
}

export async function createFiscalYearAction(formData: FormData): Promise<void> {
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
    settingsSuccess("Fiscal year saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not save fiscal year."));
  }
}

export async function createOrganizationAction(formData: FormData): Promise<void> {
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const name = String(formData.get("name") ?? "").trim();
    const orgCode = String(formData.get("orgCode") ?? "").trim();

    if (!name || !orgCode) throw new Error("Organization name and org code are required.");

    const { data: maxSortRows, error: maxSortError } = await supabase
      .from("organizations")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    if (maxSortError) throw new Error(maxSortError.message);
    const nextSort = ((maxSortRows?.[0]?.sort_order as number | null) ?? -1) + 1;

    const { error } = await supabase.from("organizations").insert({
      name,
      org_code: orgCode,
      fiscal_year_id: null,
      sort_order: nextSort
    });
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    revalidatePath("/overview");
    settingsSuccess("Organization saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not save organization."));
  }
}

export async function createAccountCodeAction(formData: FormData): Promise<void> {
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
    settingsSuccess("Account code saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not save account code."));
  }
}

export async function createProductionCategoryAction(formData: FormData): Promise<void> {
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
    settingsSuccess("Production category saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not save production category."));
  }
}

export async function updateAccountCodeAction(formData: FormData): Promise<void> {
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
    settingsSuccess("Account code updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not update account code."));
  }
}

export async function updateProductionCategoryAction(formData: FormData): Promise<void> {
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
    settingsSuccess("Production category updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not update production category."));
  }
}

export async function deleteAccountCodeAction(formData: FormData): Promise<void> {
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
      settingsSuccess("Account code is in use and was deactivated.");
    }

    const { error } = await supabase.from("account_codes").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    revalidatePath("/requests");
    settingsSuccess("Account code deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not delete account code."));
  }
}

export async function deleteProductionCategoryAction(formData: FormData): Promise<void> {
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
      settingsSuccess("Category is in use and was deactivated.");
    }

    const { error } = await supabase.from("production_categories").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    revalidatePath("/income");
    settingsSuccess("Production category deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not delete production category."));
  }
}

export async function updateFiscalYearAction(formData: FormData): Promise<void> {
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
    settingsSuccess("Fiscal year updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not update fiscal year."));
  }
}

export async function deleteFiscalYearAction(formData: FormData): Promise<void> {
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

    const { error } = await supabase.from("fiscal_years").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    revalidatePath("/overview");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    revalidatePath("/");
    settingsSuccess("Fiscal year deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not delete fiscal year."));
  }
}

export async function updateOrganizationAction(formData: FormData): Promise<void> {
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const orgCode = String(formData.get("orgCode") ?? "").trim();

    if (!id || !name || !orgCode) throw new Error("Organization id, name, and org code are required.");

    const { data: updated, error } = await supabase
      .from("organizations")
      .update({ name, org_code: orgCode, fiscal_year_id: null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated?.id) throw new Error("Organization update was not applied.");

    revalidatePath("/settings");
    revalidatePath("/overview");
    settingsSuccess("Organization updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not update organization."));
  }
}

export async function deleteOrganizationAction(formData: FormData): Promise<void> {
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

    const { error } = await supabase.from("organizations").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    revalidatePath("/overview");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    revalidatePath("/");
    settingsSuccess("Organization deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not delete organization."));
  }
}

export async function updateProjectAction(formData: FormData): Promise<void> {
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
    settingsSuccess("Project updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not update project."));
  }
}

export async function updateBudgetLineAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const currentProjectId = String(formData.get("currentProjectId") ?? "").trim();
    const targetProjectId = String(formData.get("targetProjectId") ?? "").trim();
    const allocatedAmount = parseMoney(formData.get("allocatedAmount"));
    const sortOrder = parseOptionalSortOrder(formData.get("sortOrder"));
    const active = formData.get("active") === "on";

    if (!id) throw new Error("Budget line id is required.");
    if (currentProjectId) await requireProjectSettingsWrite(supabase, currentProjectId);
    if (targetProjectId) await requireProjectSettingsWrite(supabase, targetProjectId);

    const nextValues: {
      allocated_amount: number;
      sort_order?: number;
      active: boolean;
      production_category_id?: string | null;
      project_id?: string;
    } = { allocated_amount: allocatedAmount, active };

    if (targetProjectId) {
      nextValues.project_id = targetProjectId;
    }

    if (sortOrder !== undefined) {
      nextValues.sort_order = sortOrder;
    }

    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    if (productionCategoryId) {
      nextValues.production_category_id = productionCategoryId;
    }

    const destinationProjectId = targetProjectId || currentProjectId;
    if (destinationProjectId) {
      const { data: destinationProject, error: destinationProjectError } = await supabase
        .from("projects")
        .select("name")
        .eq("id", destinationProjectId)
        .single();
      if (destinationProjectError || !destinationProject) throw new Error("Invalid destination project.");
      if (isExternalProcurementProjectName(destinationProject.name as string)) {
        throw new Error("External Procurement does not support category allocation lines.");
      }
    }

    const { data: updated, error } = await supabase
      .from("project_budget_lines")
      .update(nextValues)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated?.id) throw new Error("Budget line update was not applied.");

    const focusProjectId = targetProjectId || currentProjectId;

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/requests");
    if (focusProjectId) {
      revalidatePath(`/projects/${focusProjectId}`);
    }
    settingsSuccess("Budget line updated.", focusProjectId ? `project-${focusProjectId}` : undefined);
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not update budget line."));
  }
}

export async function addBudgetLineAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const allocatedAmount = parseMoney(formData.get("allocatedAmount"));
    if (!projectId || !productionCategoryId) throw new Error("Project and department are required.");
    await requireProjectSettingsWrite(supabase, projectId);

    const { data: projectRow, error: projectError } = await supabase.from("projects").select("name").eq("id", projectId).single();
    if (projectError || !projectRow) throw new Error("Invalid project.");
    if (isExternalProcurementProjectName(projectRow.name as string)) {
      throw new Error("External Procurement does not support category allocation lines.");
    }

    const { data: category, error: categoryError } = await supabase
      .from("production_categories")
      .select("id, name")
      .eq("id", productionCategoryId)
      .single();
    if (categoryError || !category) throw new Error("Invalid department selection.");

    const { data: existingLine, error: existingLineError } = await supabase
      .from("project_budget_lines")
      .select("id")
      .eq("project_id", projectId)
      .eq("production_category_id", productionCategoryId)
      .maybeSingle();

    if (existingLineError) throw new Error(existingLineError.message);

    if (existingLine?.id) {
      const { error: updateError } = await supabase
        .from("project_budget_lines")
        .update({
          account_code_id: null,
          budget_code: "CATEGORY",
          category: category.name as string,
          line_name: category.name as string,
          production_category_id: productionCategoryId,
          allocated_amount: allocatedAmount,
          active: true
        })
        .eq("id", existingLine.id as string);
      if (updateError) throw new Error(updateError.message);
    } else {
      const { data: maxSortRows, error: maxSortError } = await supabase
        .from("project_budget_lines")
        .select("sort_order")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (maxSortError) throw new Error(maxSortError.message);

      const nextSort = ((maxSortRows?.[0]?.sort_order as number | null) ?? -1) + 1;

      const { error: insertError } = await supabase.from("project_budget_lines").insert({
        project_id: projectId,
        budget_code: "CATEGORY",
        category: category.name as string,
        line_name: category.name as string,
        account_code_id: null,
        production_category_id: productionCategoryId,
        allocated_amount: allocatedAmount,
        sort_order: nextSort,
        active: true
      });
      if (insertError) throw new Error(insertError.message);
    }

    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/requests");
    settingsSuccess("Budget line saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not add budget line."));
  }
}

export async function reorderBudgetLinesAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const orderedLineIdsRaw = String(formData.get("orderedLineIds") ?? "").trim();

    if (!projectId || !orderedLineIdsRaw) throw new Error("Project and ordered lines are required.");
    await requireProjectSettingsWrite(supabase, projectId);

    let orderedLineIds: string[] = [];
    try {
      orderedLineIds = parseOrderedIds(orderedLineIdsRaw);
    } catch {
      throw new Error("Invalid line ordering payload.");
    }

    if (orderedLineIds.length === 0) throw new Error("No lines provided for reorder.");

    for (let idx = 0; idx < orderedLineIds.length; idx += 1) {
      const lineId = orderedLineIds[idx];
      const { error } = await supabase
        .from("project_budget_lines")
        .update({ sort_order: idx })
        .eq("id", lineId)
        .eq("project_id", projectId);
      if (error) throw new Error(error.message);
    }

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath(`/projects/${projectId}`);
    settingsSuccess("Line order saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not reorder lines."));
  }
}

export async function reorderFiscalYearsAction(formData: FormData): Promise<void> {
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const orderedIdsRaw = String(formData.get("orderedFiscalYearIds") ?? "").trim();
    if (!orderedIdsRaw) throw new Error("No fiscal year ordering payload provided.");

    let orderedIds: string[] = [];
    try {
      orderedIds = parseOrderedIds(orderedIdsRaw);
    } catch {
      throw new Error("Invalid fiscal year ordering payload.");
    }
    if (orderedIds.length === 0) throw new Error("No fiscal years provided for reorder.");

    for (let idx = 0; idx < orderedIds.length; idx += 1) {
      const { error } = await supabase.from("fiscal_years").update({ sort_order: idx }).eq("id", orderedIds[idx]);
      if (error) throw new Error(error.message);
    }

    revalidatePath("/settings");
    revalidatePath("/overview");
    settingsSuccess("Fiscal year order saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not reorder fiscal years."));
  }
}

export async function reorderOrganizationsAction(formData: FormData): Promise<void> {
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const orderedIdsRaw = String(formData.get("orderedOrganizationIds") ?? "").trim();
    if (!orderedIdsRaw) throw new Error("No organization ordering payload provided.");

    let orderedIds: string[] = [];
    try {
      orderedIds = parseOrderedIds(orderedIdsRaw);
    } catch {
      throw new Error("Invalid organization ordering payload.");
    }
    if (orderedIds.length === 0) throw new Error("No organizations provided for reorder.");

    for (let idx = 0; idx < orderedIds.length; idx += 1) {
      const { error } = await supabase.from("organizations").update({ sort_order: idx }).eq("id", orderedIds[idx]);
      if (error) throw new Error(error.message);
    }

    revalidatePath("/settings");
    revalidatePath("/overview");
    settingsSuccess("Organization order saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not reorder organizations."));
  }
}

export async function reorderProjectsAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const orderedIdsRaw = String(formData.get("orderedProjectIds") ?? "").trim();
    if (!orderedIdsRaw) throw new Error("No project ordering payload provided.");

    let orderedIds: string[] = [];
    try {
      orderedIds = parseOrderedIds(orderedIdsRaw);
    } catch {
      throw new Error("Invalid project ordering payload.");
    }
    if (orderedIds.length === 0) throw new Error("No projects provided for reorder.");
    const access = await getAccessContext();
    if (access.role !== "admin") {
      if (!access.userId) throw new Error("You must be signed in.");
      for (const projectId of orderedIds) {
        await requireProjectSettingsWrite(supabase, projectId);
      }
    }

    for (let idx = 0; idx < orderedIds.length; idx += 1) {
      let query = supabase.from("projects").update({ sort_order: idx }).eq("id", orderedIds[idx]);
      query = organizationId ? query.eq("organization_id", organizationId) : query.is("organization_id", null);
      const { error } = await query;
      if (error) throw new Error(error.message);
    }

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/overview");
    settingsSuccess("Project order saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not reorder projects."));
  }
}

function rethrowIfRedirect(error: unknown): void {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : "";

  if (message.includes("NEXT_REDIRECT") || digest.includes("NEXT_REDIRECT")) {
    throw error;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

export async function importHierarchyCsvAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error("You must be signed in.");

    const uploaded = formData.get("csvFile");
    if (!(uploaded instanceof File) || uploaded.size === 0) {
      throw new Error("Please upload a CSV file.");
    }

    const text = await uploaded.text();
    const rows = parseCsv(text);
    if (rows.length === 0) throw new Error("CSV has no data rows.");

    const requiredHeaders = [
      "fiscal_year_name",
      "organization_name",
      "org_code",
      "project_name",
      "season",
      "budget_code",
      "category",
      "line_name",
      "allocated_amount",
      "sort_order"
    ];

    const first = rows[0];
    for (const header of requiredHeaders) {
      if (!(header in first)) {
        throw new Error(`Missing required header: ${header}`);
      }
    }

    for (const row of rows) {
      const fiscalYearName = row.fiscal_year_name;
      const organizationName = row.organization_name;
      const orgCode = row.org_code;
      const projectName = row.project_name;
      const season = row.season || null;
      const budgetCode = row.budget_code;
      const category = row.category || "Uncategorized";
      const lineName = row.line_name || category;
      const allocatedAmount = Number.parseFloat(row.allocated_amount || "0");
      const sortOrder = Number.parseInt(row.sort_order || "0", 10);

      if (!projectName) continue;

      let fiscalYearId: string | null = null;
      if (fiscalYearName) {
        const { data: fyData, error: fyError } = await supabase
          .from("fiscal_years")
          .upsert({ name: fiscalYearName }, { onConflict: "name" })
          .select("id")
          .single();
        if (fyError) throw new Error(fyError.message);
        fiscalYearId = fyData.id as string;
      }

      let organizationId: string | null = null;
      if (organizationName && orgCode) {
        let orgLookup = supabase.from("organizations").select("id, name");
        orgLookup = orgLookup.eq("org_code", orgCode);

        const { data: orgMatches, error: orgLookupError } = await orgLookup;
        if (orgLookupError) throw new Error(orgLookupError.message);

        const orgExisting = (orgMatches ?? [])[0];
        if (orgExisting?.id) {
          organizationId = orgExisting.id as string;
          if ((orgExisting.name as string) !== organizationName) {
            const { error: orgUpdateError } = await supabase
              .from("organizations")
              .update({ name: organizationName })
              .eq("id", organizationId);
            if (orgUpdateError) throw new Error(orgUpdateError.message);
          }
        } else {
          const { data: orgData, error: orgError } = await supabase
            .from("organizations")
            .insert({
              name: organizationName,
              org_code: orgCode
            })
            .select("id")
            .single();
          if (orgError) throw new Error(orgError.message);
          organizationId = orgData.id as string;
        }
      }

      const { data: projectExisting } = await supabase
        .from("projects")
        .select("id")
        .eq("name", projectName)
        .eq("season", season)
        .maybeSingle();

      let projectId: string;
      if (projectExisting?.id) {
        projectId = projectExisting.id as string;
        await supabase
          .from("projects")
          .update({
            organization_id: organizationId || null,
            fiscal_year_id: fiscalYearId
          })
          .eq("id", projectId);
      } else {
        projectId = await createProjectViaRpc(supabase, {
          name: projectName,
          season,
          useTemplate: false,
          templateName: "Play/Musical Default",
          organizationId
        });
        await supabase.from("projects").update({ fiscal_year_id: fiscalYearId }).eq("id", projectId);
      }

      if (!budgetCode) continue;

      const { data: accountCodeData, error: accountCodeError } = await supabase
        .from("account_codes")
        .upsert(
          {
            code: budgetCode,
            category,
            name: lineName,
            active: true
          },
          { onConflict: "code" }
        )
        .select("id, code, category, name")
        .single();
      if (accountCodeError) throw new Error(accountCodeError.message);

      const amount = Number.isFinite(allocatedAmount) ? allocatedAmount : 0;
      const order = Number.isFinite(sortOrder) ? sortOrder : 0;

      const { error: lineError } = await supabase.from("project_budget_lines").upsert(
        {
          project_id: projectId,
          account_code_id: accountCodeData.id,
          budget_code: accountCodeData.code,
          category: accountCodeData.category,
          line_name: accountCodeData.name,
          allocated_amount: amount,
          sort_order: order
        },
        { onConflict: "project_id,budget_code,category,line_name" }
      );
      if (lineError) throw new Error(lineError.message);
    }

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/settings");
    revalidatePath("/requests");
    redirect("/settings?import=ok");
  } catch (error) {
    rethrowIfRedirect(error);
    const message = error instanceof Error ? error.message : "CSV import failed.";
    redirect(`/settings?import=error&msg=${encodeURIComponent(message)}`);
  }
}

export async function createUserAccessScopeAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const userId = String(formData.get("userId") ?? "").trim();
    const scopeRole = String(formData.get("scopeRole") ?? "").trim() as
      | "admin"
      | "project_manager"
      | "buyer"
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
      if (scopeRole !== "buyer" && scopeRole !== "viewer") {
        throw new Error("Project managers can only assign Buyer/Viewer scopes.");
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
    settingsSuccess(`User scope saved. Added ${createdCount}, skipped ${skippedCount} existing.`);
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not save user scope."));
  }
}

export async function addProjectMembershipAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const userId = String(formData.get("userId") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim() as "admin" | "project_manager" | "buyer" | "viewer";

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
    settingsSuccess("Project membership saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not save project membership."));
  }
}

export async function removeProjectMembershipAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const userId = String(formData.get("userId") ?? "").trim();
    if (!projectId || !userId) throw new Error("Project and user are required.");

    if (access.role !== "admin") {
      await requireProjectSettingsWrite(supabase, projectId);
    }

    const { error } = await supabase.rpc("remove_project_membership", {
      p_project_id: projectId,
      p_user_id: userId
    });
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    settingsSuccess("Project membership removed.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not remove project membership."));
  }
}

export async function deleteUserAccessScopeAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const id = String(formData.get("id") ?? "").trim();
    if (!id) throw new Error("Scope id is required.");

    const { data: row, error: rowError } = await supabase
      .from("user_access_scopes")
      .select("id, scope_role, project_id")
      .eq("id", id)
      .single();
    if (rowError || !row) throw new Error(rowError?.message ?? "Scope not found.");

    if (access.role !== "admin") {
      if ((row.scope_role as string) !== "buyer" && (row.scope_role as string) !== "viewer") {
        throw new Error("Project managers can only remove Buyer/Viewer scopes.");
      }
      const projectId = (row.project_id as string | null) ?? "";
      if (!projectId) throw new Error("PM can only remove project-scoped access rows.");
      await requireProjectSettingsWrite(supabase, projectId);
    }

    const { error } = await supabase.from("user_access_scopes").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    settingsSuccess("User scope removed.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not remove user scope."));
  }
}

export async function updateUserAccessScopeAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");

    const id = String(formData.get("id") ?? "").trim();
    const scopeRole = String(formData.get("scopeRole") ?? "").trim() as
      | "admin"
      | "project_manager"
      | "buyer"
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
      .select("id, scope_role, project_id")
      .eq("id", id)
      .single();
    if (existingError || !existing) throw new Error(existingError?.message ?? "Scope not found.");

    if (access.role !== "admin") {
      if (scopeRole !== "buyer" && scopeRole !== "viewer") {
        throw new Error("Project managers can only set Buyer/Viewer scopes.");
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
    settingsSuccess("User scope updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    settingsError(getErrorMessage(error, "Could not update user scope."));
  }
}
