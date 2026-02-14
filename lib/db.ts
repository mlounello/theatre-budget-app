import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseStatus } from "@/lib/types";

function asNumber(value: string | number | null): number {
  if (value === null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export type DashboardProject = {
  projectId: string;
  projectName: string;
  season: string | null;
  allocatedTotal: number;
  requestedOpenTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
  remainingTrue: number;
  remainingIfRequestedApproved: number;
  incomeTotal: number;
};

export type DashboardOpenRequisition = {
  id: string;
  projectId: string;
  projectName: string;
  season: string | null;
  title: string;
  requisitionNumber: string | null;
  poNumber: string | null;
  vendorName: string | null;
  procurementStatus: string;
  orderValue: number;
};

export type BudgetLineTotal = {
  projectBudgetLineId: string;
  budgetCode: string;
  category: string;
  lineName: string;
  allocatedAmount: number;
  requestedOpenTotal: number;
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
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
};

export type PurchaseRow = {
  id: string;
  projectId: string;
  projectName: string;
  budgetLineId: string | null;
  productionCategoryId: string | null;
  productionCategoryName: string | null;
  bannerAccountCodeId: string | null;
  bannerAccountCode: string | null;
  budgetCode: string;
  category: string;
  title: string;
  referenceNumber: string | null;
  requisitionNumber: string | null;
  estimatedAmount: number;
  requestedAmount: number;
  encumberedAmount: number;
  pendingCcAmount: number;
  postedAmount: number;
  receiptTotal: number;
  receiptCount: number;
  requestType: "requisition" | "expense" | "contract" | "request" | "budget_transfer" | "contract_payment";
  isCreditCard: boolean;
  ccWorkflowStatus: "requested" | "receipts_uploaded" | "statement_paid" | "posted_to_account" | null;
  status: PurchaseStatus;
  createdAt: string;
};

export type RequestReceiptRow = {
  id: string;
  purchaseId: string;
  note: string | null;
  amountReceived: number;
  attachmentUrl: string | null;
  createdAt: string;
};

export type ProcurementRow = {
  id: string;
  projectId: string;
  projectName: string;
  season: string | null;
  organizationId: string | null;
  organizationName: string | null;
  orgCode: string | null;
  budgetLineId: string | null;
  productionCategoryId: string | null;
  productionCategoryName: string | null;
  bannerAccountCodeId: string | null;
  bannerAccountCode: string | null;
  budgetCode: string | null;
  category: string | null;
  lineName: string | null;
  budgetTracked: boolean;
  title: string;
  referenceNumber: string | null;
  requisitionNumber: string | null;
  poNumber: string | null;
  invoiceNumber: string | null;
  estimatedAmount: number;
  requestedAmount: number;
  encumberedAmount: number;
  pendingCcAmount: number;
  postedAmount: number;
  budgetStatus: PurchaseStatus;
  requestType: "requisition" | "expense" | "contract" | "request" | "budget_transfer" | "contract_payment";
  isCreditCard: boolean;
  ccWorkflowStatus: "requested" | "receipts_uploaded" | "statement_paid" | "posted_to_account" | null;
  procurementStatus: string;
  orderedOn: string | null;
  receivedOn: string | null;
  paidOn: string | null;
  vendorId: string | null;
  vendorName: string | null;
  notes: string | null;
  createdAt: string;
};

export type ProcurementReceiptRow = {
  id: string;
  purchaseId: string;
  note: string | null;
  amountReceived: number;
  fullyReceived: boolean;
  attachmentUrl: string | null;
  createdAt: string;
};

export type ContractWorkflowStatus =
  | "w9_requested"
  | "contract_sent"
  | "contract_signed_returned"
  | "siena_signed";

export type ContractInstallmentStatus = "planned" | "check_request_submitted" | "check_paid";

export type ContractRow = {
  id: string;
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  organizationId: string | null;
  organizationLabel: string | null;
  projectId: string;
  projectName: string;
  season: string | null;
  bannerAccountCodeId: string;
  bannerAccountCode: string | null;
  contractorName: string;
  contractorEmployeeId: string | null;
  contractorEmail: string | null;
  contractorPhone: string | null;
  contractValue: number;
  installmentCount: number;
  workflowStatus: ContractWorkflowStatus;
  notes: string | null;
  createdAt: string;
};

export type ContractInstallmentRow = {
  id: string;
  contractId: string;
  purchaseId: string | null;
  installmentNumber: number;
  installmentAmount: number;
  status: ContractInstallmentStatus;
  checkRequestSubmittedOn: string | null;
  checkPaidOn: string | null;
};

export type VendorOption = {
  id: string;
  name: string;
};

export type ProcurementBudgetLineOption = {
  id: string;
  projectId: string;
  projectName: string;
  season: string | null;
  organizationId: string | null;
  organizationName: string | null;
  orgCode: string | null;
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  label: string;
};

export type ProcurementProjectOption = {
  id: string;
  name: string;
  label: string;
  organizationId: string | null;
  fiscalYearId: string | null;
  isExternal: boolean;
};

export type ProductionCategoryOption = {
  id: string;
  name: string;
  sortOrder: number;
};

export type ProjectBudgetLineOption = {
  id: string;
  projectId: string;
  accountCodeId: string | null;
  projectName: string;
  season: string | null;
  organizationId: string | null;
  organizationName: string | null;
  orgCode: string | null;
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  label: string;
};

export type SettingsProject = {
  id: string;
  name: string;
  season: string | null;
  organizationId: string | null;
  fiscalYearId: string | null;
  planningRequestsEnabled: boolean;
  sortOrder: number;
};

export type AccountCodeOption = {
  id: string;
  code: string;
  category: string;
  name: string;
  label: string;
};

export type AccountCodeAdminRow = {
  id: string;
  code: string;
  category: string;
  name: string;
  active: boolean;
};

export type ProductionCategoryAdminRow = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

export type FiscalYearOption = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
};

export type OrganizationOption = {
  id: string;
  name: string;
  orgCode: string;
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  sortOrder: number;
  label: string;
};

export type OrganizationOverviewRow = {
  organizationId: string;
  organizationName: string;
  orgCode: string;
  fiscalYearName: string | null;
  allocatedTotal: number;
  requestedOpenTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
  remainingTrue: number;
  remainingIfRequestedApproved: number;
  startingBudgetTotal: number;
  additionalIncomeTotal: number;
  fundingPoolTotal: number;
  fundingPoolAvailable: number;
  incomeTotal: number;
};

export type CategoryActualRow = {
  fiscalYearName: string | null;
  orgCode: string | null;
  organizationName: string | null;
  projectName: string;
  productionCategory: string;
  requestedTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  postedTotal: number;
  obligatedTotal: number;
};

export type BannerCodeActualRow = {
  fiscalYearName: string | null;
  orgCode: string | null;
  organizationName: string | null;
  bannerAccountCode: string;
  bannerCategory: string;
  bannerName: string;
  requestedTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  postedTotal: number;
  obligatedTotal: number;
};

export type IncomeRow = {
  id: string;
  organizationId: string | null;
  organizationLabel: string;
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

export async function getDashboardProjects(): Promise<DashboardProject[]> {
  const supabase = await getSupabaseServerClient();

  const { data: projectsData, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, season, sort_order")
    .not("name", "ilike", "external procurement")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (projectsError) {
    throw projectsError;
  }

  const projectIds = (projectsData ?? []).map((row) => row.id as string);

  let totalsByProject = new Map<string, { requested: number; enc: number; pending: number; ytd: number }>();
  let summaryByProject = new Map<
    string,
    { allocated: number; obligated: number; remainingTrue: number; remainingIfRequestedApproved: number; income: number }
  >();

  if (projectIds.length > 0) {
    const { data: summaryData, error: summaryError } = await supabase
      .from("v_portfolio_summary")
      .select("project_id, allocated_total, obligated_total, remaining_true, remaining_if_requested_approved, income_total")
      .in("project_id", projectIds);

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
      .select("project_id, requested_open_total, enc_total, pending_cc_total, ytd_total")
      .in("project_id", projectIds);

    if (totalsError) {
      throw totalsError;
    }

    totalsByProject = new Map(
      (totalsData ?? []).map((row) => [
        row.project_id as string,
        {
          requested: asNumber(row.requested_open_total as string | number | null),
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
      allocatedTotal: summary?.allocated ?? 0,
      requestedOpenTotal: totals?.requested ?? 0,
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

export async function getDashboardOpenRequisitions(): Promise<DashboardOpenRequisition[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("purchases")
    .select(
      "id, project_id, title, requisition_number, po_number, procurement_status, estimated_amount, requested_amount, encumbered_amount, posted_amount, projects!inner(name, season), vendors(name)"
    )
    .eq("request_type", "requisition")
    .neq("procurement_status", "paid")
    .neq("procurement_status", "cancelled")
    .not("projects.name", "ilike", "external procurement")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return ((data as Array<Record<string, unknown>> | null) ?? []).map((row) => {
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
      projectName: project?.name ?? "Unknown Project",
      season: project?.season ?? null,
      title: (row.title as string) ?? "Untitled",
      requisitionNumber: (row.requisition_number as string | null) ?? null,
      poNumber: (row.po_number as string | null) ?? null,
      vendorName: vendor?.name ?? null,
      procurementStatus: ((row.procurement_status as string | null) ?? "requested").toLowerCase(),
      orderValue
    };
  });
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
      "project_budget_line_id, budget_code, category, line_name, allocated_amount, requested_open_total, enc_total, pending_cc_total, ytd_total, obligated_total, remaining_true, remaining_if_requested_approved"
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
      encTotal: 0,
      pendingCcTotal: 0,
      ytdTotal: 0,
      obligatedTotal: 0,
      remainingTrue: 0,
      remainingIfRequestedApproved: 0
    };
    current.allocatedTotal += line.allocatedAmount;
    current.requestedOpenTotal += line.requestedOpenTotal;
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
    .select("banner_account_code, banner_category, banner_name, requested_total, enc_total, pending_cc_total, posted_total, obligated_total")
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
      encTotal: asNumber(row.enc_total as string | number | null),
      pendingCcTotal: asNumber(row.pending_cc_total as string | number | null),
      ytdTotal: asNumber(row.posted_total as string | number | null),
      obligatedTotal: asNumber(row.obligated_total as string | number | null)
    }))
  };
}

export async function getRequestsData(): Promise<{
  purchases: PurchaseRow[];
  receipts: RequestReceiptRow[];
  budgetLineOptions: ProjectBudgetLineOption[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
  canManageSplits: boolean;
}> {
  const supabase = await getSupabaseServerClient();

  const { data: purchasesData, error: purchasesError } = await supabase
    .from("purchases")
    .select(
      "id, project_id, budget_line_id, production_category_id, banner_account_code_id, title, reference_number, requisition_number, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, status, request_type, is_credit_card, cc_workflow_status, created_at, projects(name, planning_requests_enabled), production_categories(name), account_codes(code), project_budget_lines(budget_code, category)"
    )
    .neq("request_type", "contract_payment")
    .order("created_at", { ascending: false })
    .limit(100);

  if (purchasesError) {
    throw purchasesError;
  }

  const purchaseIds = (purchasesData ?? []).map((row) => row.id as string);
  const receiptsByPurchase = new Map<string, { total: number; count: number }>();
  const requestReceipts: RequestReceiptRow[] = [];
  if (purchaseIds.length > 0) {
    const { data: receiptsData, error: receiptsError } = await supabase
      .from("purchase_receipts")
      .select("id, purchase_id, note, amount_received, attachment_url, created_at")
      .in("purchase_id", purchaseIds);
    if (receiptsError) throw receiptsError;

    for (const row of receiptsData ?? []) {
      const purchaseId = row.purchase_id as string;
      const current = receiptsByPurchase.get(purchaseId) ?? { total: 0, count: 0 };
      const amount = asNumber(row.amount_received as string | number | null);
      receiptsByPurchase.set(purchaseId, { total: current.total + amount, count: current.count + 1 });
      requestReceipts.push({
        id: row.id as string,
        purchaseId,
        note: (row.note as string | null) ?? null,
        amountReceived: amount,
        attachmentUrl: (row.attachment_url as string | null) ?? null,
        createdAt: row.created_at as string
      });
    }
  }

  const { data: optionsData, error: optionsError } = await supabase
    .from("project_budget_lines")
    .select("id, project_id, account_code_id, budget_code, category, line_name")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("budget_code", { ascending: true });

  if (optionsError) {
    throw optionsError;
  }

  const { data: projectsData, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, season, organization_id, fiscal_year_id, planning_requests_enabled, organizations(name, org_code), fiscal_years(name)")
    .eq("planning_requests_enabled", true);

  if (projectsError) {
    throw projectsError;
  }

  const { data: accountCodeData, error: accountCodeError } = await supabase
    .from("account_codes")
    .select("id, code, category, name")
    .eq("active", true)
    .order("code", { ascending: true });

  if (accountCodeError) {
    throw accountCodeError;
  }

  const { data: productionCategoryData, error: productionCategoryError } = await supabase
    .from("production_categories")
    .select("id, name, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (productionCategoryError) throw productionCategoryError;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  let canManageSplits = false;
  if (user) {
    const { data: elevatedRoles } = await supabase
      .from("project_memberships")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "project_manager"])
      .limit(1);
    canManageSplits = (elevatedRoles ?? []).length > 0;
  }

  const purchases: PurchaseRow[] = (purchasesData ?? [])
    .filter((row) => {
      const project = row.projects as { planning_requests_enabled?: boolean } | null;
      return (project?.planning_requests_enabled as boolean | null) ?? false;
    })
    .map((row) => {
      const project = row.projects as { name?: string } | null;
    const budgetLine = row.project_budget_lines as { budget_code?: string; category?: string } | null;
    const productionCategory = row.production_categories as { name?: string } | null;
    const accountCode = row.account_codes as { code?: string } | null;

    return {
      id: row.id as string,
      projectId: row.project_id as string,
      projectName: project?.name ?? "Unknown Project",
      budgetLineId: (row.budget_line_id as string | null) ?? null,
      productionCategoryId: (row.production_category_id as string | null) ?? null,
      productionCategoryName: productionCategory?.name ?? null,
      bannerAccountCodeId: (row.banner_account_code_id as string | null) ?? null,
      bannerAccountCode: accountCode?.code ?? null,
      budgetCode: budgetLine?.budget_code ?? "OFF-BUDGET",
      category: budgetLine?.category ?? "-",
      title: row.title as string,
      referenceNumber: (row.reference_number as string | null) ?? null,
      requisitionNumber: (row.requisition_number as string | null) ?? null,
      estimatedAmount: asNumber(row.estimated_amount as string | number | null),
      requestedAmount: asNumber(row.requested_amount as string | number | null),
      encumberedAmount: asNumber(row.encumbered_amount as string | number | null),
      pendingCcAmount: asNumber(row.pending_cc_amount as string | number | null),
      postedAmount: asNumber(row.posted_amount as string | number | null),
      receiptTotal: receiptsByPurchase.get(row.id as string)?.total ?? 0,
      receiptCount: receiptsByPurchase.get(row.id as string)?.count ?? 0,
      requestType: ((row.request_type as string | null) ?? "requisition") as
        | "requisition"
        | "expense"
        | "contract"
        | "request"
        | "budget_transfer"
        | "contract_payment",
      isCreditCard: Boolean(row.is_credit_card as boolean | null),
      ccWorkflowStatus: ((row.cc_workflow_status as string | null) ?? null) as
        | "requested"
        | "receipts_uploaded"
        | "statement_paid"
        | "posted_to_account"
        | null,
      status: row.status as PurchaseStatus,
      createdAt: row.created_at as string
      };
    });

  const projectLookup = new Map(
    (projectsData ?? []).map((row) => {
      const organization = row.organizations as
        | { name?: string; org_code?: string }
        | Array<{ name?: string; org_code?: string }>
        | null;
      const org = Array.isArray(organization) ? organization[0] : organization;
      const fiscalYear = row.fiscal_years as { name?: string } | null;
      return [
        row.id as string,
        {
          projectName: row.name as string,
          season: (row.season as string | null) ?? null,
          organizationId: (row.organization_id as string | null) ?? null,
          organizationName: org?.name ?? null,
          orgCode: org?.org_code ?? null,
          fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
          fiscalYearName: fiscalYear?.name ?? null
        }
      ] as const;
    })
  );

  const budgetLineOptions: ProjectBudgetLineOption[] = (optionsData ?? [])
    .filter((row) => projectLookup.has(row.project_id as string))
    .map((row) => {
      const projectMeta = projectLookup.get(row.project_id as string)!;
      return {
        id: row.id as string,
        projectId: row.project_id as string,
        accountCodeId: (row.account_code_id as string | null) ?? null,
        projectName: projectMeta.projectName,
        season: projectMeta.season,
        organizationId: projectMeta.organizationId,
        organizationName: projectMeta.organizationName,
        orgCode: projectMeta.orgCode,
        fiscalYearId: projectMeta.fiscalYearId,
        fiscalYearName: projectMeta.fiscalYearName,
        label: `${row.budget_code as string} | ${row.category as string} | ${row.line_name as string}`
      };
    });

  const accountCodeOptions: AccountCodeOption[] = (
    (accountCodeData as Array<{ id?: unknown; code?: unknown; category?: unknown; name?: unknown }> | null) ?? []
  ).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    category: row.category as string,
    name: row.name as string,
    label: `${row.code as string} | ${row.category as string} | ${row.name as string}`
  }));

  const projectOptions: ProcurementProjectOption[] = Array.from(projectLookup.entries()).map(([id, row]) => ({
    id,
    name: row.projectName,
    label: `${row.projectName}${row.season ? ` (${row.season})` : ""}`,
    organizationId: row.organizationId,
    fiscalYearId: row.fiscalYearId,
    isExternal: row.projectName.trim().toLowerCase() === "external procurement"
  }));

  const productionCategoryOptions: ProductionCategoryOption[] = (
    (productionCategoryData as Array<{ id?: unknown; name?: unknown; sort_order?: unknown }> | null) ?? []
  ).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    sortOrder: (row.sort_order as number | null) ?? 0
  }));

  return {
    purchases,
    receipts: requestReceipts,
    budgetLineOptions,
    projectOptions,
    accountCodeOptions,
    productionCategoryOptions,
    canManageSplits
  };
}

