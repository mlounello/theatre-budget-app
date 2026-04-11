"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext, requireProjectRole } from "@/lib/access";
import type { PurchaseStatus } from "@/lib/types";

const RECEIPT_STORAGE_BUCKET = "purchase-receipts";
const STORAGE_REFERENCE_PREFIX = "storage:";

type ActionState = {
  ok: boolean;
  message: string;
  timestamp: number;
};

const emptyState: ActionState = { ok: true, message: "", timestamp: 0 };

function ok(message: string): ActionState {
  return { ok: true, message, timestamp: Date.now() };
}

function err(message: string): ActionState {
  return { ok: false, message, timestamp: Date.now() };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseIdsJson(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

type AllocationInput = {
  reportingBudgetLineId: string;
  accountCodeId: string;
  amount: number;
  reportingBucket: "direct" | "miscellaneous";
};

type RequestType = "requisition" | "expense" | "contract" | "request" | "budget_transfer";
const MAX_RECEIPT_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif"
]);

function toStorageReference(bucket: string, path: string): string {
  return `${STORAGE_REFERENCE_PREFIX}${bucket}/${path}`;
}

function parseRequestType(value: FormDataEntryValue | null): RequestType {
  const raw = String(value ?? "requisition").trim().toLowerCase();
  if (raw === "expense" || raw === "contract" || raw === "request" || raw === "budget_transfer") return raw;
  return "requisition";
}

function computeRequestAmounts(
  requestType: RequestType,
  estimatedAmount: number,
  requestedAmountInput: number,
  isCreditCard: boolean
): {
  status: PurchaseStatus;
  requestedAmount: number;
  encumberedAmount: number;
  pendingCcAmount: number;
  postedAmount: number;
  ccWorkflowStatus: "requested" | "posted_to_account" | null;
} {
  const baseAmount = requestedAmountInput !== 0 ? requestedAmountInput : estimatedAmount;

  if (requestType === "budget_transfer") {
    return {
      status: "posted",
      requestedAmount: 0,
      encumberedAmount: 0,
      pendingCcAmount: 0,
      postedAmount: baseAmount,
      ccWorkflowStatus: null
    };
  }

  if (requestType === "expense" && isCreditCard) {
    return {
      status: "pending_cc",
      requestedAmount: 0,
      encumberedAmount: 0,
      pendingCcAmount: baseAmount,
      postedAmount: 0,
      ccWorkflowStatus: "requested"
    };
  }

  return {
    status: "requested",
    requestedAmount: baseAmount,
    encumberedAmount: 0,
    pendingCcAmount: 0,
    postedAmount: 0,
    ccWorkflowStatus: null
  };
}

async function requirePmOrAdmin(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  projectId: string,
  userId: string
): Promise<void> {
  void supabase;
  void userId;
  await requireProjectRole(projectId, ["admin", "project_manager"], {
    errorMessage: "Only Admin or Project Manager can reconcile to Pending CC."
  });
}

async function getPurchaseProjectId(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  purchaseId: string
): Promise<string> {
  const { data, error } = await supabase.from("purchases").select("id, project_id").eq("id", purchaseId).single();
  if (error || !data) throw new Error("Purchase not found.");
  return data.project_id as string;
}

async function getPurchaseIdForReceipt(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  receiptId: string
): Promise<string> {
  const { data, error } = await supabase.from("purchase_receipts").select("id, purchase_id").eq("id", receiptId).single();
  if (error || !data) throw new Error("Receipt not found.");
  return data.purchase_id as string;
}

