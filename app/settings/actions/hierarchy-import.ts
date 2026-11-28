"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { type ActionState, emptyState } from "@/lib/action-helpers";
import { validateProjectOrganizationFiscalYear, createProjectViaRpc, settingsSuccess, settingsError } from "@/app/settings/actions/_shared";

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

export async function importHierarchyCsvAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
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
        const { data: orgMatches, error: orgLookupError } = await supabase
          .from("organizations")
          .select("id, name")
          .ilike("org_code", orgCode)
          .eq("active", true)
          .is("superseded_by_organization_id", null)
          .limit(1);
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
              fiscal_year_id: null
            })
            .select("id")
            .single();
          if (orgError) throw new Error(orgError.message);
          organizationId = orgData.id as string;
        }

        if (fiscalYearId && organizationId) {
          const { error: membershipError } = await supabase.from("fiscal_year_organizations").upsert(
            {
              fiscal_year_id: fiscalYearId,
              organization_id: organizationId,
              active: true,
              project_tracking_required: true
            },
            { onConflict: "fiscal_year_id,organization_id" }
          );
          if (membershipError) throw new Error(membershipError.message);
        }
      }

      let projectExistingQuery = supabase
        .from("projects")
        .select("id")
        .eq("name", projectName);
      projectExistingQuery = season ? projectExistingQuery.eq("season", season) : projectExistingQuery.is("season", null);
      const { data: projectExisting } = await projectExistingQuery.maybeSingle();

      let projectId: string;
      if (projectExisting?.id) {
        projectId = projectExisting.id as string;
        await validateProjectOrganizationFiscalYear(supabase, { fiscalYearId, organizationId });
        await supabase
          .from("projects")
          .update({
            organization_id: organizationId || null,
            fiscal_year_id: fiscalYearId
          })
          .eq("id", projectId);
      } else {
        await validateProjectOrganizationFiscalYear(supabase, { fiscalYearId, organizationId });
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
    return settingsSuccess("CSV import completed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "CSV import failed.";
    return settingsError(message);
  }
}