export async function getProcurementData(): Promise<{
  purchases: ProcurementRow[];
  receipts: ProcurementReceiptRow[];
  budgetLineOptions: ProcurementBudgetLineOption[];
  projectOptions: ProcurementProjectOption[];
  organizationOptions: OrganizationOption[];
  vendors: VendorOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
  canManageProcurement: boolean;
}> {
  const supabase = await getSupabaseServerClient();

  const [
    purchasesResponse,
    linesResponse,
    vendorsResponse,
    receiptsResponse,
    projectsResponse,
    organizationsResponse,
    accountCodeResponse,
    categoryResponse
  ] =
    await Promise.all([
    supabase
      .from("purchases")
      .select(
        "id, project_id, organization_id, budget_line_id, production_category_id, banner_account_code_id, budget_tracked, title, reference_number, requisition_number, po_number, invoice_number, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, status, request_type, is_credit_card, cc_workflow_status, procurement_status, ordered_on, received_on, paid_on, vendor_id, notes, created_at, organizations(name, org_code), projects(name, season, organization_id, organizations(name, org_code)), production_categories(name), account_codes(code), project_budget_lines(budget_code, category, line_name), vendors(id, name)"
      )
      .neq("request_type", "contract_payment")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("project_budget_lines")
      .select(
        "id, project_id, budget_code, category, line_name, projects(name, season, organization_id, fiscal_year_id, organizations(name, org_code), fiscal_years(name))"
      )
      .eq("active", true)
      .order("budget_code", { ascending: true }),
    supabase.from("vendors").select("id, name").order("name", { ascending: true }),
    supabase
      .from("purchase_receipts")
      .select("id, purchase_id, note, amount_received, fully_received, attachment_url, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name, season, organization_id, fiscal_year_id").order("name", { ascending: true }),
    supabase
      .from("organizations")
      .select("id, name, org_code, fiscal_year_id, sort_order, fiscal_years(name)")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("account_codes").select("id, code, category, name").eq("active", true).order("code", { ascending: true }),
    supabase
      .from("production_categories")
      .select("id, name, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
  ]);

  if (purchasesResponse.error) throw purchasesResponse.error;
  if (linesResponse.error) throw linesResponse.error;
  if (vendorsResponse.error) throw vendorsResponse.error;
  if (receiptsResponse.error) throw receiptsResponse.error;
  if (projectsResponse.error) throw projectsResponse.error;
  if (organizationsResponse.error) throw organizationsResponse.error;
  if (accountCodeResponse.error) throw accountCodeResponse.error;
  if (categoryResponse.error) throw categoryResponse.error;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  let canManageProcurement = false;
  let manageableProjectIds = new Set<string>();
  if (user) {
    const { data: elevatedRoles } = await supabase
      .from("project_memberships")
      .select("project_id, role")
      .eq("user_id", user.id)
      .in("role", ["admin", "project_manager"]);
    canManageProcurement = (elevatedRoles ?? []).length > 0;
    manageableProjectIds = new Set(
      (elevatedRoles as Array<{ project_id?: unknown }> | null)?.map((row) => row.project_id as string) ?? []
    );
  }

  const purchases: ProcurementRow[] = (purchasesResponse.data ?? []).map((row) => {
    const project = row.projects as
      | {
          name?: string;
          season?: string | null;
          organization_id?: string | null;
          organizations?: { name?: string; org_code?: string } | Array<{ name?: string; org_code?: string }> | null;
        }
      | null;
    const projectOrganization = Array.isArray(project?.organizations) ? project?.organizations[0] : project?.organizations;
    const explicitOrganization = row.organizations as { name?: string; org_code?: string } | null;
    const organizationName = explicitOrganization?.name ?? projectOrganization?.name ?? null;
    const orgCode = explicitOrganization?.org_code ?? projectOrganization?.org_code ?? null;
    const budgetLine = row.project_budget_lines as { budget_code?: string; category?: string; line_name?: string } | null;
    const vendor = row.vendors as { id?: string; name?: string } | null;
    const productionCategory = row.production_categories as { name?: string } | null;
    const accountCode = row.account_codes as { code?: string } | null;
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      projectName: project?.name ?? "Unknown Project",
      season: project?.season ?? null,
      organizationId: (row.organization_id as string | null) ?? ((project?.organization_id as string | null) ?? null),
      organizationName,
      orgCode,
      budgetLineId: (row.budget_line_id as string | null) ?? null,
      productionCategoryId: (row.production_category_id as string | null) ?? null,
      productionCategoryName: productionCategory?.name ?? null,
      bannerAccountCodeId: (row.banner_account_code_id as string | null) ?? null,
      bannerAccountCode: accountCode?.code ?? null,
      budgetCode: budgetLine?.budget_code ?? null,
      category: budgetLine?.category ?? null,
      lineName: budgetLine?.line_name ?? null,
      budgetTracked: Boolean(row.budget_tracked as boolean | null),
      title: row.title as string,
      referenceNumber: (row.reference_number as string | null) ?? null,
      requisitionNumber: (row.requisition_number as string | null) ?? null,
      poNumber: (row.po_number as string | null) ?? null,
      invoiceNumber: (row.invoice_number as string | null) ?? null,
      estimatedAmount: asNumber(row.estimated_amount as string | number | null),
      requestedAmount: asNumber(row.requested_amount as string | number | null),
      encumberedAmount: asNumber(row.encumbered_amount as string | number | null),
      pendingCcAmount: asNumber(row.pending_cc_amount as string | number | null),
      postedAmount: asNumber(row.posted_amount as string | number | null),
      budgetStatus: row.status as PurchaseStatus,
      requestType: ((row.request_type as string | null) ?? "requisition") as
        | "requisition"
        | "expense"
        | "contract"
        | "request"
        | "budget_transfer"
        | "contract_payment",
      isCreditCard: Boolean(row.is_credit_card as boolean | null),
      ccWorkflowStatus: (row.cc_workflow_status as
        | "requested"
        | "receipts_uploaded"
        | "statement_paid"
        | "posted_to_account"
        | null) ?? null,
      procurementStatus: (row.procurement_status as string | null) ?? "requested",
      orderedOn: (row.ordered_on as string | null) ?? null,
      receivedOn: (row.received_on as string | null) ?? null,
      paidOn: (row.paid_on as string | null) ?? null,
      vendorId: (row.vendor_id as string | null) ?? null,
      vendorName: vendor?.name ?? null,
      notes: (row.notes as string | null) ?? null,
      createdAt: row.created_at as string
    };
  });

  const budgetLineOptionsRaw: ProcurementBudgetLineOption[] = (linesResponse.data ?? []).map((row) => {
    const project = row.projects as
      | {
          name?: string;
          season?: string | null;
          organization_id?: string | null;
          fiscal_year_id?: string | null;
          organizations?: { name?: string; org_code?: string } | Array<{ name?: string; org_code?: string }> | null;
          fiscal_years?: { name?: string } | null;
        }
      | null;
    const organization = Array.isArray(project?.organizations) ? project?.organizations[0] : project?.organizations;
    const fiscalYear = project?.fiscal_years;
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      projectName: project?.name ?? "Unknown Project",
      season: project?.season ?? null,
      organizationId: (project?.organization_id as string | null) ?? null,
      organizationName: organization?.name ?? null,
      orgCode: organization?.org_code ?? null,
      fiscalYearId: (project?.fiscal_year_id as string | null) ?? null,
      fiscalYearName: fiscalYear?.name ?? null,
      label: `${project?.name ?? "Unknown"}${project?.season ? ` (${project.season})` : ""} | ${row.budget_code as string} | ${row.category as string} | ${row.line_name as string}`
    };
  });
  const budgetLineOptions = canManageProcurement
    ? budgetLineOptionsRaw.filter((option) => manageableProjectIds.has(option.projectId))
    : budgetLineOptionsRaw;

  const projectOptionsRaw: ProcurementProjectOption[] = (projectsResponse.data ?? []).map((row) => {
    const name = row.name as string;
    const isExternal = name.trim().toLowerCase() === "external procurement";
    return {
      id: row.id as string,
      name,
      label: `${name}${(row.season as string | null) ? ` (${row.season as string})` : ""}`,
      organizationId: (row.organization_id as string | null) ?? null,
      fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
      isExternal
    };
  });
  const projectOptions = canManageProcurement
    ? projectOptionsRaw.filter((project) => manageableProjectIds.has(project.id) || project.isExternal)
    : projectOptionsRaw;

  const projectWithHierarchy = new Map<
    string,
    { organizationId: string | null; fiscalYearId: string | null }
  >();
  for (const line of budgetLineOptions) {
    if (!projectWithHierarchy.has(line.projectId)) {
      projectWithHierarchy.set(line.projectId, {
        organizationId: line.organizationId,
        fiscalYearId: line.fiscalYearId
      });
    }
  }

  const normalizedProjectOptions: ProcurementProjectOption[] = projectOptions.map((project) => {
    const hierarchy = projectWithHierarchy.get(project.id);
    return {
      ...project,
      organizationId: hierarchy?.organizationId ?? project.organizationId ?? null,
      fiscalYearId: hierarchy?.fiscalYearId ?? project.fiscalYearId ?? null
    };
  });

  const organizationOptionsRaw: OrganizationOption[] = (organizationsResponse.data ?? []).map((row) => {
    const fy = row.fiscal_years as { name?: string } | null;
    const fiscalYearName = fy?.name ?? null;
    return {
      id: row.id as string,
      name: row.name as string,
      orgCode: row.org_code as string,
      fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
      fiscalYearName,
      sortOrder: (row.sort_order as number | null) ?? 0,
      label: `${row.org_code as string} | ${row.name as string}${fiscalYearName ? ` (${fiscalYearName})` : ""}`
    };
  });
  const organizationOptions = organizationOptionsRaw;

  const vendors: VendorOption[] = (vendorsResponse.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string
  }));

  const accountCodeOptions: AccountCodeOption[] = (
    (accountCodeResponse.data as Array<{ id?: unknown; code?: unknown; category?: unknown; name?: unknown }> | null) ?? []
  ).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    category: row.category as string,
    name: row.name as string,
    label: `${row.code as string} | ${row.category as string} | ${row.name as string}`
  }));

  const productionCategoryOptions: ProductionCategoryOption[] = (
    (categoryResponse.data as Array<{ id?: unknown; name?: unknown; sort_order?: unknown }> | null) ?? []
  ).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    sortOrder: (row.sort_order as number | null) ?? 0
  }));

  const receipts: ProcurementReceiptRow[] = (receiptsResponse.data ?? []).map((row) => ({
    id: row.id as string,
    purchaseId: row.purchase_id as string,
    note: (row.note as string | null) ?? null,
    amountReceived: asNumber(row.amount_received as string | number | null),
    fullyReceived: Boolean(row.fully_received as boolean | null),
    attachmentUrl: (row.attachment_url as string | null) ?? null,
    createdAt: row.created_at as string
  }));

  return {
    purchases,
    receipts,
    budgetLineOptions,
    projectOptions: normalizedProjectOptions,
    organizationOptions,
    vendors,
    accountCodeOptions,
    productionCategoryOptions,
    canManageProcurement
  };
}

