import { CcPageClient } from "@/app/cc/cc-page-client";
import {
  getAccountCodeOptions,
  getCcPendingRows,
  getFiscalYearOptions,
  getFiscalYearOrganizationOptions,
  getProductionCategoryOptions,
  getSettingsProjects
} from "@/lib/db";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { resolveRequestedFiscalYearId } from "@/lib/fiscal-year-context";
import { redirect } from "next/navigation";

type StatementMonthRow = {
  id: string;
  fiscalYearId: string;
  fiscalYearName: string;
  creditCardId: string;
  creditCardName: string;
  statementMonth: string;
  postedAt: string | null;
  postedToBannerAt: string | null;
};

type PendingReceiptRow = {
  id: string;
  purchaseId: string;
  authorizationPurchaseId: string | null;
  amount: number;
  note: string | null;
  receiptDate: string;
  projectId: string | null;
  organizationId: string | null;
  productionCategoryId: string | null;
  accountCodeId: string | null;
  requestTitle: string;
  requestNumber: string | null;
  purchasePendingCcAmount: number;
  purchaseCreditCardId: string | null;
  purchaseStatus: string;
  purchaseExpenseStage: string | null;
  purchaseRequestType: string;
  purchaseIsCreditCard: boolean;
  statementMonthId: string | null;
  projectLabel: string;
  budgetLineLabel: string;
};

type PendingPurchaseDetailRow = {
  id: string;
  fiscalYearId: string;
  projectId: string | null;
  organizationId: string | null;
  productionCategoryId: string | null;
  accountCodeId: string | null;
  status: string;
  expenseStage: string | null;
  projectLabel: string;
  budgetLineLabel: string;
  requestType: string;
  isCreditCard: boolean;
  requestTitle: string;
  requestNumber: string | null;
  pendingCcAmount: number;
  receiptTotal: number;
  receiptCount: number;
  creditCardId: string | null;
  creditCardName: string | null;
  ccWorkflowStatus: string | null;
  statementMonthLabel: string | null;
  assignmentState: string;
};

type StatementLineDetailRow = {
  id: string;
  statementMonthId: string;
  amount: number;
  note: string | null;
  matchedPurchaseIds: string[];
  projectLabel: string;
  budgetLineLabel: string;
};

type PendingCcRow = {
  scopeId: string;
  projectId: string | null;
  scopeLabel: string;
  budgetCode: string;
  creditCardName: string | null;
  pendingCcTotal: number;
};

type FundingClaimRow = {
  id: string;
  claimNumber: string;
  authorizedAmount: number;
  settledAmount: number;
  creditCardId: string | null;
};

type ExpenseClaimRow = {
  id: string;
  claimNumber: string;
  claimType: string;
  claimMonth: string | null;
  status: string;
  authorizedAmount: number;
  settledAmount: number;
  authorizationClaimId: string | null;
  overageExplanation: string | null;
  projectLabel: string;
  cardLabel: string | null;
  expenses: Array<{ id: string; expenseNumber: string | null; title: string; amount: number; stage: string | null; budgetLabel: string; accountCode: string | null }>;
};

const EXPENSE_CLAIM_PAGE_SIZE = 25;

