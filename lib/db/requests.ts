import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseStatus } from "@/lib/types";
import { getAccessContext } from "@/lib/access";
import { type ProcurementProjectOption, type AccountCodeOption, type ProductionCategoryOption, resolveAttachmentUrls, asNumber } from "@/lib/db/shared";

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
  attachmentStoredValue: string | null;
  createdAt: string;
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
  const access = await getAccessContext();

  const { data: purchasesData, error: purchasesError } = await supabase
    .from("purchases")
    .select(
      "id, project_id, budget_line_id, production_category_id, banner_account_code_id, title, reference_number, requisition_number, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, status, request_type, is_credit_card, cc_workflow_status, created_at, projects(name, planning_requests_enabled), production_categories(name), account_codes(code), project_budget_lines(budget_code, category)"
    )
    .neq("request_type", "contract_payment")
    .order("created_at", { ascending: false });

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

    const attachmentUrls = await resolveAttachmentUrls(
      supabase,
      (receiptsData ?? []).map((row) => (row.attachment_url as string | null) ?? null)
    );

    for (const row of receiptsData ?? []) {
      const purchaseId = row.purchase_id as string;
      const current = receiptsByPurchase.get(purchaseId) ?? { total: 0, count: 0 };
      const amount = asNumber(row.amount_received as string | number | null);
      const storedAttachmentValue = (row.attachment_url as string | null) ?? null;
      receiptsByPurchase.set(purchaseId, { total: current.total + amount, count: current.count + 1 });
      requestReceipts.push({
        id: row.id as string,
        purchaseId,
        note: (row.note as string | null) ?? null,
        amountReceived: amount,
        attachmentUrl: storedAttachmentValue ? attachmentUrls.get(storedAttachmentValue) ?? null : null,
        attachmentStoredValue: storedAttachmentValue,
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
    .select("id, code, category, name, is_revenue")
    .eq("active", true)
    .order("is_revenue", { ascending: false })
    .order("code", { ascending: true });

  if (accountCodeError) {
    throw accountCodeError;
  }

  const { data: productionCategoryData, error: productionCategoryError } = await supabase
    .from("production_categories")
    .select("id, name, sort_order")
    .order("active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (productionCategoryError) throw productionCategoryError;

  const canManageSplits = access.role === "admin" || access.role === "project_manager";

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
    .filter((row) => {
      const account = (accountCodeData ?? []).find((candidate) => candidate.id === row.account_code_id);
      return !Boolean(account?.is_revenue as boolean | null);
    })
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
    (accountCodeData as Array<{ id?: unknown; code?: unknown; category?: unknown; name?: unknown; is_revenue?: unknown }> | null) ?? []
  ).filter((row) => !Boolean(row.is_revenue as boolean | null)).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    category: row.category as string,
    name: row.name as string,
    isRevenue: Boolean(row.is_revenue as boolean | null),
    label: `${row.code as string} | ${row.category as string} | ${row.name as string}${Boolean(row.is_revenue as boolean | null) ? " | Revenue" : ""}`
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