export async function getContractsData(): Promise<{
  contracts: ContractRow[];
  installments: ContractInstallmentRow[];
  fiscalYearOptions: FiscalYearOption[];
  organizationOptions: OrganizationOption[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  canManageContracts: boolean;
}> {
  const supabase = await getSupabaseServerClient();

  const [contractsResponse, installmentsResponse, fiscalYears, organizations, projects, accountCodes] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        "id, fiscal_year_id, organization_id, project_id, banner_account_code_id, contractor_name, contractor_employee_id, contractor_email, contractor_phone, contract_value, installment_count, workflow_status, notes, created_at, fiscal_years(name), organizations(name, org_code), projects(name, season), account_codes(code)"
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("contract_installments")
      .select("id, contract_id, purchase_id, installment_number, installment_amount, status, check_request_submitted_on, check_paid_on")
      .order("contract_id", { ascending: true })
      .order("installment_number", { ascending: true }),
    getFiscalYearOptions(),
    getOrganizationOptions(),
    getSettingsProjects(),
    getAccountCodeOptions()
  ]);

  if (contractsResponse.error) throw contractsResponse.error;
  if (installmentsResponse.error) throw installmentsResponse.error;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  let canManageContracts = false;
  if (user) {
    const { data: elevatedRoles } = await supabase
      .from("project_memberships")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "project_manager"])
      .limit(1);
    canManageContracts = (elevatedRoles ?? []).length > 0;
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const fiscalYearById = new Map(fiscalYears.map((fiscalYear) => [fiscalYear.id, fiscalYear.name]));

  const contracts: ContractRow[] = (contractsResponse.data ?? []).map((row) => {
    const fy = row.fiscal_years as { name?: string } | null;
    const org = row.organizations as { name?: string; org_code?: string } | null;
    const project = row.projects as { name?: string; season?: string | null } | null;
    const account = row.account_codes as { code?: string } | null;
    const projectMeta = projectById.get(row.project_id as string);
    return {
      id: row.id as string,
      fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
      fiscalYearName:
        fy?.name ??
        (projectMeta?.fiscalYearId ? (fiscalYearById.get(projectMeta.fiscalYearId) ?? null) : null),
      organizationId: (row.organization_id as string | null) ?? null,
      organizationLabel: org ? `${org.org_code ?? ""} | ${org.name ?? ""}` : null,
      projectId: row.project_id as string,
      projectName: project?.name ?? "Unknown Project",
      season: (project?.season as string | null) ?? null,
      bannerAccountCodeId: row.banner_account_code_id as string,
      bannerAccountCode: account?.code ?? null,
      contractorName: row.contractor_name as string,
      contractorEmployeeId: (row.contractor_employee_id as string | null) ?? null,
      contractorEmail: (row.contractor_email as string | null) ?? null,
      contractorPhone: (row.contractor_phone as string | null) ?? null,
      contractValue: asNumber(row.contract_value as string | number | null),
      installmentCount: Number(row.installment_count ?? 1),
      workflowStatus: (row.workflow_status as ContractWorkflowStatus) ?? "w9_requested",
      notes: (row.notes as string | null) ?? null,
      createdAt: row.created_at as string
    };
  });

  const installments: ContractInstallmentRow[] = (installmentsResponse.data ?? []).map((row) => ({
    id: row.id as string,
    contractId: row.contract_id as string,
    purchaseId: (row.purchase_id as string | null) ?? null,
    installmentNumber: Number(row.installment_number ?? 1),
    installmentAmount: asNumber(row.installment_amount as string | number | null),
    status: ((row.status as string | null) ?? "planned") as ContractInstallmentStatus,
    checkRequestSubmittedOn: (row.check_request_submitted_on as string | null) ?? null,
    checkPaidOn: (row.check_paid_on as string | null) ?? null
  }));

  const projectOptions: ProcurementProjectOption[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    label: `${project.name}${project.season ? ` (${project.season})` : ""}`,
    organizationId: project.organizationId,
    fiscalYearId: project.fiscalYearId,
    isExternal: project.name.trim().toLowerCase() === "external procurement"
  }));

  return {
    contracts,
    installments,
    fiscalYearOptions: fiscalYears,
    organizationOptions: organizations,
    projectOptions,
    accountCodeOptions: accountCodes,
    canManageContracts
  };
}