export async function createRequest(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return err("You must be signed in.");
    }

    const projectId = String(formData.get("projectId") ?? "").trim();
    const budgetLineId = String(formData.get("budgetLineId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const requisitionNumber = String(formData.get("requisitionNumber") ?? "").trim();
    const estimatedAmount = parseMoney(formData.get("estimatedAmount"));
    const requestedAmount = parseMoney(formData.get("requestedAmount"));
    const requestType = parseRequestType(formData.get("requestType"));
    const isCreditCard = requestType === "expense" ? formData.get("isCreditCard") === "on" : false;
    const allocationsJson = String(formData.get("allocationsJson") ?? "").trim();

    if (!projectId || !productionCategoryId || !title) {
      return err("Project, production category, and title are required.");
    }

    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select("id, planning_requests_enabled")
      .eq("id", projectId)
      .single();
    if (projectError || !projectRow) {
      return err("Project not found.");
    }
    if (!Boolean(projectRow.planning_requests_enabled as boolean | null)) {
      return err("Planning Requests are disabled for this project.");
    }

    let resolvedBudgetLineId = budgetLineId;
    if (!resolvedBudgetLineId) {
      const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
        p_project_id: projectId,
        p_production_category_id: productionCategoryId
      });
      if (ensureLineError || !ensuredLineId) {
        return err(ensureLineError?.message ?? "Unable to resolve reporting line for category.");
      }
      resolvedBudgetLineId = ensuredLineId as string;
    }

    const { data: budgetLine, error: budgetLineError } = await supabase
      .from("project_budget_lines")
      .select("id, project_id")
      .eq("id", resolvedBudgetLineId)
      .single();

    if (budgetLineError || !budgetLine) {
      return err("Invalid budget line selected.");
    }

    let allocations: AllocationInput[] = [];
    if (allocationsJson) {
      try {
        const parsed = JSON.parse(allocationsJson);
        if (Array.isArray(parsed)) {
          allocations = parsed
            .map((entry) => ({
              reportingBudgetLineId: String((entry as { reportingBudgetLineId?: unknown }).reportingBudgetLineId ?? ""),
              accountCodeId: String((entry as { accountCodeId?: unknown }).accountCodeId ?? ""),
              amount: Number.parseFloat(String((entry as { amount?: unknown }).amount ?? "0")),
              reportingBucket:
                String((entry as { reportingBucket?: unknown }).reportingBucket ?? "") === "miscellaneous"
                  ? ("miscellaneous" as const)
                  : ("direct" as const)
            }))
            .filter((entry) => entry.reportingBudgetLineId && entry.accountCodeId && Number.isFinite(entry.amount) && entry.amount > 0);
        }
      } catch {
        return err("Invalid split allocation payload.");
      }
    }

    if (allocations.length > 0) {
      await requirePmOrAdmin(supabase, budgetLine.project_id as string, user.id);
    }

    const requestedTotal = allocations.length > 0 ? allocations.reduce((sum, allocation) => sum + allocation.amount, 0) : requestedAmount;
    const computed = computeRequestAmounts(requestType, estimatedAmount, requestedTotal, isCreditCard);

    const { data: inserted, error } = await supabase
      .from("purchases")
      .insert({
        project_id: budgetLine.project_id,
        budget_line_id: budgetLine.id,
        production_category_id: productionCategoryId,
        banner_account_code_id: bannerAccountCodeId || null,
        entered_by_user_id: user.id,
        title,
        reference_number: requestType === "requisition" || requestType === "budget_transfer" ? null : referenceNumber || null,
        requisition_number: requestType === "requisition" ? requisitionNumber || null : null,
        estimated_amount: estimatedAmount,
        requested_amount: computed.requestedAmount,
        encumbered_amount: computed.encumberedAmount,
        pending_cc_amount: computed.pendingCcAmount,
        posted_amount: computed.postedAmount,
        request_type: requestType,
        is_credit_card: isCreditCard,
        cc_workflow_status: computed.ccWorkflowStatus,
        status: computed.status,
        posted_date: computed.status === "posted" ? new Date().toISOString().slice(0, 10) : null
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return err(error?.message ?? "Unable to create request.");
    }

    if (allocations.length > 0) {
      const reportingIds = [...new Set(allocations.map((a) => a.reportingBudgetLineId))];
      const accountIds = [...new Set(allocations.map((a) => a.accountCodeId))];

      const { data: reportingLines, error: reportingError } = await supabase
        .from("project_budget_lines")
        .select("id, project_id")
        .in("id", reportingIds);
      if (reportingError) return err(reportingError.message);

      const lineSet = new Set((reportingLines ?? []).filter((line) => line.project_id === budgetLine.project_id).map((line) => line.id as string));
      if (lineSet.size !== reportingIds.length) {
        return err("All reporting lines must belong to the same project.");
      }

      const { data: accountRows, error: accountError } = await supabase.from("account_codes").select("id").in("id", accountIds);
      if (accountError) return err(accountError.message);
      const accountSet = new Set((accountRows ?? []).map((row) => row.id as string));
      if (accountSet.size !== accountIds.length) return err("One or more account codes are invalid.");

      const { error: allocationError } = await supabase.from("purchase_allocations").insert(
        allocations.map((allocation) => ({
          purchase_id: inserted.id,
          reporting_budget_line_id: allocation.reportingBudgetLineId,
          account_code_id: allocation.accountCodeId,
          production_category_id: productionCategoryId,
          amount: allocation.amount,
          reporting_bucket: allocation.reportingBucket
        }))
      );
      if (allocationError) return err(allocationError.message);
    } else {
      const { data: lineWithCode, error: lineWithCodeError } = await supabase
        .from("project_budget_lines")
        .select("id, account_code_id")
        .eq("id", budgetLine.id)
        .single();
      if (lineWithCodeError || !lineWithCode) return err("Unable to resolve account code for selected budget line.");

      const { error: allocationError } = await supabase.from("purchase_allocations").insert({
        purchase_id: inserted.id,
        reporting_budget_line_id: budgetLine.id,
        account_code_id: bannerAccountCodeId || lineWithCode.account_code_id,
        production_category_id: productionCategoryId,
        amount: computed.status === "posted" ? computed.postedAmount : requestedTotal,
        reporting_bucket: "direct"
      });
      if (allocationError) return err(allocationError.message);
    }

    const eventError = await supabase.from("purchase_events").insert({
      purchase_id: inserted.id,
      from_status: null,
      to_status: computed.status,
      estimated_amount_snapshot: estimatedAmount,
      requested_amount_snapshot: computed.requestedAmount,
      encumbered_amount_snapshot: computed.encumberedAmount,
      pending_cc_amount_snapshot: computed.pendingCcAmount,
      posted_amount_snapshot: computed.postedAmount,
      changed_by_user_id: user.id,
      note:
        requestType === "request"
          ? "Budget Hold created"
          : requestType === "budget_transfer"
            ? "Budget Transfer posted to YTD"
            : requestType === "expense" && isCreditCard
              ? "Credit-card request created and reserved in Pending CC"
              : "Request created"
    });

    if (eventError.error) {
      return err(eventError.error.message);
    }

    revalidatePath("/requests");
    revalidatePath("/");
    return ok("Planning entry created.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not create request."));
  }
}

