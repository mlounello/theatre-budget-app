import { getSupabaseServerClient } from "@/lib/supabase-server";
import { asNumber } from "@/lib/db/shared";

export type OrganizationOverviewRow = {
  organizationId: string;
  organizationName: string;
  orgCode: string;
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  allocatedTotal: number;
  requestedOpenTotal: number;
  heldTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
  remainingTrue: number;
  remainingBanner: number;
  remainingIfRequestedApproved: number;
  remainingIfRequestedAndHeldApproved: number;
  startingBudgetTotal: number;
  additionalIncomeTotal: number;
  fundingPoolTotal: number;
  fundingPoolAvailable: number;
  incomeTotal: number;
};

export type CategoryActualRow = {
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  orgCode: string | null;
  organizationName: string | null;
  projectName: string;
  productionCategory: string;
  requestedTotal: number;
  heldTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  postedTotal: number;
  obligatedTotal: number;
};

export type BannerCodeActualRow = {
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  orgCode: string | null;
  organizationName: string | null;
  bannerAccountCode: string;
  bannerCategory: string;
  bannerName: string;
  requestedTotal: number;
  heldTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  postedTotal: number;
  obligatedTotal: number;
};

export type HierarchyRow = {
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  fiscalYearStartDate: string | null;
  fiscalYearEndDate: string | null;
  fiscalYearSortOrder: number | null;
  organizationId: string | null;
  organizationName: string | null;
  orgCode: string | null;
  organizationSortOrder: number | null;
  projectId: string;
  projectName: string;
  season: string | null;
  projectSortOrder: number | null;
  budgetLineId: string | null;
  budgetLineActive: boolean | null;
  accountCodeId: string | null;
  budgetCode: string | null;
  budgetCategory: string | null;
  budgetLineName: string | null;
  sortOrder: number | null;
  allocatedAmount: number | null;
};