export async function getCcPendingRows(): Promise<
  Array<{ projectId: string; budgetCode: string; creditCardName: string | null; pendingCcTotal: number }>
> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_cc_pending_by_code")
    .select("project_id, budget_code, credit_card_name, pending_cc_total")
    .gt("pending_cc_total", 0)
    .order("project_id", { ascending: true })
    .order("budget_code", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      projectId: row.project_id as string,
      budgetCode: row.budget_code as string,
      creditCardName: (row.credit_card_name as string | null) ?? null,
      pendingCcTotal: asNumber(row.pending_cc_total as string | number | null)
    }))
    .filter((row) => row.pendingCcTotal > 0);
}

export async function getSettingsProjects(): Promise<SettingsProject[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, season, organization_id, fiscal_year_id, planning_requests_enabled, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    season: (row.season as string | null) ?? null,
    organizationId: (row.organization_id as string | null) ?? null,
    fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
    planningRequestsEnabled: (row.planning_requests_enabled as boolean | null) ?? true,
    sortOrder: (row.sort_order as number | null) ?? 0
  }));
}

export async function getTemplateNames(): Promise<string[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("budget_templates").select("name").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.name as string);
}

export async function getAccountCodeOptions(): Promise<AccountCodeOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("account_codes")
    .select("id, code, category, name")
    .eq("active", true)
    .order("code", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    category: row.category as string,
    name: row.name as string,
    label: `${row.code as string} | ${row.category as string} | ${row.name as string}`
  }));
}

