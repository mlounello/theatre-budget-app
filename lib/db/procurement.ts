import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseStatus } from "@/lib/types";
import { getAccessContext } from "@/lib/access";
import { type ProcurementProjectOption, type OrganizationOption, type AccountCodeOption, type ProductionCategoryOption, resolveAttachmentUrls, asNumber } from "@/lib/db/shared";
import { getFiscalYearOrganizationOptions } from "@/lib/db/options";

export type ProcurementRow = {
  id: string;
  fiscalYearId: string;
  projectId: string | null;
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
  expenseNumber: string | null;
  expenseStage: "authorization" | "employee_card" | "actual" | "reimbursement" | null;
  requisitionNumber: string | null;
  poNumber: string | null;
  invoiceNumber: string | null;
  invoiceTrackingEnabled: boolean;
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

export type ProcurementInvoiceTransactionRow = {
  id: string;
  purchaseId: string;
  purchaseAllocationId: string;
  documentNumber: string;
  transactionDate: string;
  description: string | null;
  amount: number;
  ruleClassCode: string | null;
  relievesEncumbrance: boolean;
  createdAt: string;
};

export type BannerPoMatchCandidate = {
  purchaseId: string;
  purchaseAllocationId: string;
  title: string;
  poNumber: string;
  requisitionNumber: string | null;
  accountCode: string;
  allocationAmount: number;
  postedAmount: number;
  encumberedAmount: number;
  procurementStatus: string;
  projectName: string | null;
  productionCategoryName: string | null;
  label: string;
};

export type BannerReconciliationPeriod = {
  id: string;
  fiscalYearId: string;
  organizationId: string;
  organizationCode: string;
  accountCodeId: string;
  accountCode: string;
  asOfDate: string;
  ytdControlTotal: number;
  encControlTotal: number;
  encDetailTotal: number;
  appYtdTotal: number;
  appEncTotal: number;
  status: string;
  createdAt: string;
};

export type BannerImportDuplicate = {
  sourceLineKey: string;
  purchaseId: string;
  title: string;
  poNumber: string | null;
  documentNumber: string;
};

export type ProcurementReceiptRow = {
  id: string;
  purchaseId: string;
  note: string | null;
  amountReceived: number;
  fullyReceived: boolean;
  attachmentUrl: string | null;
  attachmentStoredValue: string | null;
  receiptDate: string | null;
  createdAt: string;
};

export type ProcurementReceivingDocRow = {
  id: string;
  purchaseId: string;
  docCode: string;
  receivedOn: string | null;
  note: string | null;
  createdAt: string;
};

export type ProcurementAllocationRow = {
  id: string;
  purchaseId: string;
  projectId: string | null;
  organizationId: string | null;
  productionCategoryId: string | null;
  accountCodeId: string | null;
  amount: number;
  note: string | null;
};

export type ProcurementTrackerRow = {
  id: string;
  organizationId: string | null;
  orgCode: string | null;
  organizationName: string | null;
  title: string;
  requisitionNumber: string | null;
  poNumber: string | null;
  invoiceNumber: string | null;
  receivingDocCodes: string[];
  vendorName: string | null;
  orderValue: number;
  procurementStatus: string;
  orderedOn: string | null;
  receivedOn: string | null;
  paidOn: string | null;
  notes: string | null;
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

export async function getProcurementData(
  params: {
    fiscalYearId?: string;
    page?: number;
    pageSize?: number;
    queue?: "needs_attention" | "open" | "paid" | "all";
    query?: string;
    projectId?: string;
    procurementStatus?: string;
    requestType?: string;
  } = {}
): Promise<{
  purchases: ProcurementRow[];
  receipts: ProcurementReceiptRow[];
  receivingDocs: ProcurementReceivingDocRow[];
  allocations: ProcurementAllocationRow[];
  invoiceTransactions: ProcurementInvoiceTransactionRow[];
  budgetLineOptions: ProcurementBudgetLineOption[];
  projectOptions: ProcurementProjectOption[];
  organizationOptions: OrganizationOption[];
  vendors: VendorOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
  canManageProcurement: boolean;
  totalCount: number;
  page: number;
  pageSize: number;
  queueCounts: { needsAttention: number; open: number; paid: number; all: number };
}> {
  const supabase = await getSupabaseServerClient();
  const access = await getAccessContext();
  const pageSize = Math.min(Math.max(Math.trunc(params.pageSize ?? 50), 10), 100);
  const requestedPage = Math.max(Math.trunc(params.page ?? 1), 1);
  const rangeFrom = (requestedPage - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  const needsAttentionFilter = "and(procurement_status.eq.requested,requisition_number.is.null),and(procurement_status.eq.ordered,po_number.is.null),and(procurement_status.in.(partial_received,fully_received),invoice_number.is.null),and(procurement_status.eq.invoice_received,paid_on.is.null)";
  const openExcludedStatuses = "(paid,statement_paid,posted_to_account,cancelled)";
  const completedProcurementStatuses = ["paid", "statement_paid", "posted_to_account"];
  let purchasesQuery = supabase
    .from("purchases")
    .select(
      "id, fiscal_year_id, project_id, organization_id, budget_line_id, production_category_id, banner_account_code_id, budget_tracked, title, reference_number, expense_number, expense_stage, requisition_number, po_number, invoice_number, invoice_tracking_enabled, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, status, request_type, is_credit_card, cc_workflow_status, procurement_status, ordered_on, received_on, paid_on, vendor_id, notes, created_at, organizations(name, org_code), projects(name, season, organization_id, organizations(name, org_code)), production_categories(name), account_codes(code), project_budget_lines(budget_code, category, line_name), vendors(id, name)",
      { count: "exact" }
    )
    .is("expense_claim_id", null)
    .neq("request_type", "contract_payment")
    .order("created_at", { ascending: false });
  if (params.fiscalYearId) purchasesQuery = purchasesQuery.eq("fiscal_year_id", params.fiscalYearId);
  if (params.projectId === "__organization_budget__") purchasesQuery = purchasesQuery.is("project_id", null);
  else if (params.projectId) purchasesQuery = purchasesQuery.eq("project_id", params.projectId);
  if (params.procurementStatus) purchasesQuery = purchasesQuery.eq("procurement_status", params.procurementStatus);
  if (params.requestType) purchasesQuery = purchasesQuery.eq("request_type", params.requestType);
  if (params.queue === "open") purchasesQuery = purchasesQuery.not("procurement_status", "in", openExcludedStatuses);
  else if (params.queue === "paid") purchasesQuery = purchasesQuery.in("procurement_status", completedProcurementStatuses);
  else if (params.queue === "needs_attention") purchasesQuery = purchasesQuery.or(needsAttentionFilter);
  const normalizedQuery = (params.query ?? "").trim().replace(/[(),]/g, " ").slice(0, 120);
  if (normalizedQuery) {
    const pattern = `%${normalizedQuery}%`;
    purchasesQuery = purchasesQuery.or(
      `title.ilike.${pattern},reference_number.ilike.${pattern},expense_number.ilike.${pattern},requisition_number.ilike.${pattern},po_number.ilike.${pattern},invoice_number.ilike.${pattern}`
    );
  }
  purchasesQuery = purchasesQuery.range(rangeFrom, rangeTo);

  const scopedCountQuery = () => {
    let query = supabase
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .neq("request_type", "contract_payment");
    if (params.fiscalYearId) query = query.eq("fiscal_year_id", params.fiscalYearId);
    return query;
  };

  const [
    purchasesResponse,
    linesResponse,
    vendorsResponse,
    projectsResponse,
    organizationOptionsResponse,
    accountCodeResponse,
    categoryResponse,
    allCountResponse,
    openCountResponse,
    paidCountResponse,
    needsAttentionCountResponse
  ] =
    await Promise.all([
    purchasesQuery,
    supabase
      .from("project_budget_lines")
      .select(
        "id, project_id, account_code_id, budget_code, category, line_name, account_codes(is_revenue), projects(name, season, organization_id, fiscal_year_id, organizations(name, org_code), fiscal_years(name))"
      )
      .eq("active", true)
      .order("budget_code", { ascending: true }),
    supabase.from("vendors").select("id, name").order("name", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name, season, organization_id, fiscal_year_id")
      .not("name", "ilike", "external procurement")
      .order("name", { ascending: true }),
    getFiscalYearOrganizationOptions(params.fiscalYearId),
    supabase
      .from("account_codes")
      .select("id, code, category, name, is_revenue")
      .eq("active", true)
      .order("is_revenue", { ascending: false })
      .order("code", { ascending: true }),
    supabase
      .from("production_categories")
      .select("id, name, sort_order")
      .order("active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    scopedCountQuery(),
    scopedCountQuery().not("procurement_status", "in", openExcludedStatuses),
    scopedCountQuery().in("procurement_status", completedProcurementStatuses),
    scopedCountQuery().or(needsAttentionFilter)
  ]);

  if (purchasesResponse.error) throw purchasesResponse.error;
  if (linesResponse.error) throw linesResponse.error;
  if (vendorsResponse.error) throw vendorsResponse.error;
  if (projectsResponse.error) throw projectsResponse.error;
  if (accountCodeResponse.error) throw accountCodeResponse.error;
  if (categoryResponse.error) throw categoryResponse.error;
  if (allCountResponse.error) throw allCountResponse.error;
  if (openCountResponse.error) throw openCountResponse.error;
  if (paidCountResponse.error) throw paidCountResponse.error;
  if (needsAttentionCountResponse.error) throw needsAttentionCountResponse.error;

  const currentPagePurchaseIds = (purchasesResponse.data ?? []).map((row) => row.id as string);
  const [receiptsResponse, receivingDocsResponse, allocationsResponse, invoiceTransactionsResponse] = currentPagePurchaseIds.length > 0
    ? await Promise.all([
        supabase
          .from("purchase_receipts")
          .select("id, purchase_id, note, amount_received, fully_received, attachment_url, receipt_date, created_at")
          .in("purchase_id", currentPagePurchaseIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("purchase_receiving_docs")
          .select("id, purchase_id, doc_code, received_on, note, created_at")
          .in("purchase_id", currentPagePurchaseIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("purchase_allocations")
          .select("id, purchase_id, project_id, reporting_budget_line_id, organization_id, production_category_id, account_code_id, amount, note, project_budget_lines(project_id)")
          .in("purchase_id", currentPagePurchaseIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("purchase_invoice_transactions")
          .select("id, purchase_id, purchase_allocation_id, document_number, transaction_date, description, amount, rule_class_code, relieves_encumbrance, created_at")
          .in("purchase_id", currentPagePurchaseIds)
          .is("voided_at", null)
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false })
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null }
      ];
  if (receiptsResponse.error) throw receiptsResponse.error;
  if (receivingDocsResponse.error) throw receivingDocsResponse.error;
  if (allocationsResponse.error) throw allocationsResponse.error;
  if (invoiceTransactionsResponse.error) throw invoiceTransactionsResponse.error;

  const procurementAttachmentUrls = await resolveAttachmentUrls(
    supabase,
    (receiptsResponse.data ?? []).map((row) => (row.attachment_url as string | null) ?? null)
  );

  const isGlobalAdmin = access.role === "admin";
  const canManageProcurement = isGlobalAdmin || access.role === "project_manager";
  const manageableProjectIds = access.manageableProjectIds;

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
      fiscalYearId: row.fiscal_year_id as string,
      projectId: (row.project_id as string | null) ?? null,
      projectName: project?.name ?? "Organization Budget",
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
      expenseNumber: (row.expense_number as string | null) ?? null,
      expenseStage: (row.expense_stage as "authorization" | "employee_card" | "actual" | "reimbursement" | null) ?? null,
      requisitionNumber: (row.requisition_number as string | null) ?? null,
      poNumber: (row.po_number as string | null) ?? null,
      invoiceNumber: (row.invoice_number as string | null) ?? null,
      invoiceTrackingEnabled: Boolean(row.invoice_tracking_enabled as boolean | null),
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

  const budgetLineOptionsRaw: ProcurementBudgetLineOption[] = (linesResponse.data ?? []).filter((row) => {
    const account = row.account_codes as { is_revenue?: boolean } | null;
    return !Boolean(account?.is_revenue);
  }).map((row) => {
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
  const budgetLineOptions = isGlobalAdmin
    ? budgetLineOptionsRaw
    : canManageProcurement
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
  const projectOptions = isGlobalAdmin
    ? projectOptionsRaw
    : canManageProcurement
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

  const organizationOptions = organizationOptionsResponse;

  const vendors: VendorOption[] = (vendorsResponse.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string
  }));

  const accountCodeOptions: AccountCodeOption[] = (
    (accountCodeResponse.data as Array<{ id?: unknown; code?: unknown; category?: unknown; name?: unknown; is_revenue?: unknown }> | null) ?? []
  ).filter((row) => !Boolean(row.is_revenue as boolean | null)).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    category: row.category as string,
    name: row.name as string,
    isRevenue: Boolean(row.is_revenue as boolean | null),
    label: `${row.code as string} | ${row.category as string} | ${row.name as string}${Boolean(row.is_revenue as boolean | null) ? " | Revenue" : ""}`
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
    attachmentUrl: ((row.attachment_url as string | null) ?? null)
      ? procurementAttachmentUrls.get((row.attachment_url as string | null) ?? "") ?? null
      : null,
    attachmentStoredValue: (row.attachment_url as string | null) ?? null,
    receiptDate: (row.receipt_date as string | null) ?? null,
    createdAt: row.created_at as string
  }));

  const allocations: ProcurementAllocationRow[] = (allocationsResponse.data ?? []).map((row) => {
    const reportingLine = row.project_budget_lines as { project_id?: string | null } | null;
    return {
      id: row.id as string,
      purchaseId: row.purchase_id as string,
      projectId: (row.project_id as string | null) ?? (reportingLine?.project_id as string | null) ?? null,
      organizationId: (row.organization_id as string | null) ?? null,
      productionCategoryId: (row.production_category_id as string | null) ?? null,
      accountCodeId: (row.account_code_id as string | null) ?? null,
      amount: Number(row.amount ?? 0),
      note: (row.note as string | null) ?? null
    };
  });

  const invoiceTransactions: ProcurementInvoiceTransactionRow[] = (invoiceTransactionsResponse.data ?? []).map((row) => ({
    id: row.id as string,
    purchaseId: row.purchase_id as string,
    purchaseAllocationId: row.purchase_allocation_id as string,
    documentNumber: row.document_number as string,
    transactionDate: row.transaction_date as string,
    description: (row.description as string | null) ?? null,
    amount: asNumber(row.amount as string | number | null),
    ruleClassCode: (row.rule_class_code as string | null) ?? null,
    relievesEncumbrance: Boolean(row.relieves_encumbrance),
    createdAt: row.created_at as string
  }));

  const receivingDocs: ProcurementReceivingDocRow[] = (receivingDocsResponse.data ?? []).map((row) => ({
    id: row.id as string,
    purchaseId: row.purchase_id as string,
    docCode: (row.doc_code as string) ?? "",
    receivedOn: (row.received_on as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string
  }));

  return {
    purchases,
    receipts,
    receivingDocs,
    allocations,
    invoiceTransactions,
    budgetLineOptions,
    projectOptions: normalizedProjectOptions,
    organizationOptions,
    vendors,
    accountCodeOptions,
    productionCategoryOptions,
    canManageProcurement,
    totalCount: purchasesResponse.count ?? purchases.length,
    page: requestedPage,
    pageSize,
    queueCounts: {
      needsAttention: needsAttentionCountResponse.count ?? 0,
      open: openCountResponse.count ?? 0,
      paid: paidCountResponse.count ?? 0,
      all: allCountResponse.count ?? 0
    }
  };
}

export async function getBannerAccountReconciliationData(fiscalYearId: string): Promise<{
  candidates: BannerPoMatchCandidate[];
  duplicates: BannerImportDuplicate[];
  periods: BannerReconciliationPeriod[];
}> {
  const supabase = await getSupabaseServerClient();
  const [purchasesResponse, duplicatesResponse, financialsResponse, periodsResponse] = await Promise.all([
    supabase
      .from("purchases")
      .select(
        "id, title, po_number, requisition_number, procurement_status, purchase_allocations(id, account_code_id, amount, account_codes(code), projects(name, season), production_categories(name))"
      )
      .eq("fiscal_year_id", fiscalYearId)
      .eq("request_type", "requisition")
      .not("po_number", "is", null)
      .neq("procurement_status", "cancelled")
      .order("title", { ascending: true }),
    supabase
      .from("purchase_invoice_transactions")
      .select("source_line_key, purchase_id, document_number, purchases!inner(title, po_number, fiscal_year_id)")
      .not("source_line_key", "is", null)
      .is("voided_at", null)
      .eq("purchases.fiscal_year_id", fiscalYearId),
    supabase
      .from("v_purchase_allocation_financials")
      .select("purchase_allocation_id, posted_amount, encumbered_amount")
      .eq("fiscal_year_id", fiscalYearId),
    supabase
      .from("banner_reconciliation_periods")
      .select("id, fiscal_year_id, organization_id, account_code_id, as_of_date, ytd_control_total, enc_control_total, enc_detail_total, app_ytd_total, app_enc_total, status, created_at, organizations(org_code), account_codes(code)")
      .eq("fiscal_year_id", fiscalYearId)
      .order("as_of_date", { ascending: false })
      .limit(50)
  ]);
  if (purchasesResponse.error) throw purchasesResponse.error;
  if (duplicatesResponse.error) throw duplicatesResponse.error;
  if (financialsResponse.error) throw financialsResponse.error;
  if (periodsResponse.error) throw periodsResponse.error;

  const financialByAllocation = new Map(
    ((financialsResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => [
      String(row.purchase_allocation_id ?? ""),
      {
        postedAmount: asNumber(row.posted_amount),
        encumberedAmount: asNumber(row.encumbered_amount)
      }
    ])
  );

  const candidates: BannerPoMatchCandidate[] = [];
  for (const purchase of purchasesResponse.data ?? []) {
    const allocations = (purchase.purchase_allocations ?? []) as Array<{
      id?: string;
      account_code_id?: string | null;
      amount?: string | number | null;
      account_codes?: { code?: string } | Array<{ code?: string }> | null;
      projects?: { name?: string; season?: string | null } | Array<{ name?: string; season?: string | null }> | null;
      production_categories?: { name?: string } | Array<{ name?: string }> | null;
    }>;
    for (const allocation of allocations) {
      const account = Array.isArray(allocation.account_codes) ? allocation.account_codes[0] : allocation.account_codes;
      const project = Array.isArray(allocation.projects) ? allocation.projects[0] : allocation.projects;
      const category = Array.isArray(allocation.production_categories) ? allocation.production_categories[0] : allocation.production_categories;
      const accountCode = account?.code ?? "";
      if (!allocation.id || !accountCode) continue;
      const financial = financialByAllocation.get(allocation.id) ?? { postedAmount: 0, encumberedAmount: 0 };
      const projectName = project?.name ? `${project.name}${project.season ? ` (${project.season})` : ""}` : null;
      const detail = [projectName, category?.name, accountCode].filter(Boolean).join(" · ");
      candidates.push({
        purchaseId: purchase.id as string,
        purchaseAllocationId: allocation.id,
        title: purchase.title as string,
        poNumber: purchase.po_number as string,
        requisitionNumber: (purchase.requisition_number as string | null) ?? null,
        accountCode,
        allocationAmount: asNumber(allocation.amount ?? null),
        postedAmount: financial.postedAmount,
        encumberedAmount: financial.encumberedAmount,
        procurementStatus: purchase.procurement_status as string,
        projectName,
        productionCategoryName: category?.name ?? null,
        label: `${purchase.po_number as string} · ${purchase.title as string}${detail ? ` · ${detail}` : ""} · ${String(purchase.procurement_status).replaceAll("_", " ")}`
      });
    }
  }

  const duplicates: BannerImportDuplicate[] = (duplicatesResponse.data ?? []).flatMap((row) => {
    const purchase = Array.isArray(row.purchases) ? row.purchases[0] : row.purchases;
    const sourceLineKey = (row.source_line_key as string | null) ?? null;
    if (!sourceLineKey) return [];
    return [{
      sourceLineKey,
      purchaseId: row.purchase_id as string,
      title: purchase?.title ?? "Existing PO",
      poNumber: (purchase?.po_number as string | null) ?? null,
      documentNumber: row.document_number as string
    }];
  });
  const periods: BannerReconciliationPeriod[] = ((periodsResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations as { org_code?: string } | null;
    const account = Array.isArray(row.account_codes) ? row.account_codes[0] : row.account_codes as { code?: string } | null;
    return {
      id: String(row.id),
      fiscalYearId: String(row.fiscal_year_id),
      organizationId: String(row.organization_id),
      organizationCode: organization?.org_code ?? "",
      accountCodeId: String(row.account_code_id),
      accountCode: account?.code ?? "",
      asOfDate: String(row.as_of_date),
      ytdControlTotal: asNumber(row.ytd_control_total),
      encControlTotal: asNumber(row.enc_control_total),
      encDetailTotal: asNumber(row.enc_detail_total),
      appYtdTotal: asNumber(row.app_ytd_total),
      appEncTotal: asNumber(row.app_enc_total),
      status: String(row.status),
      createdAt: String(row.created_at)
    };
  });
  return { candidates, duplicates, periods };
}

export async function getProcurementTrackerData(): Promise<{
  rows: ProcurementTrackerRow[];
  orgOptions: Array<{ id: string; label: string }>;
}> {
  const supabase = await getSupabaseServerClient();
  const access = await getAccessContext();
  if (!access.userId) return { rows: [], orgOptions: [] };

  const scopedOrgIds = [
    ...new Set(
      access.scopes
        .filter((scope) => scope.scopeRole === "procurement_tracker")
        .map((scope) => scope.organizationId)
        .filter((id): id is string => Boolean(id))
    )
  ];
  if (scopedOrgIds.length === 0) return { rows: [], orgOptions: [] };

  const [purchasesResponse, organizationsResponse, receivingDocsResponse] = await Promise.all([
    supabase
      .from("purchases")
      .select(
        "id, organization_id, title, requisition_number, po_number, invoice_number, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, status, procurement_status, ordered_on, received_on, paid_on, notes, organizations(name, org_code), vendors(name)"
      )
      .in("organization_id", scopedOrgIds)
      .neq("request_type", "contract_payment")
      .order("created_at", { ascending: false }),
    supabase.from("organizations").select("id, name, org_code").in("id", scopedOrgIds).order("org_code", { ascending: true }),
    supabase
      .from("purchase_receiving_docs")
      .select("id, purchase_id, doc_code, created_at")
      .order("created_at", { ascending: false })
  ]);

  if (purchasesResponse.error) throw purchasesResponse.error;
  if (organizationsResponse.error) throw organizationsResponse.error;
  if (receivingDocsResponse.error) throw receivingDocsResponse.error;

  const docsByPurchaseId = new Map<string, string[]>();
  for (const row of receivingDocsResponse.data ?? []) {
    const purchaseId = row.purchase_id as string;
    const list = docsByPurchaseId.get(purchaseId) ?? [];
    list.push((row.doc_code as string) ?? "");
    docsByPurchaseId.set(purchaseId, list);
  }

  const rows: ProcurementTrackerRow[] = (purchasesResponse.data ?? []).map((row) => {
    const org = row.organizations as { name?: string; org_code?: string } | null;
    const vendor = row.vendors as { name?: string } | null;
    const estimated = asNumber(row.estimated_amount as string | number | null);
    const requested = asNumber(row.requested_amount as string | number | null);
    const encumbered = asNumber(row.encumbered_amount as string | number | null);
    const pendingCc = asNumber(row.pending_cc_amount as string | number | null);
    const posted = asNumber(row.posted_amount as string | number | null);
    const budgetStatus = String(row.status ?? "").toLowerCase();
    const orderValue =
      budgetStatus === "posted"
        ? posted
        : budgetStatus === "pending_cc"
          ? pendingCc
          : budgetStatus === "encumbered"
            ? encumbered
            : budgetStatus === "requested"
              ? requested !== 0
                ? requested
                : estimated
              : posted || pendingCc || encumbered || requested || estimated;
    return {
      id: row.id as string,
      organizationId: (row.organization_id as string | null) ?? null,
      orgCode: (org?.org_code as string | undefined) ?? null,
      organizationName: (org?.name as string | undefined) ?? null,
      title: (row.title as string) ?? "",
      requisitionNumber: (row.requisition_number as string | null) ?? null,
      poNumber: (row.po_number as string | null) ?? null,
      invoiceNumber: (row.invoice_number as string | null) ?? null,
      receivingDocCodes: docsByPurchaseId.get(row.id as string) ?? [],
      vendorName: (vendor?.name as string | undefined) ?? null,
      orderValue,
      procurementStatus: (row.procurement_status as string | null) ?? "requested",
      orderedOn: (row.ordered_on as string | null) ?? null,
      receivedOn: (row.received_on as string | null) ?? null,
      paidOn: (row.paid_on as string | null) ?? null,
      notes: (row.notes as string | null) ?? null
    };
  });

  const orgOptions = (organizationsResponse.data ?? []).map((row) => ({
    id: row.id as string,
    label: `${(row.org_code as string) ?? "-"} | ${(row.name as string) ?? "Organization"}`
  }));

  return { rows, orgOptions };
}