export async function getOrganizationOverviewRows(): Promise<OrganizationOverviewRow[]> {
  const supabase = await getSupabaseServerClient();

  const [{ data, error }, { data: organizationsData, error: organizationsError }] = await Promise.all([
    supabase
      .from("v_organization_totals")
      .select(
        "organization_id, organization_name, org_code, fiscal_year_id, fiscal_year_name, allocated_total, requested_open_total, held_total, enc_total, pending_cc_total, ytd_total, obligated_total, remaining_true, remaining_if_requested_approved, starting_budget_total, additional_income_total, funding_pool_total, funding_pool_available, income_total"
      )
      .order("fiscal_year_name", { ascending: true })
      .order("org_code", { ascending: true }),
    supabase
      .from("organizations")
      .select("id, name, org_code, fiscal_year_id")
  ]);

  if (error) throw error;
  if (organizationsError) throw organizationsError;

  const organizationById = new Map<
    string,
    {
      id: string;
      name: string | null;
      org_code: string | null;
      fiscal_year_id: string | null;
    }
  >();

  for (const organization of organizationsData ?? []) {
    organizationById.set(organization.id as string, {
      id: organization.id as string,
      name: (organization.name as string | null) ?? null,
      org_code: (organization.org_code as string | null) ?? null,
      fiscal_year_id: (organization.fiscal_year_id as string | null) ?? null
    });
  }

  type GroupedOrganizationOverviewRow = {
    organizationId: string;
    organizationName: string;
    orgCode: string;
    fiscalYearId: string | null;
    fiscalYearName: string | null;
    allocatedTotal: number;
    requestedOpenTotal: number;
    heldTotal: number;
    encTotal: number;
    pendingCcTotal: number;
    ytdTotal: number;
    obligatedTotal: number;
    startingBudgetTotal: number;
    additionalIncomeTotal: number;
    fundingPoolTotal: number;
    fundingPoolAvailable: number;
    incomeTotal: number;
    usesFiscalYearSpecificOrganization: boolean;
  };

  const grouped = new Map<string, GroupedOrganizationOverviewRow>();

  for (const row of data ?? []) {
    const organizationId = row.organization_id as string;
    const organization = organizationById.get(organizationId);
    const orgCode = (row.org_code as string | null) ?? organization?.org_code ?? "UNKNOWN";
    const fiscalYearId = (row.fiscal_year_id as string | null) ?? null;
    const fiscalYearName = (row.fiscal_year_name as string | null) ?? null;
    const key = `${fiscalYearId ?? "none"}|${orgCode}`;

    const rowUsesFiscalYearSpecificOrganization = Boolean(
      fiscalYearId && organization?.fiscal_year_id === fiscalYearId
    );

    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        organizationId,
        organizationName: (row.organization_name as string | null) ?? organization?.name ?? orgCode,
        orgCode,
        fiscalYearId,
        fiscalYearName,
        allocatedTotal: asNumber(row.allocated_total as string | number | null),
        requestedOpenTotal: asNumber(row.requested_open_total as string | number | null),
        heldTotal: asNumber(row.held_total as string | number | null),
        encTotal: asNumber(row.enc_total as string | number | null),
        pendingCcTotal: asNumber(row.pending_cc_total as string | number | null),
        ytdTotal: asNumber(row.ytd_total as string | number | null),
        obligatedTotal: asNumber(row.obligated_total as string | number | null),
        startingBudgetTotal: asNumber(row.starting_budget_total as string | number | null),
        additionalIncomeTotal: asNumber(row.additional_income_total as string | number | null),
        fundingPoolTotal: asNumber(row.funding_pool_total as string | number | null),
        fundingPoolAvailable: asNumber(row.funding_pool_available as string | number | null),
        incomeTotal: asNumber(row.income_total as string | number | null),
        usesFiscalYearSpecificOrganization: rowUsesFiscalYearSpecificOrganization
      });
      continue;
    }

    existing.allocatedTotal += asNumber(row.allocated_total as string | number | null);
    existing.requestedOpenTotal += asNumber(row.requested_open_total as string | number | null);
    existing.heldTotal += asNumber(row.held_total as string | number | null);
    existing.encTotal += asNumber(row.enc_total as string | number | null);
    existing.pendingCcTotal += asNumber(row.pending_cc_total as string | number | null);
    existing.ytdTotal += asNumber(row.ytd_total as string | number | null);
    existing.obligatedTotal += asNumber(row.obligated_total as string | number | null);
    existing.startingBudgetTotal += asNumber(row.starting_budget_total as string | number | null);
    existing.additionalIncomeTotal += asNumber(row.additional_income_total as string | number | null);
    existing.fundingPoolTotal += asNumber(row.funding_pool_total as string | number | null);
    existing.fundingPoolAvailable += asNumber(row.funding_pool_available as string | number | null);
    existing.incomeTotal += asNumber(row.income_total as string | number | null);

    // Prefer displaying the fiscal-year-specific organization identity/name when duplicate
    // global and FY-specific org rows exist for the same FY/org code.
    if (rowUsesFiscalYearSpecificOrganization && !existing.usesFiscalYearSpecificOrganization) {
      existing.organizationId = organizationId;
      existing.organizationName = (row.organization_name as string | null) ?? organization?.name ?? orgCode;
      existing.usesFiscalYearSpecificOrganization = true;
    }
  }

  return Array.from(grouped.values())
    .map((row) => {
      // Revenue remains visible for reporting, but it is no longer spendable.
      const fundingPoolTotal = row.startingBudgetTotal;
      const requestedOpenTotal = row.requestedOpenTotal;
      const heldTotal = row.heldTotal;
      const encTotal = row.encTotal;
      const pendingCcTotal = row.pendingCcTotal;
      const ytdTotal = row.ytdTotal;

      // Canonical remaining formulas for org overview:
      // True = funding - (ENC + YTD + Pending CC)
      // Banner = funding - (ENC + YTD)
      // +Requests = funding - (ENC + Pending CC + YTD + Requested)
      // +Request & Holds = funding - (ENC + Pending CC + YTD + Requested + Held)
      const remainingTrue = fundingPoolTotal - (encTotal + pendingCcTotal + ytdTotal);
      const remainingBanner = fundingPoolTotal - (encTotal + ytdTotal);
      const remainingIfRequestedApproved = fundingPoolTotal - (encTotal + pendingCcTotal + ytdTotal + requestedOpenTotal);
      const remainingIfRequestedAndHeldApproved =
        fundingPoolTotal - (encTotal + pendingCcTotal + ytdTotal + requestedOpenTotal + heldTotal);

      return {
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        orgCode: row.orgCode,
        fiscalYearId: row.fiscalYearId,
        fiscalYearName: row.fiscalYearName,
        allocatedTotal: row.allocatedTotal,
        requestedOpenTotal,
        heldTotal,
        encTotal,
        pendingCcTotal,
        ytdTotal,
        obligatedTotal: row.obligatedTotal,
        remainingTrue,
        remainingBanner,
        remainingIfRequestedApproved,
        remainingIfRequestedAndHeldApproved,
        startingBudgetTotal: row.startingBudgetTotal,
        additionalIncomeTotal: row.additionalIncomeTotal,
        fundingPoolTotal,
        fundingPoolAvailable: fundingPoolTotal - row.allocatedTotal,
        incomeTotal: row.incomeTotal
      };
    })
    .sort((a, b) => {
      const fy = (a.fiscalYearName ?? "").localeCompare(b.fiscalYearName ?? "");
      if (fy !== 0) return fy;
      return a.orgCode.localeCompare(b.orgCode);
    });
}