export async function getAccountCodesAdmin(): Promise<AccountCodeAdminRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("account_codes")
    .select("id, code, category, name, active")
    .order("code", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    category: row.category as string,
    name: row.name as string,
    active: Boolean(row.active as boolean | null)
  }));
}

export async function getProductionCategoryOptions(): Promise<ProductionCategoryOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("production_categories")
    .select("id, name, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    sortOrder: (row.sort_order as number | null) ?? 0
  }));
}

export async function getProductionCategoriesAdmin(): Promise<ProductionCategoryAdminRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("production_categories")
    .select("id, name, sort_order, active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    sortOrder: (row.sort_order as number | null) ?? 0,
    active: Boolean(row.active as boolean | null)
  }));
}

export async function getFiscalYearOptions(): Promise<FiscalYearOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("fiscal_years")
    .select("id, name, start_date, end_date, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    sortOrder: (row.sort_order as number | null) ?? 0
  }));
}

export async function getOrganizationOptions(): Promise<OrganizationOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, org_code, fiscal_year_id, sort_order, fiscal_years(name)")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const fy = row.fiscal_years as { name?: string } | null;
    const fiscalYearName = fy?.name ?? null;
    return {
      id: row.id as string,
      name: row.name as string,
      orgCode: row.org_code as string,
      fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
      fiscalYearName,
      sortOrder: (row.sort_order as number | null) ?? 0,
      label: `${row.org_code as string} | ${row.name as string}${fiscalYearName ? ` (${fiscalYearName})` : ""}`
    };
  });
}

