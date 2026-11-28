"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext, requireProjectRole } from "@/lib/access";
import type { PurchaseStatus } from "@/lib/types";
import { type ActionState, emptyState, ok, err, getErrorMessage, parseMoney } from "@/lib/action-helpers";
import { type ProcurementStatus, getProjectMeta, parseDateInput, ensureOrganizationPmOrAdminAccess, syncInstitutionalBudget, ensurePurchasePmOrAdminAccess, ensureProjectPmOrAdminAccess, parseStatus, getStatusAmount, toBudgetStatus, todayIsoDate } from "@/app/procurement/actions/_shared";

type ProcurementRequestType =
  | "requisition"
  | "expense"
  | "contract"
  | "request"
  | "budget_transfer"
  | "contract_payment";

const NEW_VENDOR_VALUE = "__new_vendor__";

function parseProcurementRequestType(value: FormDataEntryValue | null): ProcurementRequestType {
  const raw = String(value ?? "requisition").trim().toLowerCase();
  if (
    raw === "expense" ||
    raw === "contract" ||
    raw === "request" ||
    raw === "budget_transfer" ||
    raw === "contract_payment"
  ) {
    return raw;
  }
  return "requisition";
}

function computeInitialByRequestType(
  requestType: ProcurementRequestType,
  orderValue: number,
  isCreditCard: boolean
): {
  status: PurchaseStatus;
  requestedAmount: number;
  encumberedAmount: number;
  pendingCcAmount: number;
  postedAmount: number;
  procurementStatus: ProcurementStatus;
  ccWorkflowStatus: "requested" | "receipts_uploaded" | "statement_paid" | "posted_to_account" | null;
  postedDate: string | null;
} {
  if (requestType === "budget_transfer") {
    return {
      status: "posted",
      requestedAmount: 0,
      encumberedAmount: 0,
      pendingCcAmount: 0,
      postedAmount: orderValue,
      procurementStatus: "paid",
      ccWorkflowStatus: null,
      postedDate: new Date().toISOString().slice(0, 10)
    };
  }

  if (requestType === "expense" && isCreditCard) {
    return {
      status: "pending_cc",
      requestedAmount: 0,
      encumberedAmount: 0,
      pendingCcAmount: orderValue,
      postedAmount: 0,
      procurementStatus: "requested",
      ccWorkflowStatus: "requested",
      postedDate: null
    };
  }

  return {
    status: "requested",
    requestedAmount: orderValue,
    encumberedAmount: 0,
    pendingCcAmount: 0,
    postedAmount: 0,
    procurementStatus: "requested",
    ccWorkflowStatus: null,
    postedDate: null
  };
}

type ProcurementAllocationInput = {
  id: string | null;
  projectId: string | null;
  organizationId: string | null;
  productionCategoryId: string | null;
  accountCodeId: string;
  amount: number;
  note: string | null;
};

function parseProcurementAllocations(value: FormDataEntryValue | null): ProcurementAllocationInput[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const parsed = JSON.parse(value) as Array<Record<string, unknown>>;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((row) => ({
    id: String(row.id ?? "").trim() || null,
    projectId: String(row.projectId ?? "").trim() || null,
    organizationId: String(row.organizationId ?? "").trim() || null,
    productionCategoryId: String(row.productionCategoryId ?? "").trim() || null,
    accountCodeId: String(row.accountCodeId ?? "").trim(),
    amount: Math.round(Number(row.amount ?? 0) * 100) / 100,
    note: String(row.note ?? "").trim() || null
  }));
}

async function validateOrganizationFiscalYear(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  organizationId: string,
  fiscalYearId: string
): Promise<{ projectTrackingRequired: boolean }> {
  const { data: membership, error: membershipError } = await supabase
    .from("fiscal_year_organizations")
    .select("organization_id, project_tracking_required")
    .eq("fiscal_year_id", fiscalYearId)
    .eq("organization_id", organizationId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership) {
    throw new Error("The selected organization is not active in the selected fiscal year.");
  }
  return {
    projectTrackingRequired: (membership.project_tracking_required as boolean | null) ?? true
  };
}

async function ensureProjectCreateAccess(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  projectId: string
): Promise<void> {
  try {
    await requireProjectRole(projectId, ["admin", "project_manager"], {
      errorMessage: "You do not have permission to create purchases for this project."
    });
    return;
  } catch {
    // Keep the legacy External Procurement compatibility path below.
  }

  const projectMeta = await getProjectMeta(supabase, projectId);
  if (!projectMeta.isExternal) {
    throw new Error("You do not have permission to create purchases for this project.");
  }

  const access = await getAccessContext();
  const hasElevatedAccess =
    access.role === "admin" ||
    access.role === "project_manager" ||
    access.membershipRoles.has("admin") ||
    access.membershipRoles.has("project_manager") ||
    access.scopedRoles.has("admin") ||
    access.scopedRoles.has("project_manager");
  if (!hasElevatedAccess) {
    throw new Error("You do not have permission to create purchases for this project.");
  }
}

