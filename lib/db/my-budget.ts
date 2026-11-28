import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseStatus } from "@/lib/types";
import { getAccessContext } from "@/lib/access";
import { asNumber, type DashboardOpenRequisition } from "@/lib/db/shared";

export type MyBudgetEntry = {
  id: string;
  title: string;
  vendorName: string | null;
  poNumber: string | null;
  requisitionNumber: string | null;
  referenceNumber: string | null;
  receivingDocCodes: string[];
  procurementStatus: string;
  status: PurchaseStatus;
  requestType: "requisition" | "expense" | "contract" | "request" | "budget_transfer" | "contract_payment";
  amount: number;
  createdAt: string;
};

export type MyBudgetCard = {
  projectId: string;
  projectName: string;
  season: string | null;
  fiscalYearName: string | null;
  orgCode: string | null;
  organizationName: string | null;
  productionCategoryId: string | null;
  productionCategoryName: string;
  allocatedTotal: number;
  requestedOpenTotal: number;
  heldTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
  remainingTrue: number;
  remainingIfRequestedApproved: number;
  entries: MyBudgetEntry[];
};

function resolvedPurchaseAmount(row: {
  estimated_amount?: number | string | null;
  requested_amount?: number | string | null;
  encumbered_amount?: number | string | null;
  pending_cc_amount?: number | string | null;
  posted_amount?: number | string | null;
  status?: string | null;
}): number {
  const status = String(row.status ?? "").toLowerCase();
  const estimated = asNumber((row.estimated_amount as string | number | null) ?? 0);
  const requested = asNumber((row.requested_amount as string | number | null) ?? 0);
  const encumbered = asNumber((row.encumbered_amount as string | number | null) ?? 0);
  const pendingCc = asNumber((row.pending_cc_amount as string | number | null) ?? 0);
  const posted = asNumber((row.posted_amount as string | number | null) ?? 0);

  if (status === "cancelled") return 0;
  const financialActivity = encumbered + pendingCc + posted;
  if (financialActivity !== 0) return financialActivity;
  if (status === "requested") return requested !== 0 ? requested : estimated;
  return posted || pendingCc || encumbered || requested || estimated;
}

function hasBudgetActivity(values: Array<number | null | undefined>): boolean {
  return values.some((value) => Math.abs(value ?? 0) >= 0.005);
}