export async function getCategoryActualRows(): Promise<CategoryActualRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_actuals_by_category")
    .select(
      "project_id, fiscal_year_id, fiscal_year_name, org_code, organization_name, production_category, requested_total, held_total, enc_total, pending_cc_total, posted_total, obligated_total, projects(name)"
    )
    .order("production_category", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const project = row.projects as
      | {
          name?: string;
        }
      | null;
    return {
      fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
      fiscalYearName: (row.fiscal_year_name as string | null) ?? null,
      orgCode: (row.org_code as string | null) ?? null,
      organizationName: (row.organization_name as string | null) ?? null,
      projectName: (project?.name as string | undefined) ?? "Unknown Project",
      productionCategory: row.production_category as string,
      requestedTotal: asNumber(row.requested_total as string | number | null),
      heldTotal: asNumber(row.held_total as string | number | null),
      encTotal: asNumber(row.enc_total as string | number | null),
      pendingCcTotal: asNumber(row.pending_cc_total as string | number | null),
      postedTotal: asNumber(row.posted_total as string | number | null),
      obligatedTotal: asNumber(row.obligated_total as string | number | null)
    };
  });
}

export async function getBannerCodeActualRows(): Promise<BannerCodeActualRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_actuals_by_banner_code")
    .select(
      "project_id, fiscal_year_id, fiscal_year_name, org_code, organization_name, banner_account_code, banner_category, banner_name, requested_total, held_total, enc_total, pending_cc_total, posted_total, obligated_total"
    )
    .order("banner_account_code", { ascending: true });
  if (error) throw error;

  const grouped = new Map<string, BannerCodeActualRow>();

  for (const row of data ?? []) {
    const fiscalYearId = (row.fiscal_year_id as string | null) ?? null;
    const fiscalYearName = (row.fiscal_year_name as string | null) ?? null;
    const orgCode = (row.org_code as string | null) ?? null;
    const organizationName = (row.organization_name as string | null) ?? null;
    const bannerAccountCode = (row.banner_account_code as string) ?? "UNASSIGNED";
    const bannerCategory = (row.banner_category as string) ?? "Unassigned";
    const bannerName = (row.banner_name as string) ?? "Unassigned";
    const key = `${fiscalYearId ?? ""}|${fiscalYearName ?? ""}|${orgCode ?? ""}|${organizationName ?? ""}|${bannerAccountCode}`;

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        fiscalYearId,
        fiscalYearName,
        orgCode,
        organizationName,
        bannerAccountCode,
        bannerCategory,
        bannerName,
        requestedTotal: asNumber(row.requested_total as string | number | null),
        heldTotal: asNumber(row.held_total as string | number | null),
        encTotal: asNumber(row.enc_total as string | number | null),
        pendingCcTotal: asNumber(row.pending_cc_total as string | number | null),
        postedTotal: asNumber(row.posted_total as string | number | null),
        obligatedTotal: asNumber(row.obligated_total as string | number | null)
      });
      continue;
    }

    existing.requestedTotal += asNumber(row.requested_total as string | number | null);
    existing.heldTotal += asNumber(row.held_total as string | number | null);
    existing.encTotal += asNumber(row.enc_total as string | number | null);
    existing.pendingCcTotal += asNumber(row.pending_cc_total as string | number | null);
    existing.postedTotal += asNumber(row.posted_total as string | number | null);
    existing.obligatedTotal += asNumber(row.obligated_total as string | number | null);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const fy = (a.fiscalYearName ?? "").localeCompare(b.fiscalYearName ?? "");
    if (fy !== 0) return fy;
    const org = (a.orgCode ?? "").localeCompare(b.orgCode ?? "");
    if (org !== 0) return org;
    return (a.bannerAccountCode ?? "").localeCompare(b.bannerAccountCode ?? "");
  });
}

