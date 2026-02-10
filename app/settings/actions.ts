"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";

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
    await supabase.from("projects").update({ organization_id: params.organizationId }).eq("id", fallback.data as string);
  }

  return fallback.data as string;
}

export async function createProjectAction(formData: FormData): Promise<void> {
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

  if (!projectName) throw new Error("Project name is required.");

  const newProjectId = await createProjectViaRpc(supabase, {
    name: projectName,
    season: season || null,
    useTemplate,
    templateName: templateName || "Play/Musical Default",
    organizationId: organizationId || null
  });

  if (!newProjectId) throw new Error("Project creation returned no project id.");

  revalidatePath("/");
  revalidatePath("/overview");
  revalidatePath("/settings");
  revalidatePath("/requests");
  revalidatePath(`/projects/${newProjectId}`);
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

export async function updateFiscalYearAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();

  if (!id || !name) throw new Error("Fiscal year id and name are required.");

  const { error } = await supabase
    .from("fiscal_years")
    .update({ name, start_date: startDate || null, end_date: endDate || null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/overview");
}

export async function updateOrganizationAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const orgCode = String(formData.get("orgCode") ?? "").trim();
  const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();

  if (!id || !name || !orgCode) throw new Error("Organization id, name, and org code are required.");

  const { error } = await supabase
    .from("organizations")
    .update({ name, org_code: orgCode, fiscal_year_id: fiscalYearId || null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/overview");
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const season = String(formData.get("season") ?? "").trim();
  const organizationId = String(formData.get("organizationId") ?? "").trim();

  if (!id || !name) throw new Error("Project id and name are required.");

  const { error } = await supabase
    .from("projects")
    .update({ name, season: season || null, organization_id: organizationId || null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/overview");
  revalidatePath(`/projects/${id}`);
}

export async function updateBudgetLineAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const id = String(formData.get("id") ?? "").trim();
  const accountCodeId = String(formData.get("accountCodeId") ?? "").trim();
  const allocatedAmount = parseMoney(formData.get("allocatedAmount"));
  const sortOrder = parseOptionalSortOrder(formData.get("sortOrder"));
  const active = formData.get("active") === "on";

  if (!id) throw new Error("Budget line id is required.");

  let nextValues: {
    allocated_amount: number;
    sort_order?: number;
    active: boolean;
    account_code_id?: string;
    budget_code?: string;
    category?: string;
    line_name?: string;
  } = { allocated_amount: allocatedAmount, active };

  if (sortOrder !== undefined) {
    nextValues.sort_order = sortOrder;
  }

  if (accountCodeId) {
    const { data: accountCode, error: accountCodeError } = await supabase
      .from("account_codes")
      .select("id, code, category, name")
      .eq("id", accountCodeId)
      .single();
    if (accountCodeError || !accountCode) throw new Error("Invalid account code selection.");
    nextValues = {
      ...nextValues,
      account_code_id: accountCode.id,
      budget_code: accountCode.code,
      category: accountCode.category,
      line_name: accountCode.name
    };
  }

  const { error } = await supabase.from("project_budget_lines").update(nextValues).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/requests");
}

export async function addBudgetLineAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in.");

  const projectId = String(formData.get("projectId") ?? "").trim();
  const accountCodeId = String(formData.get("accountCodeId") ?? "").trim();
  const allocatedAmount = parseMoney(formData.get("allocatedAmount"));
  if (!projectId || !accountCodeId) throw new Error("Project and account code are required.");

  const { data: accountCode, error: accountCodeError } = await supabase
    .from("account_codes")
    .select("id, code, category, name")
    .eq("id", accountCodeId)
    .single();

  if (accountCodeError || !accountCode) throw new Error("Invalid account code selection.");

  const { data: existingLine, error: existingLineError } = await supabase
    .from("project_budget_lines")
    .select("id")
    .eq("project_id", projectId)
    .eq("budget_code", accountCode.code)
    .eq("category", accountCode.category)
    .eq("line_name", accountCode.name)
    .maybeSingle();

  if (existingLineError) throw new Error(existingLineError.message);

  if (existingLine?.id) {
    const { error: updateError } = await supabase
      .from("project_budget_lines")
      .update({
        account_code_id: accountCode.id,
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
      budget_code: accountCode.code,
      category: accountCode.category,
      line_name: accountCode.name,
      account_code_id: accountCode.id,
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
}

export async function reorderBudgetLinesAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const orderedLineIdsRaw = String(formData.get("orderedLineIds") ?? "").trim();

  if (!projectId || !orderedLineIdsRaw) throw new Error("Project and ordered lines are required.");

  let orderedLineIds: string[] = [];
  try {
    const parsed = JSON.parse(orderedLineIdsRaw);
    if (Array.isArray(parsed)) {
      orderedLineIds = parsed.map((item) => String(item)).filter(Boolean);
    }
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
        orgLookup = fiscalYearId ? orgLookup.eq("fiscal_year_id", fiscalYearId) : orgLookup.is("fiscal_year_id", null);

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
        projectId = await createProjectViaRpc(supabase, {
          name: projectName,
          season,
          useTemplate: false,
          templateName: "Play/Musical Default",
          organizationId
        });
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
