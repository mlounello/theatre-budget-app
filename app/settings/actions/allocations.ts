"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { type ActionState, emptyState, getErrorMessage, parseMoney } from "@/lib/action-helpers";
import { requireProjectSettingsWrite, isExternalProcurementProjectName, settingsSuccess, settingsError, requireSettingsAdmin } from "@/app/settings/actions/_shared";

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

export async function updateBudgetLineAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
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
    return settingsSuccess("Budget line updated.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not update budget line."));
  }
}

export async function updateAllocationLineInlineAction(
  _prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void _prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const allocatedAmount = parseMoney(formData.get("allocatedAmount"));
    const active = formData.get("active") === "on";

    if (!id || !projectId) throw new Error("Budget line and project are required.");
    await requireProjectSettingsWrite(supabase, projectId);

    const { data: updated, error } = await supabase
      .from("project_budget_lines")
      .update({ allocated_amount: allocatedAmount, active })
      .eq("id", id)
      .eq("project_id", projectId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated?.id) throw new Error("Budget line update was not applied.");

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    revalidatePath(`/projects/${projectId}`);
    return settingsSuccess("Allocation line saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not save allocation line."));
  }
}

export async function deleteAllocationLineAction(
  _prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void _prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const projectId = String(formData.get("projectId") ?? "").trim();

    if (!id || !projectId) throw new Error("Budget line and project are required.");
    await requireProjectSettingsWrite(supabase, projectId);

    const [
      { count: purchaseCount, error: purchaseCountError },
      { count: allocationCount, error: allocationCountError }
    ] = await Promise.all([
      supabase.from("purchases").select("id", { head: true, count: "exact" }).eq("budget_line_id", id),
      supabase.from("purchase_allocations").select("id", { head: true, count: "exact" }).eq("reporting_budget_line_id", id)
    ]);
    if (purchaseCountError) throw new Error(purchaseCountError.message);
    if (allocationCountError) throw new Error(allocationCountError.message);

    if ((purchaseCount ?? 0) > 0 || (allocationCount ?? 0) > 0) {
      throw new Error("This line is already used by purchases or allocations. Deactivate it instead of deleting it.");
    }

    const { data: deleted, error } = await supabase
      .from("project_budget_lines")
      .delete()
      .eq("id", id)
      .eq("project_id", projectId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted?.id) throw new Error("Budget line delete was not applied.");

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/requests");
    revalidatePath("/procurement");
    revalidatePath(`/projects/${projectId}`);
    return settingsSuccess("Allocation line deleted.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not delete allocation line."));
  }
}

export async function addBudgetLineAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
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
    return settingsSuccess("Budget line saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not add budget line."));
  }
}

export async function reorderBudgetLinesAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
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
    return settingsSuccess("Line order saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not reorder lines."));
  }
}

export async function reorderFiscalYearsAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
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
    return settingsSuccess("Fiscal year order saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not reorder fiscal years."));
  }
}

export async function reorderOrganizationsAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const orderedIdsRaw = String(formData.get("orderedOrganizationIds") ?? "").trim();
    if (!fiscalYearId) throw new Error("Fiscal year is required to reorder organizations.");
    if (!orderedIdsRaw) throw new Error("No organization ordering payload provided.");

    let orderedIds: string[] = [];
    try {
      orderedIds = parseOrderedIds(orderedIdsRaw);
    } catch {
      throw new Error("Invalid organization ordering payload.");
    }
    if (orderedIds.length === 0) throw new Error("No organizations provided for reorder.");

    for (let idx = 0; idx < orderedIds.length; idx += 1) {
      const { error } = await supabase
        .from("fiscal_year_organizations")
        .update({ sort_order: idx })
        .eq("fiscal_year_id", fiscalYearId)
        .eq("organization_id", orderedIds[idx]);
      if (error) throw new Error(error.message);
    }

    revalidatePath("/settings");
    revalidatePath("/overview");
    return settingsSuccess("Organization order saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not reorder organizations."));
  }
}

export async function reorderProjectsAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
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
    return settingsSuccess("Project order saved.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not reorder projects."));
  }
}