export async function getOrganizationOverviewRows(): Promise<OrganizationOverviewRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_organization_totals")
    .select(
      "organization_id, organization_name, org_code, fiscal_year_name, allocated_total, requested_open_total, enc_total, pending_cc_total, ytd_total, obligated_total, remaining_true, remaining_if_requested_approved, starting_budget_total, additional_income_total, funding_pool_total, funding_pool_available, income_total"
    )
    .order("fiscal_year_name", { ascending: true })
    .order("org_code", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id as string,
    organizationName: row.organization_name as string,
    orgCode: row.org_code as string,
    fiscalYearName: (row.fiscal_year_name as string | null) ?? null,
    allocatedTotal: asNumber(row.allocated_total as string | number | null),
    requestedOpenTotal: asNumber(row.requested_open_total as string | number | null),
    encTotal: asNumber(row.enc_total as string | number | null),
    pendingCcTotal: asNumber(row.pending_cc_total as string | number | null),
    ytdTotal: asNumber(row.ytd_total as string | number | null),
    obligatedTotal: asNumber(row.obligated_total as string | number | null),
    remainingTrue: asNumber(row.remaining_true as string | number | null),
    remainingIfRequestedApproved: asNumber(row.remaining_if_requested_approved as string | number | null),
    startingBudgetTotal: asNumber(row.starting_budget_total as string | number | null),
    additionalIncomeTotal: asNumber(row.additional_income_total as string | number | null),
    fundingPoolTotal: asNumber(row.funding_pool_total as string | number | null),
    fundingPoolAvailable: asNumber(row.funding_pool_available as string | number | null),
    incomeTotal: asNumber(row.income_total as string | number | null)
  }));
}

