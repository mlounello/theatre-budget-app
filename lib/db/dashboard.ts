import { getSupabaseServerClient } from "@/lib/supabase-server";
import { asNumber, type DashboardOpenRequisition } from "@/lib/db/shared";
import { getFiscalYearOrganizationOptions } from "@/lib/db/options";

export type DashboardProject = {
  projectId: string;
  projectName: string;
  season: string | null;
  fiscalYearId: string | null;
  allocatedTotal: number;
  requestedOpenTotal: number;
  heldTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
  remainingTrue: number;
  remainingIfRequestedApproved: number;
  incomeTotal: number;
};

export type DashboardOrganizationBudget = {
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
  remainingIfRequestedApproved: number;
};

export type BudgetLineTotal = {
  projectBudgetLineId: string;
  budgetCode: string;
  category: string;
  lineName: string;
  allocatedAmount: number;
  requestedOpenTotal: number;
  heldTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
  remainingTrue: number;
  remainingIfRequestedApproved: number;
};

export type ProjectCategoryRollup = {
  category: string;
  allocatedTotal: number;
  requestedOpenTotal: number;
  heldTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
  remainingTrue: number;
  remainingIfRequestedApproved: number;
};

export type ProjectBannerRollup = {
  bannerAccountCode: string;
  bannerCategory: string;
  bannerName: string;
  requestedTotal: number;
  heldTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
};

export async function getDashboardProjects(params: { fiscalYearId?: string } = {}): Promise<DashboardProject[]> {
  const supabase = await getSupabaseServerClient();
  const debugAccess = process.env.DEBUG_DASHBOARD_ACCESS === "true";
  if (debugAccess) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    console.info("[dashboard:getDashboardProjects] user", {
      userId: user?.id ?? null,
      email: user?.email ?? null,
      tables: ["projects", "v_portfolio_summary", "v_project_totals"]
    });
  }

  let projectsQuery = supabase
    .from("projects")
    .select("id, name, season, sort_order, fiscal_year_id")
    .not("name", "ilike", "external procurement")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (params.fiscalYearId) projectsQuery = projectsQuery.eq("fiscal_year_id", params.fiscalYearId);

  const { data: projectsData, error: projectsError } = await projectsQuery;
  if (debugAccess) {
    console.info(
      `[dashboard:getDashboardProjects] projects error=${projectsError?.message ?? "null"} rows=${projectsData?.length ?? 0}`
    );
  }

  if (projectsError) {
    throw projectsError;
  }

  const projectIds = (projectsData ?? []).map((row) => row.id as string);

  let totalsByProject = new Map<string, { requested: number; held: number; enc: number; pending: number; ytd: number }>();
  let summaryByProject = new Map<
    string,
    { allocated: number; obligated: number; remainingTrue: number; remainingIfRequestedApproved: number; income: number }
  >();

  if (projectIds.length > 0) {
    const { data: summaryData, error: summaryError } = await supabase
      .from("v_portfolio_summary")
      .select("project_id, allocated_total, obligated_total, remaining_true, remaining_if_requested_approved, income_total")
      .in("project_id", projectIds);
    if (debugAccess) {
      console.info(
        `[dashboard:getDashboardProjects] v_portfolio_summary error=${summaryError?.message ?? "null"} rows=${summaryData?.length ?? 0}`
      );
    }

    if (summaryError) {
      throw summaryError;
    }

    summaryByProject = new Map(
      (summaryData ?? []).map((row) => [
        row.project_id as string,
        {
          allocated: asNumber(row.allocated_total as string | number | null),
          obligated: asNumber(row.obligated_total as string | number | null),
          remainingTrue: asNumber(row.remaining_true as string | number | null),
          remainingIfRequestedApproved: asNumber(row.remaining_if_requested_approved as string | number | null),
          income: asNumber(row.income_total as string | number | null)
        }
      ])
    );

    const { data: totalsData, error: totalsError } = await supabase
      .from("v_project_totals")
      .select("project_id, requested_open_total, held_total, enc_total, pending_cc_total, ytd_total")
      .in("project_id", projectIds);
    if (debugAccess) {
      console.info(
        `[dashboard:getDashboardProjects] v_project_totals error=${totalsError?.message ?? "null"} rows=${totalsData?.length ?? 0}`
      );
    }

    if (totalsError) {
      throw totalsError;
    }

    totalsByProject = new Map(
      (totalsData ?? []).map((row) => [
        row.project_id as string,
        {
          requested: asNumber(row.requested_open_total as string | number | null),
          held: asNumber(row.held_total as string | number | null),
          enc: asNumber(row.enc_total as string | number | null),
          pending: asNumber(row.pending_cc_total as string | number | null),
          ytd: asNumber(row.ytd_total as string | number | null)
        }
      ])
    );
  }

  return (projectsData ?? []).map((row) => {
    const projectId = row.id as string;
    const totals = totalsByProject.get(projectId);
    const summary = summaryByProject.get(projectId);

    return {
      projectId,
      projectName: (row.name as string) ?? "Untitled Project",
      season: (row.season as string | null) ?? null,
      fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
      allocatedTotal: summary?.allocated ?? 0,
      requestedOpenTotal: totals?.requested ?? 0,
      heldTotal: totals?.held ?? 0,
      encTotal: totals?.enc ?? 0,
      pendingCcTotal: totals?.pending ?? 0,
      ytdTotal: totals?.ytd ?? 0,
      obligatedTotal: summary?.obligated ?? 0,
      remainingTrue: summary?.remainingTrue ?? 0,
      remainingIfRequestedApproved: summary?.remainingIfRequestedApproved ?? 0,
      incomeTotal: summary?.income ?? 0
    };
  });
}