export async function updatePurchaseStatus(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return err("You must be signed in.");
    }

    const purchaseId = String(formData.get("purchaseId") ?? "");
    const status = String(formData.get("status") ?? "requested") as PurchaseStatus;
    const amount = parseMoney(formData.get("statusAmount"));

    if (!purchaseId) {
      return err("Purchase ID required.");
    }

    const { data: existing, error: existingError } = await supabase
      .from("purchases")
      .select("id, project_id, status, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount")
      .eq("id", purchaseId)
      .single();

    if (existingError || !existing) {
      return err("Purchase not found.");
    }

    const nextValues = {
      encumbered_amount: status === "encumbered" ? amount : 0,
      pending_cc_amount: status === "pending_cc" ? amount : 0,
      posted_amount: status === "posted" ? amount : 0,
      requested_amount: status === "requested" ? amount : existing.requested_amount,
      status,
      posted_date: status === "posted" ? new Date().toISOString().slice(0, 10) : null,
      cc_workflow_status:
        status === "posted"
          ? "posted_to_account"
          : status === "pending_cc"
            ? "receipts_uploaded"
            : existing.status === "pending_cc" || existing.status === "posted"
              ? "requested"
              : null
    };

    const { data: updated, error: updateError } = await supabase
      .from("purchases")
      .update(nextValues)
      .eq("id", purchaseId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return err(updateError.message);
    }
    if (!updated?.id) {
      return err("Status update was not applied.");
    }

    const { error: eventError } = await supabase.from("purchase_events").insert({
      purchase_id: purchaseId,
      from_status: existing.status,
      to_status: status,
      estimated_amount_snapshot: existing.estimated_amount,
      requested_amount_snapshot: nextValues.requested_amount,
      encumbered_amount_snapshot: nextValues.encumbered_amount,
      pending_cc_amount_snapshot: nextValues.pending_cc_amount,
      posted_amount_snapshot: nextValues.posted_amount,
      changed_by_user_id: user.id,
      note: "Status updated"
    });

    if (eventError) {
      return err(eventError.message);
    }

    revalidatePath("/requests");
    revalidatePath("/");
    revalidatePath(`/projects/${existing.project_id}`);
    return ok("Status updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update status."));
  }
}

export async function addRequestReceipt(
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

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    const amount = parseMoney(formData.get("amountReceived"));
    const note = String(formData.get("note") ?? "").trim();
    const receiptUrl = String(formData.get("receiptUrl") ?? "").trim();
    const receiptFile = formData.get("receiptFile");

    if (!purchaseId) return err("Purchase ID required.");
    if (amount === 0) return err("Receipt amount must be non-zero.");

    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, project_id, request_type, is_credit_card")
      .eq("id", purchaseId)
      .single();
    if (purchaseError || !purchase) return err("Purchase not found.");
    if ((purchase.request_type as string) !== "expense" || !Boolean(purchase.is_credit_card as boolean | null)) {
      return err("Receipts in this flow are only for credit-card expenses.");
    }

    await requirePmOrAdmin(supabase, purchase.project_id as string, user.id);

    let attachmentUrl: string | null = receiptUrl || null;

    if (receiptFile instanceof File && receiptFile.size > 0) {
      if (receiptFile.size > MAX_RECEIPT_UPLOAD_BYTES) {
        return err("Receipt file is too large. Please upload a file under 10 MB.");
      }
      if (receiptFile.type && !ALLOWED_RECEIPT_MIME_TYPES.has(receiptFile.type.toLowerCase())) {
        return err("Unsupported receipt file type. Please upload PDF, PNG, JPG, WEBP, or HEIC.");
      }

      const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${purchase.project_id as string}/${purchaseId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(RECEIPT_STORAGE_BUCKET).upload(path, receiptFile, {
        upsert: false
      });
      if (uploadError) {
        return err(
          `Receipt upload failed. Ensure storage bucket '${RECEIPT_STORAGE_BUCKET}' exists and policies are applied. ${uploadError.message}`
        );
      }
      attachmentUrl = toStorageReference(RECEIPT_STORAGE_BUCKET, path);
    }

    const { error } = await supabase.from("purchase_receipts").insert({
      purchase_id: purchaseId,
      note: note || null,
      amount_received: amount,
      attachment_url: attachmentUrl,
      fully_received: false,
      created_by_user_id: user.id
    });
    if (error) return err(error.message);

    const { data: purchaseUpdated, error: purchaseUpdateError } = await supabase
      .from("purchases")
      .update({
        cc_workflow_status: "receipts_uploaded",
        procurement_status: "receipts_uploaded"
      })
      .eq("id", purchaseId)
      .select("id")
      .maybeSingle();
    if (purchaseUpdateError) return err(purchaseUpdateError.message);
    if (!purchaseUpdated?.id) return err("Purchase workflow update was not applied.");

    revalidatePath("/requests");
    revalidatePath(`/projects/${purchase.project_id as string}`);
    return ok("Receipt added.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not add receipt."));
  }
}