export async function createProcurementOrderAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const budgetLineId = String(formData.get("budgetLineId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const orderValueRaw = String(formData.get("orderValue") ?? "").trim();
    const orderValue = parseMoney(formData.get("orderValue"));
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const requisitionNumber = String(formData.get("requisitionNumber") ?? "").trim();
    const poNumber = String(formData.get("poNumber") ?? "").trim();
    const vendorIdRaw = String(formData.get("vendorId") ?? "").trim();
    const newVendorName = String(formData.get("newVendorName") ?? "").trim();
    const orderDate = parseDateInput(formData.get("orderDate"));
    const requestType = parseProcurementRequestType(formData.get("requestType"));
    const isCreditCard = requestType === "expense" ? formData.get("isCreditCard") === "on" : false;
    const expenseStageRaw = String(formData.get("expenseStage") ?? "").trim();
    const expenseStage = requestType === "expense" && isCreditCard
      ? expenseStageRaw === "employee_card" ? "employee_card" : "authorization"
      : null;

    if (!fiscalYearId) return err("Fiscal year is required.");
    if (!title) return err("Title is required.");
    if (orderValueRaw === "" || orderValue === 0) return err("Order value must be non-zero.");
    let budgetTracked = true;
    let explicitOrganizationId: string | null = null;
    let projectMeta: Awaited<ReturnType<typeof getProjectMeta>> | null = null;

    if (projectId) {
      await ensureProjectCreateAccess(supabase, user.id, projectId);
      projectMeta = await getProjectMeta(supabase, projectId);
      if (projectMeta.fiscalYearId !== fiscalYearId) return err("Project must belong to the selected fiscal year.");
      budgetTracked = !projectMeta.isExternal;
      explicitOrganizationId = projectMeta.isExternal ? organizationId || null : null;
      if (projectMeta.isExternal && !explicitOrganizationId) return err("Organization is required for External Procurement.");
      if (budgetTracked && !productionCategoryId) return err("Department is required.");
    } else {
      if (!organizationId) return err("Organization is required when no project is selected.");
      await ensureOrganizationPmOrAdminAccess(organizationId, fiscalYearId);
      const membership = await validateOrganizationFiscalYear(supabase, organizationId, fiscalYearId);
      if (membership.projectTrackingRequired) {
        return err("This organization requires a project for purchases.");
      }
      if (!bannerAccountCodeId) return err("Banner account code is required for a projectless purchase.");
      explicitOrganizationId = organizationId;
    }
    const computed = computeInitialByRequestType(requestType, orderValue, isCreditCard);

    let line: { id: string; project_id: string; account_code_id: string | null } | null = null;
    if (budgetTracked && projectId) {
      let resolvedBudgetLineId = budgetLineId;
      if (!resolvedBudgetLineId) {
        const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
          p_project_id: projectId,
          p_production_category_id: productionCategoryId
        });
        if (ensureLineError || !ensuredLineId) return err(ensureLineError?.message ?? "Could not resolve reporting line.");
        resolvedBudgetLineId = ensuredLineId as string;
      }
      const { data: lineData, error: lineError } = await supabase
        .from("project_budget_lines")
        .select("id, project_id, account_code_id")
        .eq("id", resolvedBudgetLineId)
        .single();
      if (lineError || !lineData) return err("Invalid budget line.");
      if ((lineData.project_id as string) !== projectId) return err("Budget line must belong to the selected project.");
      line = {
        id: lineData.id as string,
        project_id: lineData.project_id as string,
        account_code_id: (lineData.account_code_id as string | null) ?? null
      };
    }

    let resolvedVendorId: string | null = null;
    if (vendorIdRaw === "__new_vendor__") {
      if (!newVendorName) return err("New vendor name is required.");
      const { data: vendorRow, error: vendorError } = await supabase
        .from("vendors")
        .insert({ name: newVendorName })
        .select("id")
        .single();
      if (vendorError || !vendorRow) return err(vendorError?.message ?? "Could not create vendor.");
      resolvedVendorId = vendorRow.id as string;
    } else {
      resolvedVendorId = vendorIdRaw || null;
    }

    const { data: purchase, error: insertError } = await supabase
      .from("purchases")
      .insert({
        project_id: projectId || null,
        fiscal_year_id: fiscalYearId,
        organization_id: explicitOrganizationId,
        budget_line_id: line?.id ?? null,
        production_category_id: productionCategoryId || null,
        banner_account_code_id: bannerAccountCodeId || null,
        budget_tracked: budgetTracked,
        entered_by_user_id: user.id,
        title,
        reference_number: requestType === "budget_transfer" ? null : referenceNumber || null,
        requisition_number: requestType === "requisition" ? requisitionNumber || null : null,
        po_number: poNumber || null,
        vendor_id: resolvedVendorId,
        estimated_amount: orderValue,
        requested_amount: computed.requestedAmount,
        encumbered_amount: computed.encumberedAmount,
        pending_cc_amount: computed.pendingCcAmount,
        posted_amount: computed.postedAmount,
        request_type: requestType,
        is_credit_card: isCreditCard,
        expense_stage: expenseStage,
        cc_workflow_status: computed.ccWorkflowStatus,
        status: computed.status,
        procurement_status: computed.procurementStatus,
        ordered_on: orderDate,
        posted_date: computed.postedDate
      })
      .select("id, project_id")
      .single();

    if (insertError || !purchase) {
      return err(insertError?.message ?? "Unable to create procurement order.");
    }

    if (budgetTracked && line) {
      const { error: allocationError } = await supabase.from("purchase_allocations").insert({
        purchase_id: purchase.id,
        project_id: projectId,
        reporting_budget_line_id: line.id,
        organization_id: projectMeta?.organizationId ?? explicitOrganizationId,
        account_code_id: bannerAccountCodeId || line.account_code_id,
        production_category_id: productionCategoryId,
        amount: orderValue,
        reporting_bucket: "direct"
      });
      if (allocationError) return err(allocationError.message);
    }

    const { error: eventError } = await supabase.from("purchase_events").insert({
      purchase_id: purchase.id,
      from_status: null,
      to_status: computed.status,
      estimated_amount_snapshot: orderValue,
      requested_amount_snapshot: computed.requestedAmount,
      encumbered_amount_snapshot: computed.encumberedAmount,
      pending_cc_amount_snapshot: computed.pendingCcAmount,
      posted_amount_snapshot: computed.postedAmount,
      changed_by_user_id: user.id,
      note: "Procurement order created"
    });
    if (eventError) return err(eventError.message);

    const institutionalSyncError = await syncInstitutionalBudget(supabase, purchase.id as string, user.id);
    if (institutionalSyncError) return institutionalSyncError;

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    if (purchase.project_id) revalidatePath(`/projects/${purchase.project_id as string}`);
    return ok("Procurement order created.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not create procurement order."));
  }
}

