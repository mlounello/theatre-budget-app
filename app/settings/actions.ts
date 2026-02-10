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
  const organizationId = String(formData.get("organizationId") ?? "").trim();

  if (!projectName) {
    throw new Error("Project name is required.");
  }

  const { data: newProjectId, error } = await supabase.rpc("create_project_with_admin", {
    p_name: projectName,
    p_season: season || null,
    p_use_template: useTemplate,
    p_template_name: templateName || "Play/Musical Default",
    p_organization_id: organizationId || null
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!newProjectId) {
    throw new Error("Project creation returned no project id.");
  }

  revalidatePath("/");
  revalidatePath("/overview");
  revalidatePath("/settings");
  revalidatePath("/requests");
}

export async function createFiscalYearAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();

  if (!name) throw new Error("Fiscal year name is required.");

  const { error } = await supabase.from("fiscal_years").insert({
    name,
    start_date: startDate || null,
    end_date: endDate || null
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/overview");
}

export async function createOrganizationAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const name = String(formData.get("name") ?? "").trim();
  const orgCode = String(formData.get("orgCode") ?? "").trim();
  const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();

  if (!name || !orgCode) throw new Error("Organization name and org code are required.");

  const { error } = await supabase.from("organizations").insert({
    name,
    org_code: orgCode,
    fiscal_year_id: fiscalYearId || null
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/overview");
}

export async function createAccountCodeAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const code = String(formData.get("code") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const active = formData.get("active") === "on";

  if (!code || !category || !name) throw new Error("Code, category, and name are required.");

  const { error } = await supabase.from("account_codes").upsert(
    {
      code,
      category,
      name,
      active
    },
    { onConflict: "code" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
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
  const accountCodeId = String(formData.get("accountCodeId") ?? "").trim();
  const allocatedAmount = parseMoney(formData.get("allocatedAmount"));
  const sortOrder = parseSortOrder(formData.get("sortOrder"));

  if (!projectId || !accountCodeId) {
    throw new Error("Project and account code are required.");
  }

  const { data: accountCode, error: accountCodeError } = await supabase
    .from("account_codes")
    .select("id, code, category, name")
    .eq("id", accountCodeId)
    .single();

  if (accountCodeError || !accountCode) {
    throw new Error("Invalid account code selection.");
  }

  const { error } = await supabase.from("project_budget_lines").insert({
    project_id: projectId,
    budget_code: accountCode.code,
    category: accountCode.category,
    line_name: accountCode.name,
    account_code_id: accountCode.id,
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
