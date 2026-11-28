"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext, requireProjectRole, type AccessContext } from "@/lib/access";
import { type ActionState, emptyState, ok, err, getErrorMessage, parseMoney, parseIdsJson } from "@/lib/action-helpers";
import { getPurchaseScope, ensureProjectPmOrAdminAccess, isExternalProcurementProjectName, getProjectMeta, type ProcurementStatus, parseStatus, getStatusAmount, toBudgetStatus, todayIsoDate, syncInstitutionalBudget } from "@/app/procurement/actions/_shared";

type ResolvedBudgetLine = { id: string; accountCodeId: string | null };

// Memoizes ensure_project_category_line + line verification per project/department pair for one request.
function createBudgetLineResolver(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const cache = new Map<string, Promise<{ line: ResolvedBudgetLine } | { error: string }>>();
  const resolve = async (
    projectId: string,
    productionCategoryId: string
  ): Promise<{ line: ResolvedBudgetLine } | { error: string }> => {
    const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
      p_project_id: projectId,
      p_production_category_id: productionCategoryId
    });
    if (ensureLineError || !ensuredLineId) return { error: ensureLineError?.message ?? "Could not resolve reporting line." };
    const { data: line, error: lineError } = await supabase
      .from("project_budget_lines")
      .select("id, project_id, account_code_id")
      .eq("id", ensuredLineId as string)
      .single();
    if (lineError || !line) return { error: "Invalid budget line." };
    if ((line.project_id as string) !== projectId) return { error: "Budget line must belong to selected project." };
    return { line: { id: line.id as string, accountCodeId: (line.account_code_id as string | null) ?? null } };
  };
  return (projectId: string, productionCategoryId: string) => {
    const key = `${projectId}:${productionCategoryId}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = resolve(projectId, productionCategoryId);
      cache.set(key, pending);
    }
    return pending;
  };
}

async function ensureProjectAdminAccess(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  projectId: string,
  access?: AccessContext
): Promise<void> {
  void supabase;
  void userId;
  await requireProjectRole(projectId, ["admin"], {
    errorMessage: "Only Admin can delete procurement rows.",
    access
  });
}

async function ensurePurchaseAdminAccess(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  purchaseId: string
): Promise<void> {
  const scope = await getPurchaseScope(supabase, purchaseId);
  if (scope.projectId) return ensureProjectAdminAccess(supabase, userId, scope.projectId);
  const access = await getAccessContext();
  if (scope.organizationId && access.role === "admin") return;
  throw new Error("Only Admin can delete procurement rows.");
}

export async function deleteProcurementAction(
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
    if (!id) return err("Purchase id is required.");

    const { data: row, error: rowError } = await supabase.from("purchases").select("id, project_id").eq("id", id).single();
    if (rowError || !row) return err("Purchase not found.");
    await ensurePurchaseAdminAccess(supabase, user.id, id);

    const { error } = await supabase.from("purchases").delete().eq("id", id);
    if (error) return err(error.message);

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    if (row.project_id) revalidatePath(`/projects/${row.project_id as string}`);
    return ok("Procurement row deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete procurement row."));
  }
}

export async function bulkDeleteProcurementAction(
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

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) return err("Select at least one procurement row.");

    const { data: rows, error: rowsError } = await supabase
      .from("purchases")
      .select("id, project_id, organization_id")
      .in("id", ids);
    if (rowsError) return err(rowsError.message);
    if (!rows || rows.length !== ids.length) return err("Some selected rows were not found.");

    const access = await getAccessContext();
    const projectIds = Array.from(
      new Set(rows.map((row) => row.project_id as string | null).filter((projectId): projectId is string => Boolean(projectId)))
    );
    for (const projectId of projectIds) {
      await ensureProjectAdminAccess(supabase, user.id, projectId, access);
    }
    // Projectless organization purchases follow the same rule as the single-row delete: global admin only.
    const hasProjectlessRows = rows.some((row) => !row.project_id);
    if (hasProjectlessRows) {
      const allHaveOrganization = rows.every((row) => row.project_id || row.organization_id);
      if (!allHaveOrganization || access.role !== "admin") throw new Error("Only Admin can delete procurement rows.");
    }

    const { error: deleteError } = await supabase.from("purchases").delete().in("id", ids);
    if (deleteError) return err(deleteError.message);

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    for (const projectId of projectIds) {
      revalidatePath(`/projects/${projectId}`);
    }
    return ok("Selected procurement rows deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete selected procurement rows."));
  }
}

export async function bulkUpdateProcurementAction(
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

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) return err("Select at least one procurement row.");

    const applyProject = formData.get("applyProject") === "on";
    const applyOrganization = formData.get("applyOrganization") === "on";
    const applyCategory = formData.get("applyProductionCategory") === "on";
    const applyBanner = formData.get("applyBannerAccountCode") === "on";
    const applyProcurementStatus = formData.get("applyProcurementStatus") === "on";
    const applyVendor = formData.get("applyVendor") === "on";
    const applyReference = formData.get("applyReferenceNumber") === "on";
    const applyRequisition = formData.get("applyRequisitionNumber") === "on";
    const applyPo = formData.get("applyPoNumber") === "on";
    const applyInvoice = formData.get("applyInvoiceNumber") === "on";
    const applyNotes = formData.get("applyNotes") === "on";
    const applyOrderedOn = formData.get("applyOrderedOn") === "on";
    const applyReceivedOn = formData.get("applyReceivedOn") === "on";
    const applyPaidOn = formData.get("applyPaidOn") === "on";
    const applyOrderValue = formData.get("applyOrderValue") === "on";

    if (
      !applyProject &&
      !applyOrganization &&
      !applyCategory &&
      !applyBanner &&
      !applyProcurementStatus &&
      !applyVendor &&
      !applyReference &&
      !applyRequisition &&
      !applyPo &&
      !applyInvoice &&
      !applyNotes &&
      !applyOrderedOn &&
      !applyReceivedOn &&
      !applyPaidOn &&
      !applyOrderValue
    ) {
      return err("Choose at least one field to apply.");
    }

    const targetProjectId = String(formData.get("projectId") ?? "").trim();
    const targetOrganizationId = String(formData.get("organizationId") ?? "").trim();
    const targetProductionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const targetBannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const targetProcurementStatusRaw = String(formData.get("procurementStatus") ?? "").trim();
    const targetVendorId = String(formData.get("vendorId") ?? "").trim();
    const targetReferenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const targetRequisitionNumber = String(formData.get("requisitionNumber") ?? "").trim();
    const targetPoNumber = String(formData.get("poNumber") ?? "").trim();
    const targetInvoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
    const targetNotes = String(formData.get("notes") ?? "").trim();
    const targetOrderedOn = String(formData.get("orderedOn") ?? "").trim();
    const targetReceivedOn = String(formData.get("receivedOn") ?? "").trim();
    const targetPaidOn = String(formData.get("paidOn") ?? "").trim();
    const targetOrderValue = parseMoney(formData.get("orderValue"));
    const targetOrderValueRaw = String(formData.get("orderValue") ?? "").trim();

    const { data: rows, error: rowsError } = await supabase
      .from("purchases")
      .select(
        "id, project_id, organization_id, budget_tracked, budget_line_id, production_category_id, banner_account_code_id, status, procurement_status, request_type, is_credit_card, invoice_tracking_enabled, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, posted_date, reference_number, requisition_number, po_number, invoice_number, vendor_id, notes, ordered_on, received_on, paid_on"
      )
      .in("id", ids);
    if (rowsError) return err(rowsError.message);
    if (!rows || rows.length !== ids.length) return err("Some selected procurement rows were not found.");
    if (rows.some((row) => Boolean(row.invoice_tracking_enabled as boolean | null))) {
      return err("POs with invoice or credit lines must be edited individually so their allocation history is preserved.");
    }

    const access = await getAccessContext();
    const existingProjectIds = Array.from(new Set(rows.map((row) => row.project_id as string)));
    for (const projectId of existingProjectIds) {
      await ensureProjectPmOrAdminAccess(supabase, user.id, projectId, access);
    }
    if (applyProject) {
      if (!targetProjectId) return err("Project is required when applying project.");
      await ensureProjectPmOrAdminAccess(supabase, user.id, targetProjectId, access);
    }

    const projectIdsForMeta = new Set(existingProjectIds);
    if (applyProject && targetProjectId) projectIdsForMeta.add(targetProjectId);
    const { data: projectMetas, error: projectMetasError } = await supabase
      .from("projects")
      .select("id, name")
      .in("id", Array.from(projectIdsForMeta));
    if (projectMetasError) return err(projectMetasError.message);
    const externalByProjectId = new Map<string, boolean>(
      ((projectMetas as Array<{ id?: unknown; name?: unknown }> | null) ?? []).map((row) => [
        row.id as string,
        isExternalProcurementProjectName(row.name as string)
      ])
    );

    // Rows commonly share a project/department, so resolve each reporting line and project once per request.
    const resolveBudgetLine = createBudgetLineResolver(supabase);
    const projectMetaCache = new Map<string, ReturnType<typeof getProjectMeta>>();
    const getProjectMetaOnce = (projectId: string) => {
      let meta = projectMetaCache.get(projectId);
      if (!meta) {
        meta = getProjectMeta(supabase, projectId);
        projectMetaCache.set(projectId, meta);
      }
      return meta;
    };

    type BulkRowPlan = {
      existing: (typeof rows)[number];
      nextProjectId: string;
      nextOrganizationId: string;
      nextProductionCategoryId: string;
      nextProjectIsExternal: boolean;
      budgetTracked: boolean;
      isCreditCardPurchase: boolean;
      nextProcurementStatus: ProcurementStatus;
      procurementStatusChanged: boolean;
      verifiedBudgetLine: ResolvedBudgetLine | null;
    };

    // Validate every row and resolve its budget line before mutating any of them.
    const plans: BulkRowPlan[] = [];
    for (const existing of rows) {
      const nextProjectId = applyProject ? targetProjectId : (existing.project_id as string);
      const nextOrganizationId = applyOrganization
        ? targetOrganizationId
        : ((existing.organization_id as string | null) ?? "");
      const nextProductionCategoryId = applyCategory
        ? targetProductionCategoryId
        : ((existing.production_category_id as string | null) ?? "");
      if (!nextProjectId) return err("Project is required when applying project.");
      const nextProjectIsExternal = externalByProjectId.get(nextProjectId) ?? false;
      const budgetTracked = nextProjectIsExternal ? false : Boolean(existing.budget_tracked);
      if (nextProjectIsExternal && !nextOrganizationId) return err("Organization is required for External Procurement.");
      if (budgetTracked && !nextProductionCategoryId) return err("Department is required.");

      const isCreditCardPurchase =
        (existing.request_type as string | null) === "expense" && Boolean(existing.is_credit_card as boolean | null);
      const nextProcurementStatus = applyProcurementStatus
        ? parseStatus(targetProcurementStatusRaw, isCreditCardPurchase)
        : parseStatus(existing.procurement_status as string, isCreditCardPurchase);
      const existingProcurementStatus = parseStatus(
        (existing.procurement_status as string | null) ?? "requested",
        isCreditCardPurchase
      );

      if (applyOrderValue && (targetOrderValueRaw === "" || targetOrderValue === 0)) {
        return err("Order Value must be non-zero when applying order value.");
      }

      let verifiedBudgetLine: ResolvedBudgetLine | null = null;
      if (budgetTracked) {
        const resolved = await resolveBudgetLine(nextProjectId, nextProductionCategoryId);
        if ("error" in resolved) return err(resolved.error);
        verifiedBudgetLine = resolved.line;
      }

      plans.push({
        existing,
        nextProjectId,
        nextOrganizationId,
        nextProductionCategoryId,
        nextProjectIsExternal,
        budgetTracked,
        isCreditCardPurchase,
        nextProcurementStatus,
        procurementStatusChanged: applyProcurementStatus && existingProcurementStatus !== nextProcurementStatus,
        verifiedBudgetLine
      });
    }

    const bulkRows: Array<Record<string, unknown>> = [];
    for (const plan of plans) {
      const {
        existing,
        nextProjectId,
        nextOrganizationId,
        nextProductionCategoryId,
        nextProjectIsExternal,
        budgetTracked,
        isCreditCardPurchase,
        nextProcurementStatus,
        procurementStatusChanged,
        verifiedBudgetLine
      } = plan;
      const rowId = existing.id as string;

      const currentValue = getStatusAmount(existing.status as string, {
        estimated: Number(existing.estimated_amount ?? 0),
        requested: Number(existing.requested_amount ?? 0),
        encumbered: Number(existing.encumbered_amount ?? 0),
        pendingCc: Number(existing.pending_cc_amount ?? 0),
        posted: Number(existing.posted_amount ?? 0)
      });
      const nextValue = applyOrderValue ? targetOrderValue : currentValue;

      const nextBudgetStatus = toBudgetStatus(nextProcurementStatus, isCreditCardPurchase);
      const nextRequestedAmount = nextBudgetStatus === "requested" ? nextValue : 0;
      const nextEncumberedAmount = nextBudgetStatus === "encumbered" ? nextValue : 0;
      const nextPendingCcAmount = nextBudgetStatus === "pending_cc" ? nextValue : 0;
      const nextPostedAmount = nextBudgetStatus === "posted" ? nextValue : 0;
      const nextCcWorkflowStatus = isCreditCardPurchase
        ? nextProcurementStatus === "posted_to_account"
          ? "posted_to_account"
          : nextProcurementStatus === "statement_paid"
            ? "statement_paid"
            : nextProcurementStatus === "receipts_uploaded"
              ? "receipts_uploaded"
              : "requested"
        : null;

      const nextBannerAccountCodeId = applyBanner
        ? targetBannerAccountCodeId || null
        : ((existing.banner_account_code_id as string | null) ?? null);
      const existingOrderedOn = (existing.ordered_on as string | null) ?? null;
      const existingReceivedOn = (existing.received_on as string | null) ?? null;
      const existingPaidOn = (existing.paid_on as string | null) ?? null;
      const existingPostedDate = (existing.posted_date as string | null) ?? null;
      const autoDate = todayIsoDate();
      const nextOrderedOn = applyOrderedOn
        ? targetOrderedOn || null
        : procurementStatusChanged && nextProcurementStatus === "ordered" && !existingOrderedOn
          ? autoDate
          : existingOrderedOn;
      const nextReceivedOn = applyReceivedOn
        ? targetReceivedOn || null
        : procurementStatusChanged && nextProcurementStatus === "fully_received" && !existingReceivedOn
          ? autoDate
          : existingReceivedOn;
      const nextPaidOn = applyPaidOn
        ? targetPaidOn || null
        : procurementStatusChanged && nextProcurementStatus === "paid" && !existingPaidOn
          ? autoDate
          : existingPaidOn;

      let allocation: Record<string, unknown> | null = null;
      if (budgetTracked && verifiedBudgetLine) {
        const allocationAmount =
          nextBudgetStatus === "encumbered"
            ? nextEncumberedAmount
            : nextBudgetStatus === "pending_cc"
              ? nextPendingCcAmount
              : nextBudgetStatus === "posted"
                ? nextPostedAmount
                : nextRequestedAmount;
        allocation = {
          project_id: nextProjectId || null,
          reporting_budget_line_id: verifiedBudgetLine.id,
          organization_id: nextProjectId ? (await getProjectMetaOnce(nextProjectId)).organizationId : nextOrganizationId || null,
          account_code_id: nextBannerAccountCodeId || verifiedBudgetLine.accountCodeId,
          production_category_id: nextProductionCategoryId,
          amount: allocationAmount,
          reporting_bucket: "direct"
        };
      }

      bulkRows.push({
        purchase_id: rowId,
        purchase: {
          project_id: nextProjectId,
          organization_id: nextProjectIsExternal ? nextOrganizationId || null : null,
          budget_tracked: budgetTracked,
          budget_line_id: budgetTracked ? verifiedBudgetLine?.id ?? null : null,
          production_category_id: nextProductionCategoryId || null,
          banner_account_code_id: nextBannerAccountCodeId,
          procurement_status: nextProcurementStatus,
          status: nextBudgetStatus,
          reference_number: applyReference ? targetReferenceNumber || null : ((existing.reference_number as string | null) ?? null),
          requisition_number: applyRequisition ? targetRequisitionNumber || null : ((existing.requisition_number as string | null) ?? null),
          po_number: applyPo ? targetPoNumber || null : ((existing.po_number as string | null) ?? null),
          invoice_number: applyInvoice ? targetInvoiceNumber || null : ((existing.invoice_number as string | null) ?? null),
          vendor_id: applyVendor ? targetVendorId || null : ((existing.vendor_id as string | null) ?? null),
          notes: applyNotes ? targetNotes || null : ((existing.notes as string | null) ?? null),
          ordered_on: nextOrderedOn,
          received_on: nextReceivedOn,
          paid_on: nextPaidOn,
          estimated_amount: nextValue,
          requested_amount: nextRequestedAmount,
          encumbered_amount: nextEncumberedAmount,
          pending_cc_amount: nextPendingCcAmount,
          posted_amount: nextPostedAmount,
          posted_date: nextBudgetStatus === "posted" ? existingPostedDate || todayIsoDate() : null,
          cc_workflow_status: nextCcWorkflowStatus
        },
        allocation
      });
    }

    // One transaction for every purchase update and allocation replacement in the batch.
    const { error: bulkApplyError } = await supabase.rpc("apply_procurement_bulk_update", { p_rows: bulkRows });
    if (bulkApplyError) return err(bulkApplyError.message);

    for (const plan of plans) {
      const institutionalSyncError = await syncInstitutionalBudget(supabase, plan.existing.id as string, user.id);
      if (institutionalSyncError) return institutionalSyncError;
    }

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    for (const projectId of existingProjectIds) {
      revalidatePath(`/projects/${projectId}`);
    }
    return ok("Bulk procurement update saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not bulk update procurement rows."));
  }
}

export async function createVendorAction(prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");

    const access = await getAccessContext();
    if (access.role !== "admin" && access.role !== "project_manager") {
      return err("Only Admin or Project Manager can add vendors.");
    }

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return err("Vendor name is required.");

    const { error } = await supabase.from("vendors").upsert({ name }, { onConflict: "name" });
    if (error) return err(error.message);

    revalidatePath("/procurement");
    revalidatePath("/requests");
    return ok("Vendor saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not save vendor."));
  }
}