type BatchProcurementLine = {
  title: string;
  requisitionNumber: string | null;
  referenceNumber: string | null;
  poNumber: string | null;
  amount: number;
  requestType: ProcurementRequestType;
};

function parseBatchLinesJson(value: FormDataEntryValue | null): BatchProcurementLine[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry): BatchProcurementLine => ({
        title: String((entry as { title?: unknown }).title ?? "").trim(),
        requisitionNumber: String((entry as { requisitionNumber?: unknown }).requisitionNumber ?? "").trim() || null,
        referenceNumber: String((entry as { referenceNumber?: unknown }).referenceNumber ?? "").trim() || null,
        poNumber: String((entry as { poNumber?: unknown }).poNumber ?? "").trim() || null,
        amount: Number.parseFloat(String((entry as { amount?: unknown }).amount ?? "0")),
        requestType: parseProcurementRequestType(String((entry as { requestType?: unknown }).requestType ?? "requisition"))
      }))
      .filter((line) => line.title && Number.isFinite(line.amount) && line.amount !== 0);
  } catch {
    return [];
  }
}

export async function createProcurementBatchAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const orderDate = parseDateInput(formData.get("orderDate"));
    const lines = parseBatchLinesJson(formData.get("linesJson"));

    if (!fiscalYearId) return err("Fiscal year is required.");
    if (lines.length === 0) return err("Add at least one valid line (title + non-zero amount).");

    let budgetTracked = true;
    let explicitOrganizationId: string | null = null;
    let projectMeta: Awaited<ReturnType<typeof getProjectMeta>> | null = null;
    if (projectId) {
      await ensureProjectCreateAccess(supabase, user.id, projectId);
      projectMeta = await getProjectMeta(supabase, projectId);
      if (projectMeta.fiscalYearId !== fiscalYearId) return err("Project must belong to the selected fiscal year.");
      budgetTracked = !projectMeta.isExternal;
      explicitOrganizationId = projectMeta.isExternal ? organizationId || null : null;
      if (projectMeta.isExternal && !explicitOrganizationId) return err("Organization is required for External Procurement.");
      if (budgetTracked && !productionCategoryId) return err("Department is required.");
    } else {
      if (!organizationId) return err("Organization is required when no project is selected.");
      await ensureOrganizationPmOrAdminAccess(organizationId, fiscalYearId);
      const membership = await validateOrganizationFiscalYear(supabase, organizationId, fiscalYearId);
      if (membership.projectTrackingRequired) {
        return err("This organization requires a project for purchases.");
      }
      if (!bannerAccountCodeId) return err("Banner account code is required for projectless batch purchases.");
      explicitOrganizationId = organizationId;
    }

    let line: { id: string; account_code_id: string | null } | null = null;
    if (budgetTracked && projectId) {
      const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
        p_project_id: projectId,
        p_production_category_id: productionCategoryId
      });
      if (ensureLineError || !ensuredLineId) return err(ensureLineError?.message ?? "Could not resolve reporting line.");

      const { data: lineData, error: lineError } = await supabase
        .from("project_budget_lines")
        .select("id, project_id, account_code_id")
        .eq("id", ensuredLineId as string)
        .single();
      if (lineError || !lineData) return err("Invalid budget line.");
      if ((lineData.project_id as string) !== projectId) return err("Budget line must belong to selected project.");
      line = {
        id: lineData.id as string,
        account_code_id: (lineData.account_code_id as string | null) ?? null
      };
    }

    // Prevalidate row-level details before writes.
    for (const entry of lines) {
      if (!entry.title) return err("Each line needs a title.");
      if (!Number.isFinite(entry.amount) || entry.amount === 0) return err("Each line amount must be non-zero.");
    }

    const createdPurchaseIds: string[] = [];
    for (const entry of lines) {
      const isCc = entry.requestType === "expense";
      const computed = computeInitialByRequestType(entry.requestType, entry.amount, isCc);
      const requisitionNumber = entry.requisitionNumber;
      const poNumber = entry.poNumber;

      const { data: purchase, error: insertError } = await supabase
        .from("purchases")
        .insert({
          project_id: projectId || null,
          fiscal_year_id: fiscalYearId,
          organization_id: explicitOrganizationId,
          budget_line_id: line?.id ?? null,
          production_category_id: productionCategoryId || null,
          banner_account_code_id: bannerAccountCodeId || null,
          budget_tracked: budgetTracked,
          entered_by_user_id: user.id,
          title: entry.title,
          reference_number: entry.requestType === "budget_transfer" ? null : entry.referenceNumber,
          requisition_number: entry.requestType === "requisition" ? requisitionNumber : null,
          po_number: poNumber,
          estimated_amount: entry.amount,
          requested_amount: computed.requestedAmount,
          encumbered_amount: computed.encumberedAmount,
          pending_cc_amount: computed.pendingCcAmount,
          posted_amount: computed.postedAmount,
          request_type: entry.requestType,
          is_credit_card: isCc,
          cc_workflow_status: computed.ccWorkflowStatus,
          status: computed.status,
          procurement_status: computed.procurementStatus,
          ordered_on: orderDate,
          posted_date: computed.postedDate
        })
        .select("id")
        .single();

      if (insertError || !purchase) {
        return err(insertError?.message ?? "Failed creating one of the batch rows.");
      }
      createdPurchaseIds.push(purchase.id as string);

      if (budgetTracked && line) {
        const { error: allocationError } = await supabase.from("purchase_allocations").insert({
          purchase_id: purchase.id,
          project_id: projectId,
          reporting_budget_line_id: line.id,
          organization_id: projectMeta?.organizationId ?? explicitOrganizationId,
          account_code_id: bannerAccountCodeId || line.account_code_id,
          production_category_id: productionCategoryId,
          amount: entry.amount,
          reporting_bucket: "direct"
        });
        if (allocationError) return err(allocationError.message);
      }

      const { error: eventError } = await supabase.from("purchase_events").insert({
        purchase_id: purchase.id,
        from_status: null,
        to_status: computed.status,
        estimated_amount_snapshot: entry.amount,
        requested_amount_snapshot: computed.requestedAmount,
        encumbered_amount_snapshot: computed.encumberedAmount,
        pending_cc_amount_snapshot: computed.pendingCcAmount,
        posted_amount_snapshot: computed.postedAmount,
        changed_by_user_id: user.id,
        note: "Batch created procurement entry"
      });
      if (eventError) return err(eventError.message);

      const institutionalSyncError = await syncInstitutionalBudget(supabase, purchase.id as string, user.id);
      if (institutionalSyncError) return institutionalSyncError;
    }

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return ok(`Batch added (${createdPurchaseIds.length} rows).`);
  } catch (error) {
    return err(getErrorMessage(error, "Could not create batch orders."));
  }
}