export async function reconcileRequestToPendingCc(
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

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    if (!purchaseId) return err("Purchase ID required.");

    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, project_id, status, estimated_amount, requested_amount, request_type, is_credit_card")
      .eq("id", purchaseId)
      .single();
    if (purchaseError || !purchase) return err("Purchase not found.");
    if ((purchase.request_type as string) !== "expense" || !Boolean(purchase.is_credit_card as boolean | null)) {
      return err("Only credit-card expense requests can be reconciled to Pending CC.");
    }

    await requirePmOrAdmin(supabase, purchase.project_id as string, user.id);

    const { data: receiptRows, error: receiptsError } = await supabase
      .from("purchase_receipts")
      .select("amount_received")
      .eq("purchase_id", purchaseId);
    if (receiptsError) return err(receiptsError.message);

    const reconciledTotal = (receiptRows ?? []).reduce((sum, row) => {
      const value = Number(row.amount_received ?? 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    if (reconciledTotal === 0) return err("Receipts net to zero. Add a non-zero total before reconciling to Pending CC.");

    const { data: updated, error: updateError } = await supabase
      .from("purchases")
      .update({
        status: "pending_cc",
        requested_amount: 0,
        encumbered_amount: 0,
        pending_cc_amount: reconciledTotal,
        posted_amount: 0,
        cc_workflow_status: "receipts_uploaded"
      })
      .eq("id", purchaseId)
      .select("id")
      .maybeSingle();
    if (updateError) return err(updateError.message);
    if (!updated?.id) return err("Pending CC reconciliation update was not applied.");

    const { error: eventError } = await supabase.from("purchase_events").insert({
      purchase_id: purchaseId,
      from_status: purchase.status as PurchaseStatus,
      to_status: "pending_cc",
      estimated_amount_snapshot: Number(purchase.estimated_amount ?? 0),
      requested_amount_snapshot: Number(purchase.requested_amount ?? 0),
      encumbered_amount_snapshot: 0,
      pending_cc_amount_snapshot: reconciledTotal,
      posted_amount_snapshot: 0,
      changed_by_user_id: user.id,
      note: "Reconciled from receipts to Pending CC"
    });
    if (eventError) return err(eventError.message);

    revalidatePath("/requests");
    revalidatePath("/cc");
    revalidatePath("/");
    revalidatePath(`/projects/${purchase.project_id as string}`);
    return ok("Reconciled to Pending CC.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not reconcile to Pending CC."));
  }
}

export async function markCcPostedToAccount(
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

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    if (!purchaseId) return err("Purchase ID required.");

    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, project_id, status, pending_cc_amount, estimated_amount, request_type, is_credit_card")
      .eq("id", purchaseId)
      .single();
    if (purchaseError || !purchase) return err("Purchase not found.");
    if ((purchase.request_type as string) !== "expense" || !Boolean(purchase.is_credit_card as boolean | null)) {
      return err("Only credit-card expenses can be posted with this action.");
    }
    await requirePmOrAdmin(supabase, purchase.project_id as string, user.id);

    const amount = Number(purchase.pending_cc_amount ?? 0);
    if (amount === 0) return err("Pending CC amount is zero.");

    const { data: updated, error: updateError } = await supabase
      .from("purchases")
      .update({
        status: "posted",
        pending_cc_amount: 0,
        posted_amount: amount,
        posted_date: new Date().toISOString().slice(0, 10),
        cc_workflow_status: "posted_to_account"
      })
      .eq("id", purchaseId)
      .select("id")
      .maybeSingle();
    if (updateError) return err(updateError.message);
    if (!updated?.id) return err("Posted-to-account update was not applied.");

    const { error: eventError } = await supabase.from("purchase_events").insert({
      purchase_id: purchaseId,
      from_status: purchase.status as PurchaseStatus,
      to_status: "posted",
      estimated_amount_snapshot: Number(purchase.estimated_amount ?? 0),
      requested_amount_snapshot: 0,
      encumbered_amount_snapshot: 0,
      pending_cc_amount_snapshot: 0,
      posted_amount_snapshot: amount,
      changed_by_user_id: user.id,
      note: "Manually marked Posted to Account after statement payment"
    });
    if (eventError) return err(eventError.message);

    revalidatePath("/requests");
    revalidatePath("/cc");
    revalidatePath("/");
    revalidatePath(`/projects/${purchase.project_id as string}`);
    return ok("Marked posted to account.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not mark posted to account."));
  }
}

