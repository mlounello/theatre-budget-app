import { getSupabaseServerClient } from "@/lib/supabase-server";
import { asNumber } from "@/lib/db/shared";

export type IncomeRow = {
  id: string;
  organizationId: string | null;
  organizationLabel: string;
  explicitFiscalYearId: string | null;
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  projectId: string | null;
  projectName: string | null;
  productionCategoryId: string | null;
  productionCategoryName: string | null;
  bannerAccountCodeId: string | null;
  bannerAccountCode: string | null;
  incomeType: "starting_budget" | "donation" | "ticket_sales" | "other";
  lineName: string;
  referenceNumber: string | null;
  amount: number;
  receivedOn: string | null;
  createdAt: string;
};

export type RevenuePerformanceRow = {
  fiscalYearId: string;
  fiscalYearName: string;
  organizationId: string;
  organizationLabel: string;
  accountCodeId: string;
  accountCode: string;
  accountName: string;
  targetAmount: number;
  receivedAmount: number;
  remainingToTarget: number;
  overTargetAmount: number;
};

export async function getIncomeRows(): Promise<IncomeRow[]> {
  const supabase = await getSupabaseServerClient();
  const withType = await supabase
    .from("income_lines")
    .select(
      "id, fiscal_year_id, project_id, organization_id, production_category_id, banner_account_code_id, line_name, reference_number, amount, received_on, created_at, income_type, income_fiscal_year:fiscal_years!income_lines_fiscal_year_id_fkey(name), projects(name, fiscal_year_id, fiscal_years(name)), organizations(name, org_code), production_categories(name), account_codes(code)"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (withType.error) {
    const fallback = await supabase
      .from("income_lines")
      .select("id, project_id, organization_id, line_name, reference_number, amount, received_on, created_at, projects(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (fallback.error) throw fallback.error;

    return (fallback.data ?? []).map((row) => {
      const project = row.projects as { name?: string } | null;
      const organizationLabel = (row.organization_id as string | null) ? "Organization" : "Unassigned Organization";
      return {
        id: row.id as string,
        organizationId: (row.organization_id as string | null) ?? null,
        organizationLabel,
        explicitFiscalYearId: null,
        fiscalYearId: null,
        fiscalYearName: null,
        projectId: (row.project_id as string | null) ?? null,
        projectName: project?.name ?? null,
        productionCategoryId: null,
        productionCategoryName: null,
        bannerAccountCodeId: null,
        bannerAccountCode: null,
        incomeType: "other",
        lineName: (row.line_name as string) ?? "Income",
        referenceNumber: (row.reference_number as string | null) ?? null,
        amount: asNumber(row.amount as string | number | null),
        receivedOn: (row.received_on as string | null) ?? null,
        createdAt: row.created_at as string
      };
    });
  }

  return (withType.data ?? []).map((row) => {
    const project = row.projects as { name?: string; fiscal_year_id?: string | null; fiscal_years?: { name?: string } | null } | null;
    const org = row.organizations as { name?: string; org_code?: string } | null;
    const productionCategory = row.production_categories as { name?: string } | null;
    const accountCode = row.account_codes as { code?: string } | null;
    const explicitFiscalYear = row.income_fiscal_year as { name?: string } | null;
    const orgLabel = org ? `${org.org_code ?? ""} | ${org.name ?? "Organization"}` : "Unassigned Organization";
    const receivedOn = (row.received_on as string | null) ?? null;
    const createdAt = row.created_at as string;
    const explicitFiscalYearId = (row.fiscal_year_id as string | null) ?? null;
    const fiscalYearId = explicitFiscalYearId;
    const fiscalYearName = explicitFiscalYear?.name ?? null;
    const incomeTypeRaw = (row.income_type as string | null) ?? "other";
    const incomeType =
      incomeTypeRaw === "starting_budget" ||
      incomeTypeRaw === "donation" ||
      incomeTypeRaw === "ticket_sales" ||
      incomeTypeRaw === "other"
        ? incomeTypeRaw
        : "other";

    return {
      id: row.id as string,
      organizationId: (row.organization_id as string | null) ?? null,
      organizationLabel: orgLabel,
      explicitFiscalYearId,
      fiscalYearId,
      fiscalYearName,
      projectId: (row.project_id as string | null) ?? null,
      projectName: project?.name ?? null,
      productionCategoryId: (row.production_category_id as string | null) ?? null,
      productionCategoryName: productionCategory?.name ?? null,
      bannerAccountCodeId: (row.banner_account_code_id as string | null) ?? null,
      bannerAccountCode: accountCode?.code ?? null,
      incomeType,
      lineName: (row.line_name as string) ?? "Income",
      referenceNumber: (row.reference_number as string | null) ?? null,
      amount: asNumber(row.amount as string | number | null),
      receivedOn,
      createdAt
    };
  });
}

export async function getRevenuePerformanceRows(options?: {
  fiscalYearId?: string;
  organizationId?: string;
}): Promise<RevenuePerformanceRow[]> {
  const supabase = await getSupabaseServerClient();
  let query = supabase
    .from("v_institutional_revenue_performance")
    .select(
      "fiscal_year_id, fiscal_year_name, organization_id, org_code, organization_name, account_code_id, account_code, account_name, target_amount, received_amount, remaining_to_target, over_target_amount"
    )
    .order("org_code", { ascending: true })
    .order("account_code", { ascending: true });

  if (options?.fiscalYearId && options.fiscalYearId !== "all") {
    query = query.eq("fiscal_year_id", options.fiscalYearId);
  }
  if (options?.organizationId) query = query.eq("organization_id", options.organizationId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    fiscalYearId: String(row.fiscal_year_id ?? ""),
    fiscalYearName: String(row.fiscal_year_name ?? "Fiscal Year"),
    organizationId: String(row.organization_id ?? ""),
    organizationLabel: `${String(row.org_code ?? "-")} | ${String(row.organization_name ?? "Organization")}`,
    accountCodeId: String(row.account_code_id ?? ""),
    accountCode: String(row.account_code ?? "-"),
    accountName: String(row.account_name ?? "Revenue"),
    targetAmount: asNumber(row.target_amount as string | number | null),
    receivedAmount: asNumber(row.received_amount as string | number | null),
    remainingToTarget: asNumber(row.remaining_to_target as string | number | null),
    overTargetAmount: asNumber(row.over_target_amount as string | number | null)
  }));
}
