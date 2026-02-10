"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSortOrder(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function createProjectAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const projectName = String(formData.get("projectName") ?? "").trim();
  const season = String(formData.get("season") ?? "").trim();
  const useTemplate = formData.get("useTemplate") === "on";
  const templateName = String(formData.get("templateName") ?? "Play/Musical Default").trim();

  if (!projectName) {
    throw new Error("Project name is required.");
  }

  const { data: newProjectId, error } = await supabase.rpc("create_project_with_admin", {
    p_name: projectName,
    p_season: season || null,
    p_use_template: useTemplate,
    p_template_name: templateName || "Play/Musical Default"
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!newProjectId) {
    throw new Error("Project creation returned no project id.");
  }

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/requests");
}

export async function addBudgetLineAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const projectId = String(formData.get("projectId") ?? "").trim();
  const budgetCode = String(formData.get("budgetCode") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const lineName = String(formData.get("lineName") ?? "").trim();
  const allocatedAmount = parseMoney(formData.get("allocatedAmount"));
  const sortOrder = parseSortOrder(formData.get("sortOrder"));

  if (!projectId || !budgetCode || !category || !lineName) {
    throw new Error("Project, budget code, category, and line name are required.");
  }

  const { error } = await supabase.from("project_budget_lines").insert({
    project_id: projectId,
    budget_code: budgetCode,
    category,
    line_name: lineName,
    allocated_amount: allocatedAmount,
    sort_order: sortOrder
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath(`/projects/${projectId}`);
}