export async function updateRequestReceipt(
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

    const receiptId = String(formData.get("receiptId") ?? "").trim();
    const amount = parseMoney(formData.get("amountReceived"));
    const note = String(formData.get("note") ?? "").trim();
    const receiptUrl = String(formData.get("receiptUrl") ?? "").trim();
    if (!receiptId) return err("Receipt ID required.");
    if (amount === 0) return err("Receipt amount must be non-zero.");

    const purchaseId = await getPurchaseIdForReceipt(supabase, receiptId);
    const projectId = await getPurchaseProjectId(supabase, purchaseId);
    await requirePmOrAdmin(supabase, projectId, user.id);

    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, project_id, request_type, is_credit_card")
      .eq("id", purchaseId)
      .single();
    if (purchaseError || !purchase) return err("Purchase not found.");
    if ((purchase.request_type as string) !== "expense" || !Boolean(purchase.is_credit_card as boolean | null)) {
      return err("This receipt is not attached to a credit-card expense request.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("purchase_receipts")
      .update({
        amount_received: amount,
        note: note || null,
        attachment_url: receiptUrl || null
      })
      .eq("id", receiptId)
      .select("id")
      .maybeSingle();
    if (updateError) return err(updateError.message);
    if (!updated?.id) return err("Receipt update was not applied.");

    revalidatePath("/requests");
    revalidatePath(`/projects/${purchase.project_id as string}`);
    return ok("Receipt updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update receipt."));
  }
}

export async function deleteRequestReceipt(
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

    const receiptId = String(formData.get("receiptId") ?? "").trim();
    if (!receiptId) return err("Receipt ID required.");

    const purchaseId = await getPurchaseIdForReceipt(supabase, receiptId);
    const projectId = await getPurchaseProjectId(supabase, purchaseId);
    await requirePmOrAdmin(supabase, projectId, user.id);

    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, project_id")
      .eq("id", purchaseId)
      .single();
    if (purchaseError || !purchase) return err("Purchase not found.");

    const { error: deleteError } = await supabase.from("purchase_receipts").delete().eq("id", receiptId);
    if (deleteError) return err(deleteError.message);

    revalidatePath("/requests");
    revalidatePath(`/projects/${purchase.project_id as string}`);
    return ok("Receipt deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete receipt."));
  }
}