export async function getDashboardOrganizationBudgets(
  params: { fiscalYearId?: string } = {}
): Promise<DashboardOrganizationBudget[]> {
  const supabase = await getSupabaseServerClient();
  const allOrganizations = await getFiscalYearOrganizationOptions(params.fiscalYearId);
  const allOrganizationIds = [...new Set(allOrganizations.map((row) => row.id))];
  if (allOrganizationIds.length === 0) return [];

  let directPurchasesQuery = supabase
    .from("purchases")
    .select("fiscal_year_id, organization_id, status, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount")
    .is("project_id", null)
    .in("organization_id", allOrganizationIds);
  if (params.fiscalYearId) directPurchasesQuery = directPurchasesQuery.eq("fiscal_year_id", params.fiscalYearId);
  const { data: directPurchases, error: directPurchasesError } = await directPurchasesQuery;
  if (directPurchasesError) throw directPurchasesError;

  const organizationsWithDirectPurchases = new Set(
    (directPurchases ?? []).map((purchase) => `${purchase.fiscal_year_id as string}:${purchase.organization_id as string}`)
  );
  const organizations = allOrganizations.filter(
    (row) => !row.projectTrackingRequired || organizationsWithDirectPurchases.has(`${row.fiscalYearId}:${row.id}`)
  );
  const organizationIds = [...new Set(organizations.map((row) => row.id))];
  if (organizationIds.length === 0) return [];

  let plansQuery = supabase
    .from("budget_plans")
    .select("fiscal_year_id, organization_id, annual_amount, account_codes(is_revenue)")
    .in("organization_id", organizationIds);
  if (params.fiscalYearId) plansQuery = plansQuery.eq("fiscal_year_id", params.fiscalYearId);
  const { data: plans, error: plansError } = await plansQuery;
  if (plansError) throw plansError;
  const purchases = (directPurchases ?? []).filter((purchase) =>
    organizationIds.includes(purchase.organization_id as string)
  );

  const allocatedByOrganization = new Map<string, number>();
  for (const plan of plans ?? []) {
    const account = plan.account_codes as { is_revenue?: boolean } | null;
    if (account?.is_revenue) continue;
    const organizationId = `${plan.fiscal_year_id as string}:${plan.organization_id as string}`;
    allocatedByOrganization.set(
      organizationId,
      (allocatedByOrganization.get(organizationId) ?? 0) + asNumber(plan.annual_amount as string | number | null)
    );
  }

  const totalsByOrganization = new Map<
    string,
    { requested: number; held: number; enc: number; pending: number; ytd: number }
  >();
  for (const purchase of purchases ?? []) {
    const organizationId = `${purchase.fiscal_year_id as string}:${purchase.organization_id as string}`;
    const totals = totalsByOrganization.get(organizationId) ?? { requested: 0, held: 0, enc: 0, pending: 0, ytd: 0 };
    const status = String(purchase.status ?? "").toLowerCase();
    if (status === "cancelled") {
      // Cancelled rows do not consume budget.
    } else if (status === "requested") {
      const requested = asNumber(purchase.requested_amount as string | number | null);
      totals.requested += requested !== 0 ? requested : asNumber(purchase.estimated_amount as string | number | null);
    } else if (status === "held") {
      totals.held += asNumber(purchase.estimated_amount as string | number | null);
    } else {
      totals.enc += asNumber(purchase.encumbered_amount as string | number | null);
      totals.pending += asNumber(purchase.pending_cc_amount as string | number | null);
      totals.ytd += asNumber(purchase.posted_amount as string | number | null);
    }
    totalsByOrganization.set(organizationId, totals);
  }

  return organizations.map((row) => {
    const organizationId = row.id;
    const scopeKey = `${row.fiscalYearId}:${organizationId}`;
    const allocatedTotal = allocatedByOrganization.get(scopeKey) ?? 0;
    const totals = totalsByOrganization.get(scopeKey) ?? { requested: 0, held: 0, enc: 0, pending: 0, ytd: 0 };
    const obligatedTotal = totals.enc + totals.pending + totals.ytd;
    const remainingTrue = allocatedTotal - obligatedTotal;
    return {
      organizationId,
      organizationName: row.name,
      orgCode: row.orgCode,
      fiscalYearId: row.fiscalYearId,
      fiscalYearName: row.fiscalYearName,
      allocatedTotal,
      requestedOpenTotal: totals.requested,
      heldTotal: totals.held,
      encTotal: totals.enc,
      pendingCcTotal: totals.pending,
      ytdTotal: totals.ytd,
      obligatedTotal,
      remainingTrue,
      remainingIfRequestedApproved: remainingTrue - totals.requested
    };
  });
}