export async function getMyBudgetData(params: { fiscalYearId?: string } = {}): Promise<{
  role: "admin" | "project_manager" | "buyer" | "viewer" | "procurement_tracker" | "none";
  cards: MyBudgetCard[];
  openRequisitions: DashboardOpenRequisition[];
}> {
  const supabase = await getSupabaseServerClient();
  const access = await getAccessContext();
  const debugAccess = process.env.DEBUG_DASHBOARD_ACCESS === "true";

  if (!access.userId) {
    return { role: "none", cards: [], openRequisitions: [] };
  }

  const role = access.role;
  const scoped = role === "buyer" || role === "viewer";
  const scopeRows = scoped ? access.scopes.filter((row) => row.scopeRole === role) : [];
  const scopeCategoryNameById = new Map<string, string>();
  if (scoped) {
    const scopeCategoryIds = [...new Set(scopeRows.map((row) => row.productionCategoryId).filter((id): id is string => Boolean(id)))];
    if (scopeCategoryIds.length > 0) {
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("production_categories")
        .select("id, name")
        .in("id", scopeCategoryIds);
      if (categoriesError) throw categoriesError;
      for (const row of categoriesData ?? []) {
        scopeCategoryNameById.set(row.id as string, String(row.name ?? ""));
      }
    }
  }

  let projectsQuery = supabase
    .from("projects")
    .select("id, name, season, organization_id, fiscal_year_id, organizations(name, org_code), fiscal_years(name)")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (params.fiscalYearId) projectsQuery = projectsQuery.eq("fiscal_year_id", params.fiscalYearId);

  const [{ data: projectsData, error: projectsError }, { data: linesData, error: linesError }, { data: purchasesData, error: purchasesError }] =
    await Promise.all([
      projectsQuery,
      supabase
        .from("project_budget_lines")
        .select("id, project_id, production_category_id, category, allocated_amount, active, production_categories(name)")
        .eq("active", true),
      supabase
        .from("purchases")
        .select(
          "id, project_id, production_category_id, title, reference_number, expense_number, expense_stage, authorization_purchase_id, requisition_number, po_number, procurement_status, status, request_type, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, created_at, vendors(name), production_categories(name)"
        )
        .neq("procurement_status", "cancelled")
        .order("created_at", { ascending: false })
    ]);

  if (debugAccess) {
    console.info("[dashboard:getMyBudgetData] access + query counts", {
      userId: access.userId,
      email: access.email,
      role: access.role,
      membershipRoles: [...access.membershipRoles],
      scopedRoles: [...access.scopedRoles],
      scopesCount: access.scopes.length,
      queriedTables: ["projects", "project_budget_lines", "purchases"],
      projectsRows: (projectsData ?? []).length,
      budgetLinesRows: (linesData ?? []).length,
      purchasesRows: (purchasesData ?? []).length
    });
  }

  if (projectsError) throw projectsError;
  if (linesError) throw linesError;
  if (purchasesError) throw purchasesError;

  const purchaseIds = (purchasesData ?? []).map((row) => row.id as string);
  let receivingDocsData: Array<Record<string, unknown>> = [];
  if (purchaseIds.length > 0) {
    const { data, error } = await supabase
      .from("purchase_receiving_docs")
      .select("purchase_id, doc_code, created_at")
      .in("purchase_id", purchaseIds)
      .order("created_at", { ascending: true });
    if (error) throw error;
    receivingDocsData = (data ?? []) as Array<Record<string, unknown>>;
  }

  const receivingDocsByPurchaseId = new Map<string, string[]>();
  for (const row of receivingDocsData) {
    const purchaseId = String(row.purchase_id ?? "");
    const docCode = String(row.doc_code ?? "").trim();
    if (!purchaseId || !docCode) continue;
    const codes = receivingDocsByPurchaseId.get(purchaseId) ?? [];
    if (!codes.includes(docCode)) codes.push(docCode);
    receivingDocsByPurchaseId.set(purchaseId, codes);
  }

  const purchasesById = new Map((purchasesData ?? []).map((row) => [row.id as string, row] as const));
  const linkedActualAuthorizationIds = new Set(
    (purchasesData ?? [])
      .map((row) => (row.authorization_purchase_id as string | null) ?? null)
      .filter((id): id is string => Boolean(id))
  );
  const departmentEntryByKey = new Map<string, MyBudgetEntry>();

  const projectsById = new Map(
    (projectsData ?? []).map((row) => {
      const org = row.organizations as { name?: string; org_code?: string } | null;
      const fy = row.fiscal_years as { name?: string } | null;
      return [
        row.id as string,
        {
          id: row.id as string,
          name: (row.name as string) ?? "Project",
          season: (row.season as string | null) ?? null,
          organizationId: (row.organization_id as string | null) ?? null,
          fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
          organizationName: org?.name ?? null,
          orgCode: org?.org_code ?? null,
          fiscalYearName: fy?.name ?? null
        }
      ] as const;
    })
  );

  function isRowInScope(projectId: string, productionCategoryId: string | null, fallbackCategoryName: string | null = null): boolean {
    if (!scoped) return true;
    if (scopeRows.length === 0) return false;
    const project = projectsById.get(projectId);
    if (!project) return false;

    return scopeRows.some((scope) => {
      if (scope.projectId && scope.projectId !== projectId) return false;
      if (scope.organizationId && scope.organizationId !== project.organizationId) return false;
      // Treat null project FY as "not tagged" rather than auto-deny.
      if (scope.fiscalYearId && project.fiscalYearId && scope.fiscalYearId !== project.fiscalYearId) return false;
      if (scope.productionCategoryId) {
        if (productionCategoryId && scope.productionCategoryId === productionCategoryId) {
          // Exact category id match.
        } else {
          const scopedCategoryName = scopeCategoryNameById.get(scope.productionCategoryId)?.trim().toLowerCase();
          const fallback = (fallbackCategoryName ?? "").trim().toLowerCase();
          if (!scopedCategoryName || !fallback || scopedCategoryName !== fallback) return false;
        }
      }
      return true;
    });
  }

  const cards = new Map<string, MyBudgetCard>();

  for (const row of linesData ?? []) {
    const projectId = row.project_id as string;
    const project = projectsById.get(projectId);
    if (!project) continue;
    const productionCategoryId = (row.production_category_id as string | null) ?? null;
    const lineCategoryName = ((row.category as string | null) ?? null) || null;
    if (!isRowInScope(projectId, productionCategoryId, lineCategoryName)) continue;
    const productionCategory = row.production_categories as { name?: string } | null;
    const productionCategoryName = productionCategory?.name ?? lineCategoryName ?? "Unassigned";
    const key = `${projectId}:${productionCategoryId ?? `name:${productionCategoryName.toLowerCase()}`}`;
    const existing =
      cards.get(key) ??
      ({
        projectId,
        projectName: project.name,
        season: project.season,
        fiscalYearName: project.fiscalYearName,
        orgCode: project.orgCode,
        organizationName: project.organizationName,
        productionCategoryId,
        productionCategoryName,
        allocatedTotal: 0,
        requestedOpenTotal: 0,
        heldTotal: 0,
        encTotal: 0,
        pendingCcTotal: 0,
        ytdTotal: 0,
        obligatedTotal: 0,
        remainingTrue: 0,
        remainingIfRequestedApproved: 0,
        entries: []
      } satisfies MyBudgetCard);
    existing.allocatedTotal += asNumber(row.allocated_amount as string | number | null);
    cards.set(key, existing);
  }

  const openRequisitions: DashboardOpenRequisition[] = [];
  for (const row of purchasesData ?? []) {
    const projectId = row.project_id as string;
    const project = projectsById.get(projectId);
    if (!project) continue;
    const productionCategoryId = (row.production_category_id as string | null) ?? null;
    const productionCategory = row.production_categories as { name?: string } | null;
    const productionCategoryName = productionCategory?.name ?? "Unassigned";
    if (!isRowInScope(projectId, productionCategoryId, productionCategoryName)) continue;
    const key = `${projectId}:${productionCategoryId ?? `name:${productionCategoryName.toLowerCase()}`}`;
    const card =
      cards.get(key) ??
      ({
        projectId,
        projectName: project.name,
        season: project.season,
        fiscalYearName: project.fiscalYearName,
        orgCode: project.orgCode,
        organizationName: project.organizationName,
        productionCategoryId,
        productionCategoryName,
        allocatedTotal: 0,
        requestedOpenTotal: 0,
        heldTotal: 0,
        encTotal: 0,
        pendingCcTotal: 0,
        ytdTotal: 0,
        obligatedTotal: 0,
        remainingTrue: 0,
        remainingIfRequestedApproved: 0,
        entries: []
      } satisfies MyBudgetCard);

    const amount = resolvedPurchaseAmount(row);
    const status = ((row.status as string | null) ?? "requested").toLowerCase() as PurchaseStatus;
    const requestType = ((row.request_type as string | null) ?? "requisition").toLowerCase() as MyBudgetEntry["requestType"];

    if (requestType === "request") card.heldTotal += amount;
    else if (status !== "cancelled") {
      const postedAmount = asNumber(row.posted_amount as string | number | null);
      const pendingAmount = asNumber(row.pending_cc_amount as string | number | null);
      const encumberedAmount = asNumber(row.encumbered_amount as string | number | null);
      if (postedAmount !== 0 || pendingAmount !== 0 || encumberedAmount !== 0) {
        card.ytdTotal += postedAmount;
        card.pendingCcTotal += pendingAmount;
        card.encTotal += encumberedAmount;
      } else if (status === "requested") {
        card.requestedOpenTotal += amount;
      }
    }

    const authorizationId = (row.authorization_purchase_id as string | null) ?? null;
    const authorization = authorizationId ? purchasesById.get(authorizationId) ?? null : null;
    const isLinkedActual = Boolean(authorizationId && authorization);
    const isAuthorizationWithActuals = linkedActualAuthorizationIds.has(row.id as string);
    const displaySource = isLinkedActual ? authorization : row;
    const vendor = displaySource?.vendors as { name?: string } | null;
    const entry: MyBudgetEntry = {
      id: (displaySource?.id as string) ?? (row.id as string),
      title: (displaySource?.title as string) ?? (row.title as string) ?? "Untitled",
      vendorName: vendor?.name ?? null,
      poNumber: (displaySource?.po_number as string | null) ?? null,
      requisitionNumber: (displaySource?.requisition_number as string | null) ?? null,
      referenceNumber: (displaySource?.reference_number as string | null) ?? null,
      receivingDocCodes: receivingDocsByPurchaseId.get(row.id as string) ?? [],
      procurementStatus: ((row.procurement_status as string | null) ?? "requested").toLowerCase(),
      status,
      requestType,
      amount,
      createdAt: row.created_at as string
    };

    if (isLinkedActual || isAuthorizationWithActuals) {
      // Department users see one funding-request line per final receipt destination.
      // Monthly EC/EX records remain intact for reconciliation and accounting, but
      // do not appear as a second independently named charge in the running list.
      if (Math.abs(amount) >= 0.005) {
        const fundingRequestId = authorizationId ?? (row.id as string);
        const displayKey = `${key}:${fundingRequestId}`;
        const existingEntry = departmentEntryByKey.get(displayKey);
        if (existingEntry) {
          existingEntry.amount = Number((existingEntry.amount + amount).toFixed(2));
          if (entry.createdAt > existingEntry.createdAt) existingEntry.createdAt = entry.createdAt;
          existingEntry.status = entry.status;
          existingEntry.procurementStatus = entry.procurementStatus;
        } else {
          departmentEntryByKey.set(displayKey, entry);
          card.entries.push(entry);
        }
      }
    } else {
      card.entries.push(entry);
    }
    cards.set(key, card);

    if (
      requestType === "requisition" &&
      card.entries[card.entries.length - 1].procurementStatus !== "paid" &&
      card.entries[card.entries.length - 1].procurementStatus !== "cancelled"
    ) {
      openRequisitions.push({
        id: row.id as string,
        projectId,
        organizationId: project.organizationId,
        budgetType: "theatre",
        fiscalYearId: project.fiscalYearId,
        projectName: project.name,
        season: project.season,
        title: (row.title as string) ?? "Untitled",
        requisitionNumber: (row.requisition_number as string | null) ?? null,
        poNumber: (row.po_number as string | null) ?? null,
        receivingDocCodes: receivingDocsByPurchaseId.get(row.id as string) ?? [],
        vendorName: vendor?.name ?? null,
        procurementStatus: ((row.procurement_status as string | null) ?? "requested").toLowerCase(),
        orderValue: amount
      });
    }
  }

  const output = Array.from(cards.values())
    .map((card) => {
      card.obligatedTotal = card.heldTotal + card.encTotal + card.pendingCcTotal + card.ytdTotal;
      card.remainingTrue = card.allocatedTotal - card.obligatedTotal;
      card.remainingIfRequestedApproved = card.remainingTrue - card.requestedOpenTotal;
      card.entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return card;
    })
    .filter((card) =>
      hasBudgetActivity([
        card.allocatedTotal,
        card.requestedOpenTotal,
        card.heldTotal,
        card.encTotal,
        card.pendingCcTotal,
        card.ytdTotal
      ])
    )
    .sort((a, b) => {
      const projectSort = a.projectName.localeCompare(b.projectName);
      if (projectSort !== 0) return projectSort;
      return a.productionCategoryName.localeCompare(b.productionCategoryName);
    });

  openRequisitions.sort((a, b) => a.projectName.localeCompare(b.projectName) || a.title.localeCompare(b.title));

  return { role, cards: output, openRequisitions };
}