export async function updateRequestInline(
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

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const budgetLineId = String(formData.get("budgetLineId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const requisitionNumber = String(formData.get("requisitionNumber") ?? "").trim();
    const estimatedAmount = parseMoney(formData.get("estimatedAmount"));
    const requestedAmount = parseMoney(formData.get("requestedAmount"));
    const requestType = parseRequestType(formData.get("requestType"));
    const isCreditCard = requestType === "expense" ? formData.get("isCreditCard") === "on" : false;

    if (!purchaseId) return err("Purchase ID required.");
    if (!projectId) return err("Project is required.");
    if (!productionCategoryId) return err("Production category is required.");
    if (!title) return err("Title is required.");

    const { data: existing, error: existingError } = await supabase
      .from("purchases")
      .select("id, project_id, status, budget_line_id, requested_amount, encumbered_amount, pending_cc_amount, posted_amount")
      .eq("id", purchaseId)
      .single();
    if (existingError || !existing) return err("Purchase not found.");

    await requirePmOrAdmin(supabase, existing.project_id as string, user.id);

    let resolvedBudgetLineId = budgetLineId;
    if (!resolvedBudgetLineId) {
      const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
        p_project_id: projectId,
        p_production_category_id: productionCategoryId
      });
      if (ensureLineError || !ensuredLineId) return err(ensureLineError?.message ?? "Unable to resolve reporting line.");
      resolvedBudgetLineId = ensuredLineId as string;
    }

    const { data: budgetLine, error: budgetLineError } = await supabase
      .from("project_budget_lines")
      .select("id, project_id, account_code_id")
      .eq("id", resolvedBudgetLineId)
      .single();
    if (budgetLineError || !budgetLine) return err("Invalid budget line.");
    if ((budgetLine.project_id as string) !== projectId) {
      return err("Budget line must belong to the selected project.");
    }

    const computed = computeRequestAmounts(requestType, estimatedAmount, requestedAmount, isCreditCard);
    const currentPostedAmount = Number(existing.posted_amount ?? 0);
    const currentPendingCcAmount = Number(existing.pending_cc_amount ?? 0);
    const currentEncumberedAmount = Number(existing.encumbered_amount ?? 0);
    const currentRequestedAmount = Number(existing.requested_amount ?? 0);
    const statusLockedEstimatedAmount =
      (existing.status as PurchaseStatus) === "posted"
        ? currentPostedAmount
        : (existing.status as PurchaseStatus) === "pending_cc"
          ? currentPendingCcAmount
          : (existing.status as PurchaseStatus) === "encumbered"
            ? currentEncumberedAmount
            : currentRequestedAmount;

    const nextValues = {
      project_id: projectId,
      budget_line_id: resolvedBudgetLineId,
      production_category_id: productionCategoryId,
      banner_account_code_id: bannerAccountCodeId || null,
      title,
      reference_number: requestType === "requisition" || requestType === "budget_transfer" ? null : referenceNumber || null,
      requisition_number: requestType === "requisition" ? requisitionNumber || null : null,
      estimated_amount: (existing.status as PurchaseStatus) === "requested" ? estimatedAmount : statusLockedEstimatedAmount,
      requested_amount: computed.requestedAmount,
      encumbered_amount: computed.encumberedAmount,
      pending_cc_amount: computed.pendingCcAmount,
      posted_amount: computed.postedAmount,
      status: computed.status,
      posted_date: computed.status === "posted" ? new Date().toISOString().slice(0, 10) : null,
      request_type: requestType,
      is_credit_card: isCreditCard,
      cc_workflow_status: computed.ccWorkflowStatus
    };

    const { data: updatedRequest, error: updateError } = await supabase
      .from("purchases")
      .update(nextValues)
      .eq("id", purchaseId)
      .select("id")
      .maybeSingle();
    if (updateError) return err(updateError.message);
    if (!updatedRequest?.id) return err("Request update was not applied.");

    const allocationAmount =
      computed.status === "encumbered"
        ? computed.encumberedAmount
        : computed.status === "pending_cc"
          ? computed.pendingCcAmount
          : computed.status === "posted"
            ? computed.postedAmount
            : computed.requestedAmount;

    const { error: deleteAllocationsError } = await supabase.from("purchase_allocations").delete().eq("purchase_id", purchaseId);
    if (deleteAllocationsError) return err(deleteAllocationsError.message);

    const { error: insertAllocationError } = await supabase.from("purchase_allocations").insert({
      purchase_id: purchaseId,
      reporting_budget_line_id: resolvedBudgetLineId,
      account_code_id: bannerAccountCodeId || (budgetLine.account_code_id as string | null) || null,
      production_category_id: productionCategoryId,
      amount: allocationAmount,
      reporting_bucket: "direct"
    });
    if (insertAllocationError) return err(insertAllocationError.message);

    revalidatePath("/requests");
    revalidatePath("/");
    revalidatePath(`/projects/${existing.project_id as string}`);
    return ok("Request updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update request."));
  }
}

export async function deleteRequestAction(
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

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    if (!purchaseId) return err("Purchase ID required.");

    const { data: existing, error: existingError } = await supabase
      .from("purchases")
      .select("id, project_id")
      .eq("id", purchaseId)
      .single();
    if (existingError || !existing) return err("Purchase not found.");

    const access = await getAccessContext();
    if (access.role !== "admin") {
      return err("Only Admin can delete requests.");
    }

    const { error: deleteError } = await supabase.from("purchases").delete().eq("id", purchaseId);
    if (deleteError) return err(deleteError.message);

    revalidatePath("/requests");
    revalidatePath("/");
    revalidatePath(`/projects/${existing.project_id as string}`);
    return ok("Request deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete request."));
  }
}