export default async function CreditCardPage({
  searchParams
}: {
  searchParams?: Promise<{
    cc_month_card?: string;
    cc_month_state?: string;
    cc_month_q?: string;
    cc_pending_project?: string;
    cc_pending_card?: string;
    cc_pending_q?: string;
    cc_view?: string;
    cc_statement?: string;
    cc_claim_page?: string;
    fiscalYearId?: string;
  }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const fiscalYearOptions = await getFiscalYearOptions();
  const selectedFiscalYearId = resolveRequestedFiscalYearId(
    fiscalYearOptions,
    (resolvedSearchParams?.fiscalYearId ?? "").trim()
  );
  const selectedView = ["current", "claims", "exceptions", "history", "setup"].includes(resolvedSearchParams?.cc_view ?? "")
    ? resolvedSearchParams?.cc_view as "current" | "claims" | "exceptions" | "history" | "setup"
    : "current";
  const requestedStatementId = (resolvedSearchParams?.cc_statement ?? "").trim();
  const expenseClaimPage = Math.max(Number.parseInt(resolvedSearchParams?.cc_claim_page ?? "1", 10) || 1, 1);
  const expenseClaimRangeFrom = (expenseClaimPage - 1) * EXPENSE_CLAIM_PAGE_SIZE;
  const expenseClaimRangeTo = expenseClaimRangeFrom + EXPENSE_CLAIM_PAGE_SIZE - 1;

  const supabase = await getSupabaseServerClient();
  const [
    rows,
    projects,
    cardsResponse,
    monthsResponse,
    receiptsResponse,
    pendingPurchasesResponse,
    statementLinesResponse,
    expenseClaimsResponse,
    authorizationClaimsResponse,
    accountCodeOptions,
    productionCategoryOptions,
    organizationOptions
  ] = await Promise.all([
    getCcPendingRows({ fiscalYearId: selectedFiscalYearId }),
    getSettingsProjects(),
    supabase.from("credit_cards").select("id, nickname, masked_number, active").order("nickname", { ascending: true }),
    supabase
      .from("cc_statement_months")
      .select("id, fiscal_year_id, credit_card_id, statement_month, posted_at, posted_to_banner_at, fiscal_years(name), credit_cards(nickname)")
      .eq("fiscal_year_id", selectedFiscalYearId)
      .order("statement_month", { ascending: false }),
    supabase
      .from("purchase_receipts")
      .select(
        "id, purchase_id, authorization_purchase_id, amount_received, note, created_at, receipt_date, project_id, organization_id, production_category_id, account_code_id, cc_statement_month_id, receipt_projects:projects!purchase_receipts_project_id_fkey(name, season), receipt_organizations:organizations!purchase_receipts_organization_id_fkey(name, org_code), receipt_categories:production_categories!purchase_receipts_production_category_id_fkey(name), receipt_accounts:account_codes!purchase_receipts_account_code_id_fkey(code), purchases!inner(id, fiscal_year_id, organization_id, title, reference_number, requisition_number, expense_number, expense_stage, pending_cc_amount, cc_statement_month_id, credit_card_id, status, request_type, is_credit_card, projects(name, season), organizations(name, org_code), production_categories(name), account_codes(code), project_budget_lines(budget_code))"
      )
      .eq("purchases.fiscal_year_id", selectedFiscalYearId)
      .order("created_at", { ascending: true }),
    supabase
      .from("purchases")
      .select(
        "id, fiscal_year_id, project_id, organization_id, production_category_id, banner_account_code_id, title, reference_number, requisition_number, expense_number, expense_stage, pending_cc_amount, status, request_type, is_credit_card, cc_workflow_status, cc_statement_month_id, credit_card_id, projects(name, season), organizations(name, org_code), production_categories(name), account_codes(code), project_budget_lines(budget_code), credit_cards(nickname)"
      )
      .eq("fiscal_year_id", selectedFiscalYearId)
      .eq("request_type", "expense")
      .order("created_at", { ascending: false }),
    supabase
      .from("cc_statement_lines")
      .select(
        "id, fiscal_year_id, organization_id, banner_account_code_id, statement_month_id, amount, note, matched_purchase_ids, organizations(name, org_code), account_codes(code), project_budget_lines(budget_code, account_codes(code), production_categories(name), projects(name, season))"
      )
      .eq("fiscal_year_id", selectedFiscalYearId),
    supabase
      .from("expense_claims")
      .select("id, claim_number, claim_type, claim_month, status, authorized_amount, settled_amount, authorization_claim_id, overage_explanation, project_id, organization_id, credit_card_id, projects(name, season), organizations(name, org_code), credit_cards(nickname), purchases!purchases_expense_claim_id_fkey(id, expense_number, title, estimated_amount, expense_stage, projects(name, season), organizations(name, org_code), production_categories(name), account_codes(code))", { count: "exact" })
      .eq("fiscal_year_id", selectedFiscalYearId)
      .order("created_at", { ascending: false })
      .range(expenseClaimRangeFrom, expenseClaimRangeTo),
    supabase
      .from("expense_claims")
      .select("id, claim_number, claim_type, status, authorized_amount, settled_amount, authorization_claim_id, credit_card_id")
      .eq("fiscal_year_id", selectedFiscalYearId)
      .or("claim_type.eq.funding_request,authorization_claim_id.not.is.null")
      .limit(500),
    getAccountCodeOptions(),
    getProductionCategoryOptions(),
    getFiscalYearOrganizationOptions(selectedFiscalYearId)
  ]);

  if (cardsResponse.error) throw cardsResponse.error;
  if (monthsResponse.error) throw monthsResponse.error;
  if (receiptsResponse.error) throw receiptsResponse.error;
  if (pendingPurchasesResponse.error) throw pendingPurchasesResponse.error;
  if (statementLinesResponse.error) throw statementLinesResponse.error;
  if (expenseClaimsResponse.error) throw expenseClaimsResponse.error;
  if (authorizationClaimsResponse.error) throw authorizationClaimsResponse.error;
  const hasGlobalAdmin = access.role === "admin";
  const manageableProjectIds = access.manageableProjectIds;

  const manageableProjects = hasGlobalAdmin ? projects : projects.filter((project) => manageableProjectIds.has(project.id));
  const scopedProjects = manageableProjects.filter((project) => project.fiscalYearId === selectedFiscalYearId);

  const cards = (cardsResponse.data ?? []).map((row) => ({
    id: row.id as string,
    nickname: row.nickname as string,
    maskedNumber: (row.masked_number as string | null) ?? null,
    active: Boolean(row.active as boolean | null)
  }));
  const expenseClaims: ExpenseClaimRow[] = (expenseClaimsResponse.data ?? []).map((row) => {
    const project = row.projects as { name?: string; season?: string | null } | null;
    const organization = row.organizations as { name?: string; org_code?: string } | null;
    const card = row.credit_cards as { nickname?: string } | null;
    const claimExpenses = (row.purchases as Array<{ id?: string; expense_number?: string | null; title?: string; estimated_amount?: number | string; expense_stage?: string | null; projects?: { name?: string; season?: string | null } | null; organizations?: { name?: string; org_code?: string } | null; production_categories?: { name?: string } | null; account_codes?: { code?: string } | null }> | null) ?? [];
    const expenseScopeLabels = new Set(claimExpenses.map((expense) => expense.projects
      ? `${expense.projects.name ?? "Project"}${expense.projects.season ? ` (${expense.projects.season})` : ""}`
      : `${expense.organizations?.org_code ?? "-"} | ${expense.organizations?.name ?? "Organization Budget"}`));
    return {
      id: row.id as string,
      claimNumber: row.claim_number as string,
      claimType: row.claim_type as string,
      claimMonth: (row.claim_month as string | null) ?? null,
      status: row.status as string,
      authorizedAmount: Number(row.authorized_amount ?? 0),
      settledAmount: Number(row.settled_amount ?? 0),
      authorizationClaimId: (row.authorization_claim_id as string | null) ?? null,
      overageExplanation: (row.overage_explanation as string | null) ?? null,
      projectLabel: expenseScopeLabels.size > 1
        ? `${expenseScopeLabels.size} budget destinations`
        : expenseScopeLabels.values().next().value ?? (project
        ? `${project.name ?? "Unknown Project"}${project.season ? ` (${project.season})` : ""}`
        : organization ? `${organization.org_code ?? "-"} | ${organization.name ?? "Organization Budget"}` : "Expense-level budgets"),
      cardLabel: card?.nickname ?? null,
      expenses: claimExpenses.map((expense) => ({
        id: expense.id as string,
        expenseNumber: expense.expense_number ?? null,
        title: expense.title ?? "Expense",
        amount: Number(expense.estimated_amount ?? 0),
        stage: expense.expense_stage ?? null,
        budgetLabel: expense.projects
          ? `${expense.projects.name ?? "Project"}${expense.production_categories?.name ? ` · ${expense.production_categories.name}` : ""}`
          : `${expense.organizations?.org_code ?? "Organization"}`,
        accountCode: expense.account_codes?.code ?? null
      }))
    };
  });
  const reconciledByAuthorization = new Map<string, number>();
  for (const claim of authorizationClaimsResponse.data ?? []) {
    if (!claim.authorization_claim_id || claim.status === "cancelled") continue;
    reconciledByAuthorization.set(
      claim.authorization_claim_id as string,
      (reconciledByAuthorization.get(claim.authorization_claim_id as string) ?? 0) + Number(claim.settled_amount ?? 0)
    );
  }
  const fundingClaims: FundingClaimRow[] = (authorizationClaimsResponse.data ?? [])
    .filter((row) => row.claim_type === "funding_request" && row.status !== "cancelled")
    .map((row) => ({
      id: row.id as string,
      claimNumber: row.claim_number as string,
      authorizedAmount: Number(row.authorized_amount ?? 0),
      settledAmount: reconciledByAuthorization.get(row.id as string) ?? 0,
      creditCardId: (row.credit_card_id as string | null) ?? null
    }));

  const statementMonths: StatementMonthRow[] = (monthsResponse.data ?? []).map((row) => {
    const card = row.credit_cards as { nickname?: string } | null;
    const fiscalYear = row.fiscal_years as { name?: string } | null;
    return {
      id: row.id as string,
      fiscalYearId: row.fiscal_year_id as string,
      fiscalYearName: fiscalYear?.name ?? "Fiscal Year",
      creditCardId: row.credit_card_id as string,
      creditCardName: card?.nickname ?? "Unknown Card",
      statementMonth: row.statement_month as string,
      postedAt: (row.posted_at as string | null) ?? null,
      postedToBannerAt: (row.posted_to_banner_at as string | null) ?? null
    };
  });

  const selectedMonthCard = (resolvedSearchParams?.cc_month_card ?? "").trim();
  const selectedMonthState = (resolvedSearchParams?.cc_month_state ?? "").trim();
  const selectedMonthQuery = (resolvedSearchParams?.cc_month_q ?? "").trim().toLowerCase();

  const filteredStatementMonths = statementMonths.filter((month) => {
    if (selectedMonthCard && month.creditCardId !== selectedMonthCard) return false;
    if (selectedMonthState === "open" && month.postedAt) return false;
    if (selectedMonthState === "statement_paid" && (!month.postedAt || month.postedToBannerAt)) return false;
    if (selectedMonthState === "posted_to_banner" && !month.postedToBannerAt) return false;
    if (selectedMonthQuery) {
      const hay = `${month.creditCardName} ${month.statementMonth.slice(0, 7)} ${month.postedAt ? "statement paid" : "open"} ${
        month.postedToBannerAt ? "posted to banner" : ""
      }`.toLowerCase();
      if (!hay.includes(selectedMonthQuery)) return false;
    }
    return true;
  });

  const statementLineDetails: StatementLineDetailRow[] = (statementLinesResponse.data ?? []).map((row) => {
    const budgetLine = row.project_budget_lines as
      | {
          budget_code?: string;
          account_codes?: { code?: string } | null;
          production_categories?: { name?: string } | null;
          projects?: { name?: string; season?: string | null } | null;
        }
      | null;
    const project = budgetLine?.projects;
    const directOrganization = row.organizations as { name?: string; org_code?: string } | null;
    const directAccountCode = row.account_codes as { code?: string } | null;
    const accountCode = budgetLine?.account_codes;
    const productionCategory = budgetLine?.production_categories;
    return {
      id: row.id as string,
      statementMonthId: row.statement_month_id as string,
      amount: Number(row.amount ?? 0),
      note: (row.note as string | null) ?? null,
      matchedPurchaseIds: Array.isArray(row.matched_purchase_ids)
        ? row.matched_purchase_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
      projectLabel: project
        ? `${project.name ?? "Unknown Project"}${project.season ? ` (${project.season})` : ""}`
        : `${directOrganization?.org_code ?? "-"} | ${directOrganization?.name ?? "Organization Budget"}`,
      budgetLineLabel: `${directAccountCode?.code ?? accountCode?.code ?? budgetLine?.budget_code ?? "-"} | ${productionCategory?.name ?? "-"}`
    };
  });

  const statementMonthIdByMatchedPurchaseId = new Map<string, string>();
  for (const row of statementLineDetails) {
    const statementMonthId = row.statementMonthId;
    if (!statementMonthId) continue;
    const matchedPurchaseIds = row.matchedPurchaseIds;
    for (const purchaseId of matchedPurchaseIds) {
      if (!statementMonthIdByMatchedPurchaseId.has(purchaseId)) {
        statementMonthIdByMatchedPurchaseId.set(purchaseId, statementMonthId);
      }
    }
  }

  const pendingReceipts: PendingReceiptRow[] = (receiptsResponse.data ?? []).map((row) => {
    const purchase = row.purchases as
      | {
          id?: string;
          title?: string;
          reference_number?: string | null;
          requisition_number?: string | null;
          expense_number?: string | null;
          expense_stage?: string | null;
          pending_cc_amount?: number | string | null;
          cc_statement_month_id?: string | null;
          credit_card_id?: string | null;
          status?: string;
          request_type?: string;
          is_credit_card?: boolean | null;
          organizations?: { name?: string; org_code?: string } | null;
          projects?: { name?: string; season?: string | null } | null;
          account_codes?: { code?: string } | null;
          production_categories?: { name?: string } | null;
          project_budget_lines?: { budget_code?: string } | null;
        }
      | null;
    const project = (row.receipt_projects as { name?: string; season?: string | null } | null) ?? purchase?.projects;
    const organization = (row.receipt_organizations as { name?: string; org_code?: string } | null) ?? purchase?.organizations;
    const accountCode = (row.receipt_accounts as { code?: string } | null) ?? purchase?.account_codes;
    const productionCategory = (row.receipt_categories as { name?: string } | null) ?? purchase?.production_categories;
    const budgetLine = purchase?.project_budget_lines;
    const claimRef = (purchase?.reference_number as string | null) ?? null;
    const expenseRef = (purchase?.expense_number as string | null) ?? null;
    const reqOrRef = (purchase?.requisition_number as string | null) ??
      (claimRef && expenseRef ? `${claimRef} / ${expenseRef}` : claimRef ?? expenseRef);
    const purchaseId = (row.purchase_id as string) ?? ((purchase?.id as string | undefined) ?? "");
    return {
      id: row.id as string,
      purchaseId,
      authorizationPurchaseId: (row.authorization_purchase_id as string | null) ?? null,
      amount: Number(row.amount_received ?? 0),
      note: (row.note as string | null) ?? null,
      receiptDate: (row.receipt_date as string | null) ?? String(row.created_at ?? "").slice(0, 10),
      projectId: (row.project_id as string | null) ?? null,
      organizationId: (row.organization_id as string | null) ?? null,
      productionCategoryId: (row.production_category_id as string | null) ?? null,
      accountCodeId: (row.account_code_id as string | null) ?? null,
      requestTitle: purchase?.title ?? "Request",
      requestNumber: reqOrRef,
      purchasePendingCcAmount: Number(purchase?.pending_cc_amount ?? 0),
      purchaseCreditCardId: (purchase?.credit_card_id as string | null) ?? null,
      purchaseStatus: (purchase?.status as string | undefined) ?? "",
      purchaseExpenseStage: (purchase?.expense_stage as string | null | undefined) ?? null,
      purchaseRequestType: (purchase?.request_type as string | undefined) ?? "",
      purchaseIsCreditCard: Boolean(purchase?.is_credit_card as boolean | null | undefined),
      statementMonthId: (row.cc_statement_month_id as string | null) ?? null,
      projectLabel: project
        ? `${project.name ?? "Unknown Project"}${project.season ? ` (${project.season})` : ""}`
        : `${organization?.org_code ?? "-"} | ${organization?.name ?? "Organization Budget"}`,
      budgetLineLabel: `${accountCode?.code ?? budgetLine?.budget_code ?? "-"} | ${productionCategory?.name ?? "-"}`
    };
  });

  const receiptTotalsByPurchaseId = new Map<string, { total: number; count: number }>();
  for (const receipt of pendingReceipts) {
    const summaryPurchaseId = receipt.authorizationPurchaseId ?? receipt.purchaseId;
    const current = receiptTotalsByPurchaseId.get(summaryPurchaseId) ?? { total: 0, count: 0 };
    receiptTotalsByPurchaseId.set(summaryPurchaseId, {
      total: current.total + receipt.amount,
      count: current.count + 1
    });
  }

  const statementMonthLabelById = new Map(
    statementMonths.map((month) => [month.id, `${month.statementMonth.slice(0, 7)} | ${month.creditCardName}`])
  );

  const pendingPurchaseDetails: PendingPurchaseDetailRow[] = (pendingPurchasesResponse.data ?? []).map((row) => {
    const project = row.projects as { name?: string; season?: string | null } | null;
    const organization = row.organizations as { name?: string; org_code?: string } | null;
    const accountCode = row.account_codes as { code?: string } | null;
    const productionCategory = row.production_categories as { name?: string } | null;
    const budgetLine = row.project_budget_lines as { budget_code?: string } | null;
    const card = row.credit_cards as { nickname?: string } | null;
    const purchaseId = row.id as string;
    const receiptSummary = receiptTotalsByPurchaseId.get(purchaseId) ?? { total: 0, count: 0 };
    const requestType = (row.request_type as string | null) ?? "";
    const isCreditCard = Boolean(row.is_credit_card as boolean | null);
    const statementMonthId =
      (row.cc_statement_month_id as string | null) ?? statementMonthIdByMatchedPurchaseId.get(purchaseId) ?? null;

    let assignmentState = "Ready to assign";
    if (!isCreditCard || requestType !== "expense") {
      assignmentState = "Excluded from receipt assignment flow";
    } else if (receiptSummary.count === 0) {
      assignmentState = "Missing receipts";
    } else if (statementMonthId) {
      assignmentState = "Already linked to statement month";
    } else if (!row.credit_card_id) {
      assignmentState = "Unassigned card";
    }

    return {
      id: purchaseId,
      fiscalYearId: row.fiscal_year_id as string,
      projectId: (row.project_id as string | null) ?? null,
      organizationId: (row.organization_id as string | null) ?? null,
      productionCategoryId: (row.production_category_id as string | null) ?? null,
      accountCodeId: (row.banner_account_code_id as string | null) ?? null,
      status: (row.status as string | null) ?? "requested",
      expenseStage: (row.expense_stage as string | null) ?? null,
      projectLabel: project
        ? `${project.name ?? "Unknown Project"}${project.season ? ` (${project.season})` : ""}`
        : `${organization?.org_code ?? "-"} | ${organization?.name ?? "Organization Budget"}`,
      budgetLineLabel: `${accountCode?.code ?? budgetLine?.budget_code ?? "-"} | ${productionCategory?.name ?? "-"}`,
      requestType: requestType || "-",
      isCreditCard,
      requestTitle: (row.title as string) ?? "Request",
      requestNumber: (row.requisition_number as string | null) ??
        ((row.reference_number as string | null) && (row.expense_number as string | null)
          ? `${row.reference_number as string} / ${row.expense_number as string}`
          : (row.reference_number as string | null) ?? (row.expense_number as string | null) ?? null),
      pendingCcAmount: Number(row.pending_cc_amount ?? 0),
      receiptTotal: receiptSummary.total,
      receiptCount: receiptSummary.count,
      creditCardId: (row.credit_card_id as string | null) ?? null,
      creditCardName: card?.nickname ?? null,
      ccWorkflowStatus: (row.cc_workflow_status as string | null) ?? null,
      statementMonthLabel: statementMonthId ? statementMonthLabelById.get(statementMonthId) ?? statementMonthId : null,
      assignmentState
    };
  });

  const selectedPendingProject = (resolvedSearchParams?.cc_pending_project ?? "").trim();
  const selectedPendingCard = (resolvedSearchParams?.cc_pending_card ?? "").trim();
  const selectedPendingQuery = (resolvedSearchParams?.cc_pending_q ?? "").trim().toLowerCase();
  const filteredPendingRows: PendingCcRow[] = rows
    .filter((row) => {
      if (selectedPendingProject && row.scopeId !== selectedPendingProject) return false;
      if (selectedPendingCard && (row.creditCardName ?? "") !== selectedPendingCard) return false;
      if (!selectedPendingQuery) return true;
      const hay = `${row.scopeLabel} ${row.budgetCode} ${row.creditCardName ?? "Unassigned"}`.toLowerCase();
      return hay.includes(selectedPendingQuery);
    })
    .sort((a, b) => b.pendingCcTotal - a.pendingCcTotal);

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Credit Cards</p>
        <h1>Statement Reconciliation</h1>
        <p className="heroSubtitle">Create monthly statements, assign receipts, then submit statement paid.</p>
      </header>

      <article className="panel">
        <form method="get" className="inlineFilters">
          <label>
            Fiscal Year
            <select name="fiscalYearId" defaultValue={selectedFiscalYearId}>
              {fiscalYearOptions.map((fiscalYear) => (
                <option key={fiscalYear.id} value={fiscalYear.id}>{fiscalYear.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="buttonLink">Apply</button>
        </form>
      </article>

      <CcPageClient
        cards={cards}
        statementMonths={statementMonths}
        pendingReceipts={pendingReceipts}
        statementLineDetails={statementLineDetails}
        pendingPurchaseDetails={pendingPurchaseDetails}
        filteredStatementMonths={filteredStatementMonths}
        filteredPendingRows={filteredPendingRows}
        selectedMonthCard={selectedMonthCard}
        selectedMonthState={selectedMonthState}
        selectedMonthQuery={selectedMonthQuery}
        selectedPendingProject={selectedPendingProject}
        selectedPendingCard={selectedPendingCard}
        selectedPendingQuery={selectedPendingQuery}
        scopedProjects={scopedProjects}
        hasGlobalAdmin={hasGlobalAdmin}
        fiscalYearOptions={fiscalYearOptions}
        selectedFiscalYearId={selectedFiscalYearId}
        selectedView={selectedView}
        requestedStatementId={requestedStatementId}
        organizationOptions={organizationOptions.filter((organization) => !organization.projectTrackingRequired)}
        accountCodeOptions={accountCodeOptions.filter((account) => !account.isRevenue)}
        productionCategoryOptions={productionCategoryOptions}
        fundingClaims={fundingClaims}
        expenseClaims={expenseClaims}
        expenseClaimPage={expenseClaimPage}
        expenseClaimTotal={expenseClaimsResponse.count ?? expenseClaims.length}
        expenseClaimPageSize={EXPENSE_CLAIM_PAGE_SIZE}
      />
    </section>
  );
}