export async function getDashboardOpenRequisitions(
  params: { fiscalYearId?: string; budgetType?: "all" | "theatre" | "non_theatre" } = {}
): Promise<DashboardOpenRequisition[]> {
  const supabase = await getSupabaseServerClient();
  const budgetType = params.budgetType ?? "all";
  const rows: DashboardOpenRequisition[] = [];

  if (budgetType !== "non_theatre") {
    let query = supabase
      .from("purchases")
      .select(
        "id, fiscal_year_id, project_id, title, requisition_number, po_number, procurement_status, estimated_amount, requested_amount, encumbered_amount, posted_amount, projects!inner(name, season), vendors(name)"
      )
      .eq("request_type", "requisition")
      .neq("procurement_status", "paid")
      .neq("procurement_status", "cancelled")
      .not("projects.name", "ilike", "external procurement")
      .order("created_at", { ascending: false })
      .limit(100);
    if (params.fiscalYearId) query = query.eq("fiscal_year_id", params.fiscalYearId);
    const { data, error } = await query;
    if (error) throw error;

    rows.push(...(((data as Array<Record<string, unknown>> | null) ?? []).map((row) => {
    const project = row.projects as { name?: string; season?: string | null } | null;
    const vendor = row.vendors as { name?: string } | null;
    const estimated = asNumber(row.estimated_amount as string | number | null);
    const requested = asNumber(row.requested_amount as string | number | null);
    const encumbered = asNumber(row.encumbered_amount as string | number | null);
    const posted = asNumber(row.posted_amount as string | number | null);
    const orderValue = estimated !== 0 ? estimated : requested !== 0 ? requested : encumbered !== 0 ? encumbered : posted;

    return {
      id: row.id as string,
      projectId: row.project_id as string,
      organizationId: null,
      budgetType: "theatre" as const,
      fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
      projectName: project?.name ?? "Unknown Project",
      season: project?.season ?? null,
      title: (row.title as string) ?? "Untitled",
      requisitionNumber: (row.requisition_number as string | null) ?? null,
      poNumber: (row.po_number as string | null) ?? null,
      receivingDocCodes: [],
      vendorName: vendor?.name ?? null,
      procurementStatus: ((row.procurement_status as string | null) ?? "requested").toLowerCase(),
      orderValue
    };
    })));
  }

  if (budgetType !== "theatre") {
    let query = supabase
      .from("purchases")
      .select(
        "id, fiscal_year_id, organization_id, title, requisition_number, po_number, procurement_status, estimated_amount, requested_amount, encumbered_amount, posted_amount, organizations!inner(name, org_code), vendors(name)"
      )
      .is("project_id", null)
      .eq("request_type", "requisition")
      .neq("procurement_status", "paid")
      .neq("procurement_status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(100);
    if (params.fiscalYearId) query = query.eq("fiscal_year_id", params.fiscalYearId);
    const { data, error } = await query;
    if (error) throw error;

    rows.push(...(((data as Array<Record<string, unknown>> | null) ?? []).map((row) => {
      const organization = row.organizations as { name?: string; org_code?: string } | null;
      const vendor = row.vendors as { name?: string } | null;
      const estimated = asNumber(row.estimated_amount as string | number | null);
      const requested = asNumber(row.requested_amount as string | number | null);
      const encumbered = asNumber(row.encumbered_amount as string | number | null);
      const posted = asNumber(row.posted_amount as string | number | null);
      const orderValue = estimated !== 0 ? estimated : requested !== 0 ? requested : encumbered !== 0 ? encumbered : posted;
      return {
        id: row.id as string,
        projectId: null,
        organizationId: (row.organization_id as string | null) ?? null,
        budgetType: "non_theatre" as const,
        fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
        projectName: `${organization?.org_code ?? "-"} | ${organization?.name ?? "Organization Budget"}`,
        season: null,
        title: (row.title as string) ?? "Untitled",
        requisitionNumber: (row.requisition_number as string | null) ?? null,
        poNumber: (row.po_number as string | null) ?? null,
        receivingDocCodes: [],
        vendorName: vendor?.name ?? null,
        procurementStatus: ((row.procurement_status as string | null) ?? "requested").toLowerCase(),
        orderValue
      };
    })));
  }

  if (rows.length > 0) {
    const { data: receivingDocs, error: receivingDocsError } = await supabase
      .from("purchase_receiving_docs")
      .select("purchase_id, doc_code, created_at")
      .in("purchase_id", rows.map((row) => row.id))
      .order("created_at", { ascending: true });
    if (receivingDocsError) throw receivingDocsError;
    const rowById = new Map(rows.map((row) => [row.id, row] as const));
    for (const receivingDoc of receivingDocs ?? []) {
      const row = rowById.get(receivingDoc.purchase_id as string);
      const docCode = String(receivingDoc.doc_code ?? "").trim();
      if (row && docCode && !row.receivingDocCodes.includes(docCode)) row.receivingDocCodes.push(docCode);
    }
  }

  return rows;
}

export async function getProjectBudgetBoard(projectId: string): Promise<{
  projectName: string;
  categoryRollups: ProjectCategoryRollup[];
  bannerRollups: ProjectBannerRollup[];
}> {
  const supabase = await getSupabaseServerClient();

  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .single();

  if (projectError) {
    throw projectError;
  }

  const { data, error } = await supabase
    .from("v_budget_line_totals")
    .select(
      "project_budget_line_id, budget_code, category, line_name, allocated_amount, requested_open_total, held_total, enc_total, pending_cc_total, ytd_total, obligated_total, remaining_true, remaining_if_requested_approved"
    )
    .eq("project_id", projectId)
    .order("category", { ascending: true })
    .order("budget_code", { ascending: true });

  if (error) {
    throw error;
  }

  const lines: BudgetLineTotal[] = (data ?? []).map((row) => ({
    projectBudgetLineId: row.project_budget_line_id as string,
    budgetCode: row.budget_code as string,
    category: row.category as string,
    lineName: row.line_name as string,
    allocatedAmount: asNumber(row.allocated_amount as string | number | null),
    requestedOpenTotal: asNumber(row.requested_open_total as string | number | null),
    heldTotal: asNumber(row.held_total as string | number | null),
    encTotal: asNumber(row.enc_total as string | number | null),
    pendingCcTotal: asNumber(row.pending_cc_total as string | number | null),
    ytdTotal: asNumber(row.ytd_total as string | number | null),
    obligatedTotal: asNumber(row.obligated_total as string | number | null),
    remainingTrue: asNumber(row.remaining_true as string | number | null),
    remainingIfRequestedApproved: asNumber(row.remaining_if_requested_approved as string | number | null)
  }));

  const categoryMap = new Map<string, ProjectCategoryRollup>();
  for (const line of lines) {
    const key = line.category || "Uncategorized";
    const current = categoryMap.get(key) ?? {
      category: key,
      allocatedTotal: 0,
      requestedOpenTotal: 0,
      heldTotal: 0,
      encTotal: 0,
      pendingCcTotal: 0,
      ytdTotal: 0,
      obligatedTotal: 0,
      remainingTrue: 0,
      remainingIfRequestedApproved: 0
    };
    current.allocatedTotal += line.allocatedAmount;
    current.requestedOpenTotal += line.requestedOpenTotal;
    current.heldTotal += line.heldTotal;
    current.encTotal += line.encTotal;
    current.pendingCcTotal += line.pendingCcTotal;
    current.ytdTotal += line.ytdTotal;
    current.obligatedTotal += line.obligatedTotal;
    current.remainingTrue += line.remainingTrue;
    current.remainingIfRequestedApproved += line.remainingIfRequestedApproved;
    categoryMap.set(key, current);
  }

  const { data: bannerData, error: bannerError } = await supabase
    .from("v_actuals_by_banner_code")
    .select("banner_account_code, banner_category, banner_name, requested_total, held_total, enc_total, pending_cc_total, posted_total, obligated_total")
    .eq("project_id", projectId)
    .order("banner_account_code", { ascending: true });

  if (bannerError) throw bannerError;

  return {
    projectName: (projectData.name as string) ?? "Project",
    categoryRollups: [...categoryMap.values()].sort((a, b) => a.category.localeCompare(b.category)),
    bannerRollups: (bannerData ?? []).map((row) => ({
      bannerAccountCode: (row.banner_account_code as string) ?? "UNASSIGNED",
      bannerCategory: (row.banner_category as string) ?? "Unassigned",
      bannerName: (row.banner_name as string) ?? "Unassigned",
      requestedTotal: asNumber(row.requested_total as string | number | null),
      heldTotal: asNumber(row.held_total as string | number | null),
      encTotal: asNumber(row.enc_total as string | number | null),
      pendingCcTotal: asNumber(row.pending_cc_total as string | number | null),
      ytdTotal: asNumber(row.posted_total as string | number | null),
      obligatedTotal: asNumber(row.obligated_total as string | number | null)
    }))
  };
}