export async function bulkUpdateRequestsAction(
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

    const purchaseIds = parseIdsJson(formData.get("selectedIdsJson"));
    if (purchaseIds.length === 0) return err("Select at least one request.");

    const applyProject = formData.get("applyProject") === "on";
    const applyCategory = formData.get("applyProductionCategory") === "on";
    const applyBannerCode = formData.get("applyBannerAccountCode") === "on";
    const applyTitle = formData.get("applyTitle") === "on";
    const applyType = formData.get("applyRequestType") === "on";
    const applyCreditCard = formData.get("applyIsCreditCard") === "on";
    const applyEstimated = formData.get("applyEstimatedAmount") === "on";
    const applyRequested = formData.get("applyRequestedAmount") === "on";
    const applyRequisition = formData.get("applyRequisitionNumber") === "on";
    const applyReference = formData.get("applyReferenceNumber") === "on";

    if (
      !applyProject &&
      !applyCategory &&
      !applyBannerCode &&
      !applyTitle &&
      !applyType &&
      !applyCreditCard &&
      !applyEstimated &&
      !applyRequested &&
      !applyRequisition &&
      !applyReference
    ) {
      return err("Choose at least one field to apply.");
    }

    const targetProjectId = String(formData.get("projectId") ?? "").trim();
    const targetProductionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const targetBannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const targetTitle = String(formData.get("title") ?? "").trim();
    const targetRequestTypeRaw = String(formData.get("requestType") ?? "").trim().toLowerCase();
    const targetRequestType = parseRequestType(targetRequestTypeRaw);
    const targetIsCreditCardRaw = String(formData.get("isCreditCard") ?? "").trim().toLowerCase();
    const targetIsCreditCard = targetIsCreditCardRaw === "true";
    const targetEstimatedAmount = parseMoney(formData.get("estimatedAmount"));
    const targetRequestedAmount = parseMoney(formData.get("requestedAmount"));
    const targetRequisitionNumber = String(formData.get("requisitionNumber") ?? "").trim();
    const targetReferenceNumber = String(formData.get("referenceNumber") ?? "").trim();

    const { data: purchases, error: purchasesError } = await supabase
      .from("purchases")
      .select(
        "id, project_id, status, title, request_type, is_credit_card, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, requisition_number, reference_number, production_category_id, banner_account_code_id"
      )
      .in("id", purchaseIds);
    if (purchasesError) return err(purchasesError.message);
    if (!purchases || purchases.length !== purchaseIds.length) return err("Some selected requests were not found.");

    const projectIds = [...new Set(purchases.map((row) => row.project_id as string))];
    if (applyProject) {
      if (!targetProjectId) return err("Project is required when applying project.");
      projectIds.push(targetProjectId);
    }
    const access = await getAccessContext();
    if (access.role !== "admin") {
      if (access.role !== "project_manager") {
        return err("Only Admin or Project Manager can bulk edit selected requests.");
      }
      for (const projectId of projectIds) {
        if (!access.manageableProjectIds.has(projectId)) {
          return err("Only Admin or Project Manager can bulk edit selected requests.");
        }
      }
    }

    const { data: allocationRows, error: allocationRowsError } = await supabase
      .from("purchase_allocations")
      .select("purchase_id")
      .in("purchase_id", purchaseIds);
    if (allocationRowsError) return err(allocationRowsError.message);
    const allocationCounts = new Map<string, number>();
    for (const row of allocationRows ?? []) {
      const purchaseId = row.purchase_id as string;
      allocationCounts.set(purchaseId, (allocationCounts.get(purchaseId) ?? 0) + 1);
    }
    const splitIds = purchaseIds.filter((id) => (allocationCounts.get(id) ?? 0) > 1);
    if (splitIds.length > 0) {
      return err("Bulk edit does not support split allocation rows. Edit those requests individually.");
    }

    type RequestBulkPlan = {
      purchaseId: string;
      oldProjectId: string;
      nextProjectId: string;
      nextProductionCategoryId: string;
      resolvedBudgetLineId: string;
      budgetLineAccountCodeId: string | null;
      nextRequestType: RequestType;
      nextIsCreditCard: boolean;
      nextCcWorkflowStatus: "requested" | "posted_to_account" | null;
      nextStatus: PurchaseStatus;
      nextTitle: string;
      nextEstimatedAmount: number;
      nextRequestedAmount: number;
      nextEncumberedAmount: number;
      nextPendingCcAmount: number;
      nextPostedAmount: number;
      requisitionNumber: string | null;
      referenceNumber: string | null;
      bannerAccountCodeId: string | null;
      allocationAmount: number;
    };

    const plans: RequestBulkPlan[] = [];

    // First pass: validate all selected rows and build their update plans.
    for (const purchase of purchases) {
      const purchaseId = purchase.id as string;
      const oldProjectId = purchase.project_id as string;
      const nextProjectId = applyProject ? targetProjectId : (purchase.project_id as string);
      const nextProductionCategoryId = applyCategory
        ? targetProductionCategoryId
        : ((purchase.production_category_id as string | null) ?? "");
      if (!nextProjectId) return err("Project is required.");
      if (!nextProductionCategoryId) return err("Production category is required.");

      const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
        p_project_id: nextProjectId,
        p_production_category_id: nextProductionCategoryId
      });
      if (ensureLineError || !ensuredLineId) {
        return err(ensureLineError?.message ?? "Could not resolve reporting line for selected category.");
      }
      const resolvedBudgetLineId = ensuredLineId as string;

      const { data: budgetLine, error: budgetLineError } = await supabase
        .from("project_budget_lines")
        .select("id, account_code_id")
        .eq("id", resolvedBudgetLineId)
        .single();
      if (budgetLineError || !budgetLine) return err("Could not resolve account code for reporting line.");

      const existingRequestType = ((purchase.request_type as string | null) ?? "requisition") as RequestType;
      const nextRequestType = applyType ? targetRequestType : existingRequestType;
      const nextIsCreditCard = nextRequestType === "expense" ? (applyCreditCard ? targetIsCreditCard : Boolean(purchase.is_credit_card)) : false;

      const nextTitle = applyTitle ? targetTitle : ((purchase.title as string) ?? "");
      if (!nextTitle) return err("Title cannot be blank when applying title.");

      const nextEstimatedAmount = applyEstimated ? targetEstimatedAmount : Number(purchase.estimated_amount ?? 0);
      const nextRequestedAmountInput = applyRequested ? targetRequestedAmount : Number(purchase.requested_amount ?? 0);
      const computed = computeRequestAmounts(nextRequestType, nextEstimatedAmount, nextRequestedAmountInput, nextIsCreditCard);

      const requisitionNumber =
        nextRequestType === "requisition"
          ? applyRequisition
            ? targetRequisitionNumber || null
            : ((purchase.requisition_number as string | null) ?? null)
          : null;
      const referenceNumber =
        nextRequestType === "requisition" || nextRequestType === "budget_transfer"
          ? null
          : applyReference
            ? targetReferenceNumber || null
            : ((purchase.reference_number as string | null) ?? null);

      const bannerAccountCodeId = applyBannerCode
        ? targetBannerAccountCodeId || null
        : ((purchase.banner_account_code_id as string | null) ?? null);

      const allocationAmount =
        computed.status === "encumbered"
          ? computed.encumberedAmount
          : computed.status === "pending_cc"
            ? computed.pendingCcAmount
            : computed.status === "posted"
              ? computed.postedAmount
              : computed.requestedAmount;

      plans.push({
        purchaseId,
        oldProjectId,
        nextProjectId,
        nextProductionCategoryId,
        resolvedBudgetLineId,
        budgetLineAccountCodeId: (budgetLine.account_code_id as string | null) ?? null,
        nextRequestType,
        nextIsCreditCard,
        nextCcWorkflowStatus: computed.ccWorkflowStatus,
        nextStatus: computed.status,
        nextTitle,
        nextEstimatedAmount,
        nextRequestedAmount: computed.requestedAmount,
        nextEncumberedAmount: computed.encumberedAmount,
        nextPendingCcAmount: computed.pendingCcAmount,
        nextPostedAmount: computed.postedAmount,
        requisitionNumber,
        referenceNumber,
        bannerAccountCodeId,
        allocationAmount
      });
    }

    // Second pass: apply updates only after all rows validate.
    for (const plan of plans) {
      const { data: updated, error: updateError } = await supabase
        .from("purchases")
        .update({
          project_id: plan.nextProjectId,
          budget_line_id: plan.resolvedBudgetLineId,
          production_category_id: plan.nextProductionCategoryId,
          banner_account_code_id: plan.bannerAccountCodeId,
          title: plan.nextTitle,
          requisition_number: plan.requisitionNumber,
          reference_number: plan.referenceNumber,
          estimated_amount: plan.nextEstimatedAmount,
          requested_amount: plan.nextRequestedAmount,
          encumbered_amount: plan.nextEncumberedAmount,
          pending_cc_amount: plan.nextPendingCcAmount,
          posted_amount: plan.nextPostedAmount,
          status: plan.nextStatus,
          posted_date: plan.nextStatus === "posted" ? new Date().toISOString().slice(0, 10) : null,
          request_type: plan.nextRequestType,
          is_credit_card: plan.nextIsCreditCard,
          cc_workflow_status: plan.nextCcWorkflowStatus
        })
        .eq("id", plan.purchaseId)
        .select("id")
        .maybeSingle();
      if (updateError) return err(updateError.message);
      if (!updated?.id) return err("A request update was not applied.");

      const { error: deleteAllocationError } = await supabase.from("purchase_allocations").delete().eq("purchase_id", plan.purchaseId);
      if (deleteAllocationError) return err(deleteAllocationError.message);

      const { error: insertAllocationError } = await supabase.from("purchase_allocations").insert({
        purchase_id: plan.purchaseId,
        reporting_budget_line_id: plan.resolvedBudgetLineId,
        account_code_id: plan.bannerAccountCodeId || plan.budgetLineAccountCodeId,
        production_category_id: plan.nextProductionCategoryId,
        amount: plan.allocationAmount,
        reporting_bucket: "direct"
      });
      if (insertAllocationError) return err(insertAllocationError.message);

      if (plan.oldProjectId !== plan.nextProjectId) {
        revalidatePath(`/projects/${plan.oldProjectId}`);
      }
      revalidatePath(`/projects/${plan.nextProjectId}`);
    }

    revalidatePath("/requests");
    revalidatePath("/");
    return ok("Bulk update saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not bulk update requests."));
  }
}

export async function bulkDeleteRequestsAction(
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

    const purchaseIds = parseIdsJson(formData.get("selectedIdsJson"));
    if (purchaseIds.length === 0) return err("Select at least one request.");

    const { data: purchases, error } = await supabase.from("purchases").select("id, project_id").in("id", purchaseIds);
    if (error) return err(error.message);
    if (!purchases || purchases.length !== purchaseIds.length) return err("Some selected requests were not found.");

    const access = await getAccessContext();
    if (access.role !== "admin") {
      return err("Only Admin can delete requests.");
    }

    const projectIds = new Set(purchases.map((row) => row.project_id as string));

    const { error: deleteError } = await supabase.from("purchases").delete().in("id", purchaseIds);
    if (deleteError) return err(deleteError.message);

    revalidatePath("/requests");
    revalidatePath("/");
    for (const projectId of projectIds) {
      revalidatePath(`/projects/${projectId}`);
    }
    return ok("Selected requests deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete selected requests."));
  }
}

export type { ActionState };