export async function getCategoryActualRows(): Promise<CategoryActualRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_actuals_by_category")
    .select(
      "project_id, production_category, requested_total, enc_total, pending_cc_total, posted_total, obligated_total, projects(name, organizations(name, org_code, fiscal_years(name)))"
    )
    .order("production_category", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const project = row.projects as
      | { name?: string; organizations?: { name?: string; org_code?: string; fiscal_years?: { name?: string } | null } | null }
      | null;
    const org = project?.organizations ?? null;
    return {
      fiscalYearName: (org?.fiscal_years?.name as string | undefined) ?? null,
      orgCode: (org?.org_code as string | undefined) ?? null,
      organizationName: (org?.name as string | undefined) ?? null,
      projectName: (project?.name as string | undefined) ?? "Unknown Project",
      productionCategory: row.production_category as string,
      requestedTotal: asNumber(row.requested_total as string | number | null),
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
      "project_id, banner_account_code, banner_category, banner_name, requested_total, enc_total, pending_cc_total, posted_total, obligated_total, projects(name, organizations(name, org_code, fiscal_years(name)))"
    )
    .order("banner_account_code", { ascending: true });
  if (error) throw error;

  const grouped = new Map<string, BannerCodeActualRow>();

  for (const row of data ?? []) {
    const project = row.projects as
      | { name?: string; organizations?: { name?: string; org_code?: string; fiscal_years?: { name?: string } | null } | null }
      | null;
    const org = project?.organizations ?? null;
    const fiscalYearName = (org?.fiscal_years?.name as string | undefined) ?? null;
    const orgCode = (org?.org_code as string | undefined) ?? null;
    const organizationName = (org?.name as string | undefined) ?? null;
    const bannerAccountCode = (row.banner_account_code as string) ?? "UNASSIGNED";
    const bannerCategory = (row.banner_category as string) ?? "Unassigned";
    const bannerName = (row.banner_name as string) ?? "Unassigned";
    const key = `${fiscalYearName ?? ""}|${orgCode ?? ""}|${organizationName ?? ""}|${bannerAccountCode}`;

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        fiscalYearName,
        orgCode,
        organizationName,
        bannerAccountCode,
        bannerCategory,
        bannerName,
        requestedTotal: asNumber(row.requested_total as string | number | null),
        encTotal: asNumber(row.enc_total as string | number | null),
        pendingCcTotal: asNumber(row.pending_cc_total as string | number | null),
        postedTotal: asNumber(row.posted_total as string | number | null),
        obligatedTotal: asNumber(row.obligated_total as string | number | null)
      });
      continue;
    }

    existing.requestedTotal += asNumber(row.requested_total as string | number | null);
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
  const { data: projects, error } = await supabase
    .from("projects")
    .select(
      "id, name, season, sort_order, organization_id, fiscal_year_id, organizations(id, name, org_code, sort_order), fiscal_years(id, name, start_date, end_date, sort_order), project_budget_lines(id, account_code_id, budget_code, category, line_name, allocated_amount, sort_order, active)"
    )
    .not("name", "ilike", "external procurement")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

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
    const organizationSortOrder = (organization?.sort_order as number | null) ?? null;
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

export async function getIncomeRows(): Promise<IncomeRow[]> {
  const supabase = await getSupabaseServerClient();

  const withType = await supabase
    .from("income_lines")
    .select(
      "id, project_id, organization_id, production_category_id, banner_account_code_id, line_name, reference_number, amount, received_on, created_at, income_type, projects(name), organizations(name, org_code, fiscal_years(name)), production_categories(name), account_codes(code)"
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
    const project = row.projects as { name?: string } | null;
    const org = row.organizations as { name?: string; org_code?: string; fiscal_years?: { name?: string } | null } | null;
    const productionCategory = row.production_categories as { name?: string } | null;
    const accountCode = row.account_codes as { code?: string } | null;
    const orgLabel = org
      ? `${org.org_code ?? ""} | ${org.name ?? "Organization"}${org.fiscal_years?.name ? ` (${org.fiscal_years.name})` : ""}`
      : "Unassigned Organization";
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
      receivedOn: (row.received_on as string | null) ?? null,
      createdAt: row.created_at as string
    };
  });
}
