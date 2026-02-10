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

export async function importHierarchyCsvAction(formData: FormData): Promise<void> {
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
      const { data: orgExisting } = await supabase
        .from("organizations")
        .select("id")
        .eq("org_code", orgCode)
        .eq("name", organizationName)
        .maybeSingle();

      if (orgExisting?.id) {
        organizationId = orgExisting.id as string;
      } else {
        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .insert({
            name: organizationName,
            org_code: orgCode,
            fiscal_year_id: fiscalYearId
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
      if (organizationId) {
        await supabase.from("projects").update({ organization_id: organizationId }).eq("id", projectId);
      }
    } else {
      const { data: newProject, error: projectError } = await supabase.rpc("create_project_with_admin", {
        p_name: projectName,
        p_season: season,
        p_use_template: false,
        p_template_name: "Play/Musical Default",
        p_organization_id: organizationId
      });
      if (projectError || !newProject) throw new Error(projectError?.message ?? "Could not create project.");
      projectId = newProject as string;
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