export async function updateProcurementAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");
    const id = String(formData.get("id") ?? "").trim();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const requestedBudgetTracked = formData.get("budgetTracked") === "on";
    const budgetLineId = String(formData.get("budgetLineId") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const expenseNumber = String(formData.get("expenseNumber") ?? "").trim().toUpperCase();
    const expenseStageRaw = String(formData.get("expenseStage") ?? "").trim();
    const requisitionNumber = String(formData.get("requisitionNumber") ?? "").trim();
    const poNumber = String(formData.get("poNumber") ?? "").trim();
    const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
    const vendorId = String(formData.get("vendorId") ?? "").trim();
    const newVendorName = String(formData.get("newVendorName") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const orderedOn = String(formData.get("orderedOn") ?? "").trim();
    const receivedOn = String(formData.get("receivedOn") ?? "").trim();
    const paidOn = String(formData.get("paidOn") ?? "").trim();
    const orderValueRaw = String(formData.get("orderValue") ?? "").trim();
    const orderValue = parseMoney(formData.get("orderValue"));

    if (!id) return err("Purchase id is required.");

    const { data: existing, error: existingError } = await supabase
      .from("purchases")
      .select(
        "id, fiscal_year_id, project_id, organization_id, status, procurement_status, request_type, is_credit_card, reference_number, expense_number, expense_stage, requisition_number, po_number, invoice_number, invoice_tracking_enabled, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, posted_date, budget_tracked, budget_line_id, ordered_on, received_on, paid_on"
      )
      .eq("id", id)
      .single();
    if (existingError || !existing) return err("Purchase not found.");
    await ensurePurchasePmOrAdminAccess(supabase, user.id, id);
    const isRequisitionPurchase = (existing.request_type as string | null) === "requisition";
    const requestedAllocations = isRequisitionPurchase
      ? parseProcurementAllocations(formData.get("allocationsJson"))
      : [];
    const nextProjectId = projectId;
    if (nextProjectId && nextProjectId !== ((existing.project_id as string | null) ?? "")) {
      await ensureProjectPmOrAdminAccess(supabase, user.id, nextProjectId);
    }
    let budgetTracked = true;
    let explicitOrganizationId: string | null = null;
    let nextFiscalYearId = (existing.fiscal_year_id as string | null) ?? null;
    if (nextProjectId) {
      const nextProjectMeta = await getProjectMeta(supabase, nextProjectId);
      nextFiscalYearId = nextProjectMeta.fiscalYearId;
      budgetTracked = nextProjectMeta.isExternal ? false : requestedBudgetTracked;
      explicitOrganizationId = nextProjectMeta.isExternal ? organizationId || null : null;
      if (nextProjectMeta.isExternal && !explicitOrganizationId) return err("Organization is required for External Procurement.");
    } else {
      explicitOrganizationId = organizationId || ((existing.organization_id as string | null) ?? null);
      if (!explicitOrganizationId) return err("Organization is required when no project is selected.");
      if (!nextFiscalYearId) return err("Fiscal year is required for a projectless purchase.");
      await ensureOrganizationPmOrAdminAccess(explicitOrganizationId, nextFiscalYearId);
      const membership = await validateOrganizationFiscalYear(supabase, explicitOrganizationId, nextFiscalYearId);
      if (membership.projectTrackingRequired) {
        return err("This organization requires a project.");
      }
      if (!bannerAccountCodeId) return err("Banner account code is required for a projectless purchase.");
    }

    const isCreditCardPurchase =
      (existing.request_type as string | null) === "expense" && Boolean(existing.is_credit_card as boolean | null);
    const isExpensePurchase = (existing.request_type as string | null) === "expense";
    if (isExpensePurchase && expenseNumber && !/^EX\d{6}$/.test(expenseNumber)) {
      return err("Expense number must use the EX###### format.");
    }
    const expenseStage = expenseStageRaw === "authorization" || expenseStageRaw === "employee_card" || expenseStageRaw === "actual" || expenseStageRaw === "reimbursement"
      ? expenseStageRaw
      : null;
    if (isExpensePurchase && !expenseStage) {
      return err("Choose whether this is a card funding request, Siena-issued employee-card purchase, reconciliation expense, or reimbursement.");
    }
    if (Boolean(existing.invoice_tracking_enabled as boolean | null) && !requestedBudgetTracked) {
      return err("This PO has invoice lines. Keep it budget-tracked so every line retains its allocation.");
    }
    let procurementStatus = parseStatus(formData.get("procurementStatus"), isCreditCardPurchase);
    if (isCreditCardPurchase && expenseStage === "employee_card" && (procurementStatus === "requested" || procurementStatus === "receipts_uploaded")) {
      const { count: receiptCount, error: receiptCountError } = await supabase
        .from("purchase_receipts")
        .select("id", { count: "exact", head: true })
        .eq("purchase_id", id);
      if (receiptCountError) return err(receiptCountError.message);
      procurementStatus = (receiptCount ?? 0) > 0 ? "receipts_uploaded" : "requested";
    }
    const existingProcurementStatus = parseStatus((existing.procurement_status as string | null) ?? "requested", isCreditCardPurchase);
    const procurementStatusChanged = existingProcurementStatus !== procurementStatus;
    const existingOrderValue = getStatusAmount(existing.status as string, {
      estimated: Number(existing.estimated_amount ?? 0),
      requested: Number(existing.requested_amount ?? 0),
      encumbered: Number(existing.encumbered_amount ?? 0),
      pendingCc: Number(existing.pending_cc_amount ?? 0),
      posted: Number(existing.posted_amount ?? 0)
    });
    const nextRequested = orderValueRaw !== "" ? orderValue : existingOrderValue;
    const invoiceTrackingEnabled = Boolean(existing.invoice_tracking_enabled as boolean | null);
    const existingTrackedEncumbered = Number(existing.encumbered_amount ?? 0);
    const existingTrackedPosted = Number(existing.posted_amount ?? 0);
    const mappedBudgetStatus = toBudgetStatus(procurementStatus, isCreditCardPurchase);
    const nextBudgetStatus = invoiceTrackingEnabled
      ? procurementStatus === "cancelled"
        ? "cancelled"
        : existingTrackedEncumbered > 0
          ? "encumbered"
          : existingTrackedPosted !== 0
            ? "posted"
            : "encumbered"
      : mappedBudgetStatus;
    const nextRequestedAmount = invoiceTrackingEnabled ? 0 : nextBudgetStatus === "requested" ? nextRequested : 0;
    const nextEncumberedAmount = invoiceTrackingEnabled
      ? procurementStatus === "cancelled" ? 0 : existingTrackedEncumbered
      : nextBudgetStatus === "encumbered" ? nextRequested : 0;
    const nextPendingCcAmount = invoiceTrackingEnabled ? 0 : nextBudgetStatus === "pending_cc" ? nextRequested : 0;
    const nextPostedAmount = invoiceTrackingEnabled
      ? procurementStatus === "cancelled" ? 0 : existingTrackedPosted
      : nextBudgetStatus === "posted" ? nextRequested : 0;
    const nextCcWorkflowStatus = isCreditCardPurchase
      ? procurementStatus === "posted_to_account"
        ? "posted_to_account"
        : procurementStatus === "statement_paid"
          ? "statement_paid"
          : procurementStatus === "receipts_uploaded"
            ? "receipts_uploaded"
            : "requested"
      : null;
    const existingOrderedOn = (existing.ordered_on as string | null) ?? null;
    const existingReceivedOn = (existing.received_on as string | null) ?? null;
    const existingPaidOn = (existing.paid_on as string | null) ?? null;
    const existingPostedDate = (existing.posted_date as string | null) ?? null;
    const autoDate = todayIsoDate();
    const nextOrderedOn =
      orderedOn || (procurementStatusChanged && procurementStatus === "ordered" && !existingOrderedOn ? autoDate : existingOrderedOn);
    const nextReceivedOn =
      receivedOn ||
      (procurementStatusChanged && procurementStatus === "fully_received" && !existingReceivedOn ? autoDate : existingReceivedOn);
    const nextPaidOn = paidOn || (procurementStatusChanged && procurementStatus === "paid" && !existingPaidOn ? autoDate : existingPaidOn);

    if (budgetTracked && nextProjectId && !productionCategoryId) return err("Department is required.");

    let verifiedBudgetLine: { id: string; account_code_id: string | null } | null = null;
    if (budgetTracked && nextProjectId) {
      let resolvedBudgetLineId = budgetLineId;
      if (!resolvedBudgetLineId) {
        const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
          p_project_id: nextProjectId,
          p_production_category_id: productionCategoryId
        });
        if (ensureLineError || !ensuredLineId) return err(ensureLineError?.message ?? "Could not resolve reporting line.");
        resolvedBudgetLineId = ensuredLineId as string;
      }
      const { data: line, error: lineError } = await supabase
        .from("project_budget_lines")
        .select("id, project_id, account_code_id")
        .eq("id", resolvedBudgetLineId)
        .single();
      if (lineError || !line) return err("Invalid budget line.");
      if ((line.project_id as string) !== nextProjectId) {
        return err("Budget line must belong to the selected project.");
      }
      verifiedBudgetLine = { id: line.id as string, account_code_id: (line.account_code_id as string | null) ?? null };
    }

    const resolvedAllocations: Array<{
      id: string | null;
      project_id: string | null;
      reporting_budget_line_id: string | null;
      organization_id: string;
      account_code_id: string;
      production_category_id: string | null;
      amount: number;
      note: string | null;
    }> = [];
    if (budgetTracked && isRequisitionPurchase) {
      if (requestedAllocations.length === 0) return err("Add at least one budget allocation for this PO.");
      const allocationTotal = Math.round(requestedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0) * 100) / 100;
      if (Math.abs(allocationTotal - nextRequested) > 0.005) {
        return err(`Allocations must total the PO value. Allocated $${allocationTotal.toFixed(2)} of $${nextRequested.toFixed(2)}.`);
      }
      for (const [index, allocation] of requestedAllocations.entries()) {
        if (!allocation.organizationId) return err(`Allocation ${index + 1} needs an organization.`);
        if (!allocation.accountCodeId) return err(`Allocation ${index + 1} needs a Banner account.`);
        if (!Number.isFinite(allocation.amount) || allocation.amount <= 0) return err(`Allocation ${index + 1} needs an amount greater than zero.`);
        const allocationOrganizationId = allocation.organizationId;
        if (!nextFiscalYearId) return err("Fiscal year is required for budget allocations.");
        const membership = await validateOrganizationFiscalYear(supabase, allocationOrganizationId, nextFiscalYearId);
        if (allocation.projectId) {
          if (!allocation.productionCategoryId) return err(`Allocation ${index + 1} needs a production category.`);
          await requireProjectRole(allocation.projectId, ["admin", "project_manager"], {
            productionCategoryId: allocation.productionCategoryId,
            errorMessage: `You do not have permission to use the project or category in allocation ${index + 1}.`
          });
          const allocationProject = await getProjectMeta(supabase, allocation.projectId);
          if (allocationProject.fiscalYearId !== nextFiscalYearId) return err(`Allocation ${index + 1} uses a project outside this PO's fiscal year.`);
          if (allocationProject.organizationId !== allocationOrganizationId) {
            await ensureOrganizationPmOrAdminAccess(allocationOrganizationId, nextFiscalYearId);
          }
          const { data: allocationLineId, error: allocationLineError } = await supabase.rpc("ensure_project_category_line", {
            p_project_id: allocation.projectId,
            p_production_category_id: allocation.productionCategoryId
          });
          if (allocationLineError || !allocationLineId) return err(allocationLineError?.message ?? `Could not resolve allocation ${index + 1}.`);
          resolvedAllocations.push({
            id: allocation.id,
            project_id: allocation.projectId,
            reporting_budget_line_id: allocationLineId as string,
            organization_id: allocationOrganizationId,
            account_code_id: allocation.accountCodeId,
            production_category_id: allocation.productionCategoryId,
            amount: allocation.amount,
            note: allocation.note
          });
        } else {
          await ensureOrganizationPmOrAdminAccess(allocationOrganizationId, nextFiscalYearId);
          if (membership.projectTrackingRequired) return err(`Allocation ${index + 1} must use a theatre project for that organization.`);
          resolvedAllocations.push({
            id: allocation.id,
            project_id: null,
            reporting_budget_line_id: null,
            organization_id: allocationOrganizationId,
            account_code_id: allocation.accountCodeId,
            production_category_id: null,
            amount: allocation.amount,
            note: allocation.note
          });
        }
      }
    }

    let resolvedVendorId: string | null = vendorId || null;
    if (vendorId === NEW_VENDOR_VALUE) {
      if (!newVendorName) return err("New vendor name is required.");
      const { data: vendorRow, error: vendorError } = await supabase
        .from("vendors")
        .upsert({ name: newVendorName }, { onConflict: "name" })
        .select("id")
        .single();
      if (vendorError || !vendorRow) return err(vendorError?.message ?? "Could not create vendor.");
      resolvedVendorId = vendorRow.id as string;
    }

    const { data: updated, error } = await supabase
      .from("purchases")
      .update({
        project_id: nextProjectId || null,
        fiscal_year_id: nextFiscalYearId,
        organization_id: explicitOrganizationId,
        budget_tracked: budgetTracked,
        budget_line_id: budgetTracked && nextProjectId ? verifiedBudgetLine?.id ?? (budgetLineId || null) : null,
        production_category_id: productionCategoryId || null,
        banner_account_code_id: bannerAccountCodeId || null,
        procurement_status: procurementStatus,
        status: nextBudgetStatus,
        reference_number: isExpensePurchase && expenseStage === "employee_card" ? null : referenceNumber || null,
        expense_number: isExpensePurchase
          ? expenseStage === "employee_card" ? null : expenseNumber || null
          : ((existing.expense_number as string | null) ?? null),
        expense_stage: isExpensePurchase
          ? expenseStage
          : ((existing.expense_stage as string | null) ?? null),
        requisition_number: isExpensePurchase
          ? ((existing.requisition_number as string | null) ?? null)
          : requisitionNumber || null,
        po_number: isExpensePurchase ? ((existing.po_number as string | null) ?? null) : poNumber || null,
        invoice_number: isExpensePurchase
          ? ((existing.invoice_number as string | null) ?? null)
          : invoiceNumber || null,
        vendor_id: resolvedVendorId,
        notes: notes || null,
        ordered_on: nextOrderedOn,
        received_on: nextReceivedOn,
        paid_on: nextPaidOn,
        estimated_amount: nextRequested,
        requested_amount: nextRequestedAmount,
        encumbered_amount: nextEncumberedAmount,
        pending_cc_amount: nextPendingCcAmount,
        posted_amount: nextPostedAmount,
        posted_date: nextBudgetStatus === "posted" ? existingPostedDate || todayIsoDate() : null,
        cc_workflow_status: nextCcWorkflowStatus
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return err(error.message);
    if (!updated?.id) return err("Procurement row update was not applied.");

    if (!budgetTracked) {
      const { error: deleteAllocationsError } = await supabase.from("purchase_allocations").delete().eq("purchase_id", id);
      if (deleteAllocationsError) return err(deleteAllocationsError.message);
    } else {
      if (resolvedAllocations.length > 0) {
        const { data: existingAllocationRows, error: existingAllocationsError } = await supabase
          .from("purchase_allocations")
          .select("id")
          .eq("purchase_id", id);
        if (existingAllocationsError) return err(existingAllocationsError.message);
        const existingAllocationIds = new Set((existingAllocationRows ?? []).map((row) => row.id as string));
        const retainedAllocationIds = new Set<string>();

        for (const allocation of resolvedAllocations) {
          const payload = {
            purchase_id: id,
            reporting_bucket: "direct",
            project_id: allocation.project_id,
            reporting_budget_line_id: allocation.reporting_budget_line_id,
            organization_id: allocation.organization_id,
            account_code_id: allocation.account_code_id,
            production_category_id: allocation.production_category_id,
            amount: allocation.amount,
            note: allocation.note
          };
          if (allocation.id && existingAllocationIds.has(allocation.id)) {
            const { error: updateAllocationError } = await supabase
              .from("purchase_allocations")
              .update(payload)
              .eq("id", allocation.id)
              .eq("purchase_id", id);
            if (updateAllocationError) return err(updateAllocationError.message);
            retainedAllocationIds.add(allocation.id);
          } else {
            const { data: insertedAllocation, error: insertAllocationError } = await supabase
              .from("purchase_allocations")
              .insert(payload)
              .select("id")
              .single();
            if (insertAllocationError || !insertedAllocation) return err(insertAllocationError?.message ?? "Could not add PO allocation.");
            retainedAllocationIds.add(insertedAllocation.id as string);
          }
        }

        const removedAllocationIds = [...existingAllocationIds].filter((allocationId) => !retainedAllocationIds.has(allocationId));
        if (removedAllocationIds.length > 0) {
          const { error: deleteAllocationsError } = await supabase
            .from("purchase_allocations")
            .delete()
            .in("id", removedAllocationIds)
            .eq("purchase_id", id);
          if (deleteAllocationsError) {
            return err("An allocation with invoice lines cannot be removed. Void or move those lines first.");
          }
        }
      } else if (verifiedBudgetLine) {
        const { error: deleteAllocationsError } = await supabase.from("purchase_allocations").delete().eq("purchase_id", id);
        if (deleteAllocationsError) return err(deleteAllocationsError.message);
        const allocationAmount =
          nextBudgetStatus === "encumbered"
            ? nextEncumberedAmount
            : nextBudgetStatus === "pending_cc"
              ? nextPendingCcAmount
              : nextBudgetStatus === "posted"
                ? nextPostedAmount
                : nextRequestedAmount;
        const { error: createAllocationError } = await supabase.from("purchase_allocations").insert({
          purchase_id: id,
          project_id: nextProjectId || null,
          reporting_budget_line_id: verifiedBudgetLine.id,
          organization_id: nextProjectId ? (await getProjectMeta(supabase, nextProjectId)).organizationId : explicitOrganizationId,
          account_code_id: bannerAccountCodeId || verifiedBudgetLine.account_code_id,
          production_category_id: productionCategoryId,
          amount: allocationAmount,
          reporting_bucket: "direct"
        });
        if (createAllocationError) return err(createAllocationError.message);
      }
    }

    const institutionalSyncError = await syncInstitutionalBudget(supabase, id, user.id);
    if (institutionalSyncError) return institutionalSyncError;

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    if (existing.project_id) revalidatePath(`/projects/${existing.project_id as string}`);
    if (nextProjectId) revalidatePath(`/projects/${nextProjectId}`);
    return ok("Procurement details updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update procurement details."));
  }
}