export async function getHierarchyRows(): Promise<HierarchyRow[]> {
  const supabase = await getSupabaseServerClient();
  const [{ data: projects, error }, { data: memberships, error: membershipsError }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, season, sort_order, organization_id, fiscal_year_id, organizations(id, name, org_code, sort_order), fiscal_years(id, name, start_date, end_date, sort_order), project_budget_lines(id, account_code_id, budget_code, category, line_name, allocated_amount, sort_order, active)"
      )
      .not("name", "ilike", "external procurement")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("fiscal_year_organizations").select("fiscal_year_id, organization_id, sort_order").eq("active", true)
  ]);

  if (error) throw error;
  if (membershipsError) throw membershipsError;

  const membershipSort = new Map(
    (memberships ?? []).map((membership) => [
      `${membership.fiscal_year_id as string}:${membership.organization_id as string}`,
      (membership.sort_order as number | null) ?? 0
    ])
  );

  const rows: HierarchyRow[] = [];

  for (const project of projects ?? []) {
    const organization = project.organizations as
      | {
          id?: string;
          name?: string;
          org_code?: string;
          sort_order?: number | null;
        }
      | null;
    const fiscalYear = project.fiscal_years as
      | {
          id?: string;
          name?: string;
          start_date?: string | null;
          end_date?: string | null;
          sort_order?: number | null;
        }
      | null;
    const fiscalYearName = fiscalYear?.name ?? null;
    const fiscalYearId = (project.fiscal_year_id as string | null) ?? null;
    const fiscalYearStartDate = (fiscalYear?.start_date as string | null) ?? null;
    const fiscalYearEndDate = (fiscalYear?.end_date as string | null) ?? null;
    const fiscalYearSortOrder = (fiscalYear?.sort_order as number | null) ?? null;
    const organizationSortOrder =
      (fiscalYearId && organization?.id
        ? membershipSort.get(`${fiscalYearId}:${organization.id}`)
        : undefined) ?? (organization?.sort_order as number | null) ?? null;
    const projectSortOrder = (project.sort_order as number | null) ?? null;
    const lines = (project.project_budget_lines as
      | Array<{
          id?: string;
          account_code_id?: string | null;
          budget_code?: string;
          category?: string;
          line_name?: string;
          allocated_amount?: string | number | null;
          sort_order?: number | null;
          active?: boolean | null;
        }>
      | null) ?? [];

    if (lines.length === 0) {
      rows.push({
        fiscalYearName,
        fiscalYearId,
        fiscalYearStartDate,
        fiscalYearEndDate,
        fiscalYearSortOrder,
        organizationName: organization?.name ?? null,
        organizationId: (organization?.id as string | null) ?? null,
        orgCode: organization?.org_code ?? null,
        organizationSortOrder,
        projectId: project.id as string,
        projectName: project.name as string,
        season: (project.season as string | null) ?? null,
        projectSortOrder,
        budgetLineId: null,
        budgetLineActive: null,
        accountCodeId: null,
        budgetCode: null,
        budgetCategory: null,
        budgetLineName: null,
        sortOrder: null,
        allocatedAmount: null
      });
      continue;
    }

    for (const line of lines) {
      rows.push({
        fiscalYearName,
        fiscalYearId,
        fiscalYearStartDate,
        fiscalYearEndDate,
        fiscalYearSortOrder,
        organizationName: organization?.name ?? null,
        organizationId: (organization?.id as string | null) ?? null,
        orgCode: organization?.org_code ?? null,
        organizationSortOrder,
        projectId: project.id as string,
        projectName: project.name as string,
        season: (project.season as string | null) ?? null,
        projectSortOrder,
        budgetLineId: (line.id as string | null) ?? null,
        budgetLineActive: (line.active as boolean | null) ?? null,
        accountCodeId: (line.account_code_id as string | null) ?? null,
        budgetCode: line.budget_code ?? null,
        budgetCategory: line.category ?? null,
        budgetLineName: line.line_name ?? null,
        sortOrder: (line.sort_order as number | null) ?? null,
        allocatedAmount:
          line.allocated_amount === null || line.allocated_amount === undefined
            ? null
            : asNumber(line.allocated_amount as string | number | null)
      });
    }
  }

  return rows;
}
