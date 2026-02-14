"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseStatus } from "@/lib/types";

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

async function requirePmOrAdmin(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  projectId: string,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("project_memberships")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data?.role as string | undefined) ?? null;
  if (!role || (role !== "admin" && role !== "project_manager")) {
    throw new Error("Only Admin or Project Manager can reconcile to Pending CC.");
  }
}

export async function createRequest(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
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
  const requestTypeRaw = String(formData.get("requestType") ?? "requisition").trim().toLowerCase();
  const requestType =
    requestTypeRaw === "expense" || requestTypeRaw === "contract" ? requestTypeRaw : ("requisition" as const);
  const isCreditCard = requestType === "expense" ? formData.get("isCreditCard") === "on" : false;
  const allocationsJson = String(formData.get("allocationsJson") ?? "").trim();

  if (!projectId || !productionCategoryId || !title) {
    throw new Error("Project, production category, and title are required.");
  }

  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .select("id, planning_requests_enabled")
    .eq("id", projectId)
    .single();
  if (projectError || !projectRow) {
    throw new Error("Project not found.");
  }
  if (!Boolean(projectRow.planning_requests_enabled as boolean | null)) {
    throw new Error("Planning Requests are disabled for this project.");
  }

  let resolvedBudgetLineId = budgetLineId;
  if (!resolvedBudgetLineId) {
    const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
      p_project_id: projectId,
      p_production_category_id: productionCategoryId
    });
    if (ensureLineError || !ensuredLineId) {
      throw new Error(ensureLineError?.message ?? "Unable to resolve reporting line for category.");
    }
    resolvedBudgetLineId = ensuredLineId as string;
  }

  const { data: budgetLine, error: budgetLineError } = await supabase
    .from("project_budget_lines")
    .select("id, project_id")
    .eq("id", resolvedBudgetLineId)
    .single();

  if (budgetLineError || !budgetLine) {
    throw new Error("Invalid budget line selected.");
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
      throw new Error("Invalid split allocation payload.");
    }
  }

  if (allocations.length > 0) {
    const { data: roleRow, error: roleError } = await supabase
      .from("project_memberships")
      .select("role")
      .eq("project_id", budgetLine.project_id)
      .eq("user_id", user.id)
      .single();

    if (roleError || !roleRow || (roleRow.role !== "admin" && roleRow.role !== "project_manager")) {
      throw new Error("Split allocations can only be created by Project Managers or Admins.");
    }
  }

  const requestedTotal = allocations.length > 0 ? allocations.reduce((sum, allocation) => sum + allocation.amount, 0) : requestedAmount;
  const isCcRequest = requestType === "expense" && isCreditCard;

  const { data: inserted, error } = await supabase
    .from("purchases")
    .insert({
      project_id: budgetLine.project_id,
      budget_line_id: budgetLine.id,
      production_category_id: productionCategoryId,
      banner_account_code_id: bannerAccountCodeId || null,
      entered_by_user_id: user.id,
      title,
      reference_number: requestType === "requisition" ? null : referenceNumber || null,
      requisition_number: requestType === "requisition" ? requisitionNumber || null : null,
      estimated_amount: estimatedAmount,
      requested_amount: requestedTotal,
      encumbered_amount: 0,
      pending_cc_amount: isCcRequest ? requestedTotal : 0,
      posted_amount: 0,
      request_type: requestType,
      is_credit_card: isCreditCard,
      cc_workflow_status: isCcRequest ? "requested" : null,
      status: isCcRequest ? "pending_cc" : "requested"
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message ?? "Unable to create request.");
  }

  if (allocations.length > 0) {
    const reportingIds = [...new Set(allocations.map((a) => a.reportingBudgetLineId))];
    const accountIds = [...new Set(allocations.map((a) => a.accountCodeId))];

    const { data: reportingLines, error: reportingError } = await supabase
      .from("project_budget_lines")
      .select("id, project_id")
      .in("id", reportingIds);
    if (reportingError) throw new Error(reportingError.message);

    const lineSet = new Set((reportingLines ?? []).filter((line) => line.project_id === budgetLine.project_id).map((line) => line.id as string));
    if (lineSet.size !== reportingIds.length) {
      throw new Error("All reporting lines must belong to the same project.");
    }

    const { data: accountRows, error: accountError } = await supabase.from("account_codes").select("id").in("id", accountIds);
    if (accountError) throw new Error(accountError.message);
    const accountSet = new Set((accountRows ?? []).map((row) => row.id as string));
    if (accountSet.size !== accountIds.length) throw new Error("One or more account codes are invalid.");

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
    if (allocationError) throw new Error(allocationError.message);
  } else {
    const { data: lineWithCode, error: lineWithCodeError } = await supabase
      .from("project_budget_lines")
      .select("id, account_code_id")
      .eq("id", budgetLine.id)
      .single();
    if (lineWithCodeError || !lineWithCode) throw new Error("Unable to resolve account code for selected budget line.");

    const { error: allocationError } = await supabase.from("purchase_allocations").insert({
      purchase_id: inserted.id,
      reporting_budget_line_id: budgetLine.id,
      account_code_id: bannerAccountCodeId || lineWithCode.account_code_id,
      production_category_id: productionCategoryId,
      amount: requestedTotal,
      reporting_bucket: "direct"
    });
    if (allocationError) throw new Error(allocationError.message);
  }

  const eventError = await supabase.from("purchase_events").insert({
    purchase_id: inserted.id,
    from_status: null,
    to_status: isCcRequest ? "pending_cc" : "requested",
    estimated_amount_snapshot: estimatedAmount,
    requested_amount_snapshot: isCcRequest ? 0 : requestedTotal,
    encumbered_amount_snapshot: 0,
    pending_cc_amount_snapshot: isCcRequest ? requestedTotal : 0,
    posted_amount_snapshot: 0,
    changed_by_user_id: user.id,
    note: isCcRequest ? "Credit-card request created and reserved in Pending CC" : "Request created"
  });

  if (eventError.error) {
    throw new Error(eventError.error.message);
  }

  revalidatePath("/requests");
  revalidatePath("/");
}

export async function updatePurchaseStatus(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const purchaseId = String(formData.get("purchaseId") ?? "");
  const status = String(formData.get("status") ?? "requested") as PurchaseStatus;
  const amount = parseMoney(formData.get("statusAmount"));

  if (!purchaseId) {
    throw new Error("Purchase ID required.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("purchases")
    .select("id, project_id, status, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount")
    .eq("id", purchaseId)
    .single();

  if (existingError || !existing) {
    throw new Error("Purchase not found.");
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

  const { error: updateError } = await supabase.from("purchases").update(nextValues).eq("id", purchaseId);

  if (updateError) {
    throw new Error(updateError.message);
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
    throw new Error(eventError.message);
  }

  revalidatePath("/requests");
  revalidatePath("/");
  revalidatePath(`/projects/${existing.project_id}`);
}

export async function addRequestReceipt(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in.");

  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  const amount = parseMoney(formData.get("amountReceived"));
  const note = String(formData.get("note") ?? "").trim();
  const receiptUrl = String(formData.get("receiptUrl") ?? "").trim();
  const receiptFile = formData.get("receiptFile");

  if (!purchaseId) throw new Error("Purchase ID required.");
  if (amount === 0) throw new Error("Receipt amount must be non-zero.");

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, project_id, request_type, is_credit_card")
    .eq("id", purchaseId)
    .single();
  if (purchaseError || !purchase) throw new Error("Purchase not found.");
  if ((purchase.request_type as string) !== "expense" || !Boolean(purchase.is_credit_card as boolean | null)) {
    throw new Error("Receipts in this flow are only for credit-card expenses.");
  }

  let attachmentUrl: string | null = receiptUrl || null;

  if (receiptFile instanceof File && receiptFile.size > 0) {
    const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${purchase.project_id as string}/${purchaseId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("purchase-receipts").upload(path, receiptFile, {
      upsert: false
    });
    if (uploadError) {
      throw new Error(
        `Receipt upload failed. Ensure storage bucket 'purchase-receipts' exists and policies are applied. ${uploadError.message}`
      );
    }

    const {
      data: { publicUrl }
    } = supabase.storage.from("purchase-receipts").getPublicUrl(path);
    attachmentUrl = publicUrl;
  }

  const { error } = await supabase.from("purchase_receipts").insert({
    purchase_id: purchaseId,
    note: note || null,
    amount_received: amount,
    attachment_url: attachmentUrl,
    fully_received: false,
    created_by_user_id: user.id
  });
  if (error) throw new Error(error.message);

  const { error: purchaseUpdateError } = await supabase
    .from("purchases")
    .update({ cc_workflow_status: "receipts_uploaded" })
    .eq("id", purchaseId);
  if (purchaseUpdateError) throw new Error(purchaseUpdateError.message);

  revalidatePath("/requests");
  revalidatePath(`/projects/${purchase.project_id as string}`);
}

export async function reconcileRequestToPendingCc(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in.");

  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  if (!purchaseId) throw new Error("Purchase ID required.");

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, project_id, status, estimated_amount, requested_amount, request_type, is_credit_card")
    .eq("id", purchaseId)
    .single();
  if (purchaseError || !purchase) throw new Error("Purchase not found.");
  if ((purchase.request_type as string) !== "expense" || !Boolean(purchase.is_credit_card as boolean | null)) {
    throw new Error("Only credit-card expense requests can be reconciled to Pending CC.");
  }

  await requirePmOrAdmin(supabase, purchase.project_id as string, user.id);

  const { data: receiptRows, error: receiptsError } = await supabase
    .from("purchase_receipts")
    .select("amount_received")
    .eq("purchase_id", purchaseId);
  if (receiptsError) throw new Error(receiptsError.message);

  const reconciledTotal = (receiptRows ?? []).reduce((sum, row) => {
    const value = Number(row.amount_received ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  if (reconciledTotal === 0) throw new Error("Receipts net to zero. Add a non-zero total before reconciling to Pending CC.");

  const { error: updateError } = await supabase
    .from("purchases")
    .update({
      status: "pending_cc",
      requested_amount: 0,
      encumbered_amount: 0,
      pending_cc_amount: reconciledTotal,
      posted_amount: 0,
      cc_workflow_status: "receipts_uploaded"
    })
    .eq("id", purchaseId);
  if (updateError) throw new Error(updateError.message);

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
  if (eventError) throw new Error(eventError.message);

  revalidatePath("/requests");
  revalidatePath("/cc");
  revalidatePath("/");
  revalidatePath(`/projects/${purchase.project_id as string}`);
}

export async function markCcPostedToAccount(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  if (!purchaseId) throw new Error("Purchase ID required.");

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, project_id, status, pending_cc_amount, estimated_amount, request_type, is_credit_card")
    .eq("id", purchaseId)
    .single();
  if (purchaseError || !purchase) throw new Error("Purchase not found.");
  if ((purchase.request_type as string) !== "expense" || !Boolean(purchase.is_credit_card as boolean | null)) {
    throw new Error("Only credit-card expenses can be posted with this action.");
  }
  await requirePmOrAdmin(supabase, purchase.project_id as string, user.id);

  const amount = Number(purchase.pending_cc_amount ?? 0);
  if (amount === 0) throw new Error("Pending CC amount is zero.");

  const { error: updateError } = await supabase
    .from("purchases")
    .update({
      status: "posted",
      pending_cc_amount: 0,
      posted_amount: amount,
      posted_date: new Date().toISOString().slice(0, 10),
      cc_workflow_status: "posted_to_account"
    })
    .eq("id", purchaseId);
  if (updateError) throw new Error(updateError.message);

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
  if (eventError) throw new Error(eventError.message);

  revalidatePath("/requests");
  revalidatePath("/cc");
  revalidatePath("/");
  revalidatePath(`/projects/${purchase.project_id as string}`);
}

export async function updateRequestReceipt(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const receiptId = String(formData.get("receiptId") ?? "").trim();
  const amount = parseMoney(formData.get("amountReceived"));
  const note = String(formData.get("note") ?? "").trim();
  const receiptUrl = String(formData.get("receiptUrl") ?? "").trim();
  if (!receiptId) throw new Error("Receipt ID required.");
  if (amount === 0) throw new Error("Receipt amount must be non-zero.");

  const { data: receipt, error: receiptError } = await supabase
    .from("purchase_receipts")
    .select("id, purchase_id")
    .eq("id", receiptId)
    .single();
  if (receiptError || !receipt) throw new Error("Receipt not found.");

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, project_id, request_type, is_credit_card")
    .eq("id", receipt.purchase_id as string)
    .single();
  if (purchaseError || !purchase) throw new Error("Purchase not found.");
  if ((purchase.request_type as string) !== "expense" || !Boolean(purchase.is_credit_card as boolean | null)) {
    throw new Error("This receipt is not attached to a credit-card expense request.");
  }

  const { error: updateError } = await supabase
    .from("purchase_receipts")
    .update({
      amount_received: amount,
      note: note || null,
      attachment_url: receiptUrl || null
    })
    .eq("id", receiptId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/requests");
  revalidatePath(`/projects/${purchase.project_id as string}`);
}

export async function deleteRequestReceipt(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const receiptId = String(formData.get("receiptId") ?? "").trim();
  if (!receiptId) throw new Error("Receipt ID required.");

  const { data: receipt, error: receiptError } = await supabase
    .from("purchase_receipts")
    .select("id, purchase_id")
    .eq("id", receiptId)
    .single();
  if (receiptError || !receipt) throw new Error("Receipt not found.");

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, project_id")
    .eq("id", receipt.purchase_id as string)
    .single();
  if (purchaseError || !purchase) throw new Error("Purchase not found.");

  const { error: deleteError } = await supabase.from("purchase_receipts").delete().eq("id", receiptId);
  if (deleteError) throw new Error(deleteError.message);

  revalidatePath("/requests");
  revalidatePath(`/projects/${purchase.project_id as string}`);
}

export async function updateRequestInline(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in.");

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
  const requestTypeRaw = String(formData.get("requestType") ?? "requisition").trim().toLowerCase();
  const requestType =
    requestTypeRaw === "expense" || requestTypeRaw === "contract" ? requestTypeRaw : ("requisition" as const);
  const isCreditCard = requestType === "expense" ? formData.get("isCreditCard") === "on" : false;

  if (!purchaseId) throw new Error("Purchase ID required.");
  if (!projectId) throw new Error("Project is required.");
  if (!productionCategoryId) throw new Error("Production category is required.");
  if (!title) throw new Error("Title is required.");

  const { data: existing, error: existingError } = await supabase
    .from("purchases")
    .select("id, project_id, status, budget_line_id, requested_amount, encumbered_amount, pending_cc_amount, posted_amount")
    .eq("id", purchaseId)
    .single();
  if (existingError || !existing) throw new Error("Purchase not found.");

  let resolvedBudgetLineId = budgetLineId;
  if (!resolvedBudgetLineId) {
    const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
      p_project_id: projectId,
      p_production_category_id: productionCategoryId
    });
    if (ensureLineError || !ensuredLineId) throw new Error(ensureLineError?.message ?? "Unable to resolve reporting line.");
    resolvedBudgetLineId = ensuredLineId as string;
  }

  const { data: budgetLine, error: budgetLineError } = await supabase
    .from("project_budget_lines")
    .select("id, project_id, account_code_id")
    .eq("id", resolvedBudgetLineId)
    .single();
  if (budgetLineError || !budgetLine) throw new Error("Invalid budget line.");
  if ((budgetLine.project_id as string) !== projectId) {
    throw new Error("Budget line must belong to the selected project.");
  }

  const nextRequested = requestedAmount;
  const nextIsCc = requestType === "expense" && isCreditCard;
  const nextCcWorkflowStatus = nextIsCc
    ? ((existing.status as PurchaseStatus) === "posted" ? "posted_to_account" : "requested")
    : null;
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
    reference_number: requestType === "requisition" ? null : referenceNumber || null,
    requisition_number: requestType === "requisition" ? requisitionNumber || null : null,
    estimated_amount: (existing.status as PurchaseStatus) === "requested" ? estimatedAmount : statusLockedEstimatedAmount,
    requested_amount: existing.status === "requested" ? nextRequested : nextRequested,
    request_type: requestType,
    is_credit_card: isCreditCard,
    cc_workflow_status: nextCcWorkflowStatus
  };

  const { error: updateError } = await supabase.from("purchases").update(nextValues).eq("id", purchaseId);
  if (updateError) throw new Error(updateError.message);

  const allocationAmount =
    (existing.status as PurchaseStatus) === "encumbered"
      ? Number(existing.encumbered_amount ?? 0)
      : (existing.status as PurchaseStatus) === "pending_cc"
        ? Number(existing.pending_cc_amount ?? 0)
        : (existing.status as PurchaseStatus) === "posted"
          ? Number(existing.posted_amount ?? 0)
          : nextRequested;

  const { error: deleteAllocationsError } = await supabase.from("purchase_allocations").delete().eq("purchase_id", purchaseId);
  if (deleteAllocationsError) throw new Error(deleteAllocationsError.message);

  const { error: insertAllocationError } = await supabase.from("purchase_allocations").insert({
    purchase_id: purchaseId,
    reporting_budget_line_id: resolvedBudgetLineId,
    account_code_id: bannerAccountCodeId || (budgetLine.account_code_id as string | null) || null,
    production_category_id: productionCategoryId,
    amount: allocationAmount,
    reporting_bucket: "direct"
  });
  if (insertAllocationError) throw new Error(insertAllocationError.message);

  revalidatePath("/requests");
  revalidatePath("/");
  revalidatePath(`/projects/${existing.project_id as string}`);
}

export async function deleteRequestAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in.");

  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  if (!purchaseId) throw new Error("Purchase ID required.");

  const { data: existing, error: existingError } = await supabase
    .from("purchases")
    .select("id, project_id")
    .eq("id", purchaseId)
    .single();
  if (existingError || !existing) throw new Error("Purchase not found.");

  const { data: membership, error: membershipError } = await supabase
    .from("project_memberships")
    .select("role")
    .eq("project_id", existing.project_id as string)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if ((membership?.role as string | undefined) !== "admin") {
    throw new Error("Only Admin can delete requests.");
  }

  const { error: deleteError } = await supabase.from("purchases").delete().eq("id", purchaseId);
  if (deleteError) throw new Error(deleteError.message);

  revalidatePath("/requests");
  revalidatePath("/");
  revalidatePath(`/projects/${existing.project_id as string}`);
}

export async function bulkUpdateRequestsAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const purchaseIds = parseIdsJson(formData.get("selectedIdsJson"));
  if (purchaseIds.length === 0) throw new Error("Select at least one request.");

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
    throw new Error("Choose at least one field to apply.");
  }

  const targetProjectId = String(formData.get("projectId") ?? "").trim();
  const targetProductionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
  const targetBannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
  const targetTitle = String(formData.get("title") ?? "").trim();
  const targetRequestTypeRaw = String(formData.get("requestType") ?? "").trim().toLowerCase();
  const targetRequestType =
    targetRequestTypeRaw === "expense" || targetRequestTypeRaw === "contract" ? targetRequestTypeRaw : ("requisition" as const);
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
  if (purchasesError) throw new Error(purchasesError.message);
  if (!purchases || purchases.length !== purchaseIds.length) throw new Error("Some selected requests were not found.");

  const projectIds = [...new Set(purchases.map((row) => row.project_id as string))];
  if (applyProject) {
    if (!targetProjectId) throw new Error("Project is required when applying project.");
    projectIds.push(targetProjectId);
  }
  const { data: memberships, error: membershipError } = await supabase
    .from("project_memberships")
    .select("project_id, role")
    .eq("user_id", user.id)
    .in("project_id", projectIds);
  if (membershipError) throw new Error(membershipError.message);
  const membershipByProject = new Map((memberships ?? []).map((row) => [row.project_id as string, row.role as string]));
  for (const projectId of projectIds) {
    const role = membershipByProject.get(projectId);
    if (!role || (role !== "admin" && role !== "project_manager")) {
      throw new Error("Only Admin or Project Manager can bulk edit selected requests.");
    }
  }

  const { data: allocationRows, error: allocationRowsError } = await supabase
    .from("purchase_allocations")
    .select("purchase_id")
    .in("purchase_id", purchaseIds);
  if (allocationRowsError) throw new Error(allocationRowsError.message);
  const allocationCounts = new Map<string, number>();
  for (const row of allocationRows ?? []) {
    const purchaseId = row.purchase_id as string;
    allocationCounts.set(purchaseId, (allocationCounts.get(purchaseId) ?? 0) + 1);
  }
  const splitIds = purchaseIds.filter((id) => (allocationCounts.get(id) ?? 0) > 1);
  if (splitIds.length > 0) {
    throw new Error("Bulk edit does not support split allocation rows. Edit those requests individually.");
  }

  type RequestBulkPlan = {
    purchaseId: string;
    oldProjectId: string;
    nextProjectId: string;
    nextProductionCategoryId: string;
    resolvedBudgetLineId: string;
    budgetLineAccountCodeId: string | null;
    nextRequestType: "requisition" | "expense" | "contract";
    nextIsCreditCard: boolean;
    nextCcWorkflowStatus: "requested" | "posted_to_account" | null;
    nextTitle: string;
    nextEstimatedAmount: number;
    nextRequestedAmount: number;
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
    if (!nextProjectId) throw new Error("Project is required.");
    if (!nextProductionCategoryId) throw new Error("Production category is required.");

    const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
      p_project_id: nextProjectId,
      p_production_category_id: nextProductionCategoryId
    });
    if (ensureLineError || !ensuredLineId) {
      throw new Error(ensureLineError?.message ?? "Could not resolve reporting line for selected category.");
    }
    const resolvedBudgetLineId = ensuredLineId as string;

    const { data: budgetLine, error: budgetLineError } = await supabase
      .from("project_budget_lines")
      .select("id, account_code_id")
      .eq("id", resolvedBudgetLineId)
      .single();
    if (budgetLineError || !budgetLine) throw new Error("Could not resolve account code for reporting line.");

    const existingRequestType = ((purchase.request_type as string | null) ?? "requisition") as "requisition" | "expense" | "contract";
    const nextRequestType = applyType ? targetRequestType : existingRequestType;
    const nextIsCreditCard = nextRequestType === "expense" ? (applyCreditCard ? targetIsCreditCard : Boolean(purchase.is_credit_card)) : false;
    const nextCcWorkflowStatus: "requested" | "posted_to_account" | null =
      nextRequestType === "expense" && nextIsCreditCard
        ? (purchase.status as PurchaseStatus) === "posted"
          ? "posted_to_account"
          : "requested"
        : null;

    const nextTitle = applyTitle ? targetTitle : ((purchase.title as string) ?? "");
    if (!nextTitle) throw new Error("Title cannot be blank when applying title.");

    const nextEstimatedAmount = applyEstimated ? targetEstimatedAmount : Number(purchase.estimated_amount ?? 0);
    const nextRequestedAmount = applyRequested ? targetRequestedAmount : Number(purchase.requested_amount ?? 0);

    const requisitionNumber =
      nextRequestType === "requisition"
        ? applyRequisition
          ? targetRequisitionNumber || null
          : ((purchase.requisition_number as string | null) ?? null)
        : null;
    const referenceNumber =
      nextRequestType === "requisition"
        ? null
        : applyReference
          ? targetReferenceNumber || null
          : ((purchase.reference_number as string | null) ?? null);

    const bannerAccountCodeId = applyBannerCode
      ? targetBannerAccountCodeId || null
      : ((purchase.banner_account_code_id as string | null) ?? null);

    const status = purchase.status as PurchaseStatus;
    const allocationAmount =
      status === "encumbered"
        ? Number(purchase.encumbered_amount ?? 0)
        : status === "pending_cc"
          ? Number(purchase.pending_cc_amount ?? 0)
        : status === "posted"
            ? Number(purchase.posted_amount ?? 0)
            : nextRequestedAmount;

    plans.push({
      purchaseId,
      oldProjectId,
      nextProjectId,
      nextProductionCategoryId,
      resolvedBudgetLineId,
      budgetLineAccountCodeId: (budgetLine.account_code_id as string | null) ?? null,
      nextRequestType,
      nextIsCreditCard,
      nextCcWorkflowStatus,
      nextTitle,
      nextEstimatedAmount,
      nextRequestedAmount,
      requisitionNumber,
      referenceNumber,
      bannerAccountCodeId,
      allocationAmount
    });
  }

  // Second pass: apply updates only after all rows validate.
  for (const plan of plans) {
    const { error: updateError } = await supabase
      .from("purchases")
      .update({
        project_id: plan.nextProjectId,
        budget_line_id: plan.resolvedBudgetLineId,
        production_category_id: plan.nextProductionCategoryId,
        banner_account_code_id: plan.bannerAccountCodeId,
        title: plan.nextTitle,
        request_type: plan.nextRequestType,
        is_credit_card: plan.nextIsCreditCard,
        cc_workflow_status: plan.nextCcWorkflowStatus,
        estimated_amount: plan.nextEstimatedAmount,
        requested_amount: plan.nextRequestedAmount,
        requisition_number: plan.requisitionNumber,
        reference_number: plan.referenceNumber
      })
      .eq("id", plan.purchaseId);
    if (updateError) throw new Error(updateError.message);

    const { error: deleteAllocError } = await supabase.from("purchase_allocations").delete().eq("purchase_id", plan.purchaseId);
    if (deleteAllocError) throw new Error(deleteAllocError.message);

    const { error: insertAllocError } = await supabase.from("purchase_allocations").insert({
      purchase_id: plan.purchaseId,
      reporting_budget_line_id: plan.resolvedBudgetLineId,
      account_code_id: plan.bannerAccountCodeId || plan.budgetLineAccountCodeId,
      production_category_id: plan.nextProductionCategoryId,
      amount: plan.allocationAmount,
      reporting_bucket: "direct"
    });
    if (insertAllocError) throw new Error(insertAllocError.message);
  }

  revalidatePath("/requests");
  revalidatePath("/");
  const affectedProjectIds = new Set<string>(plans.flatMap((plan) => [plan.oldProjectId, plan.nextProjectId]));
  for (const projectId of affectedProjectIds) {
    revalidatePath(`/projects/${projectId}`);
  }
}

export async function bulkDeleteRequestsAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const purchaseIds = parseIdsJson(formData.get("selectedIdsJson"));
  if (purchaseIds.length === 0) throw new Error("Select at least one request.");

  const { data: purchases, error: purchasesError } = await supabase
    .from("purchases")
    .select("id, project_id")
    .in("id", purchaseIds);
  if (purchasesError) throw new Error(purchasesError.message);
  if (!purchases || purchases.length !== purchaseIds.length) throw new Error("Some selected requests were not found.");

  const projectIds = [...new Set(purchases.map((row) => row.project_id as string))];
  const { data: memberships, error: membershipError } = await supabase
    .from("project_memberships")
    .select("project_id, role")
    .eq("user_id", user.id)
    .in("project_id", projectIds);
  if (membershipError) throw new Error(membershipError.message);

  const membershipByProject = new Map((memberships ?? []).map((row) => [row.project_id as string, row.role as string]));
  for (const projectId of projectIds) {
    const role = membershipByProject.get(projectId);
    if (role !== "admin") throw new Error("Only Admin can bulk delete selected requests.");
  }

  const { error: deleteError } = await supabase.from("purchases").delete().in("id", purchaseIds);
  if (deleteError) throw new Error(deleteError.message);

  revalidatePath("/requests");
  revalidatePath("/");
  for (const projectId of projectIds) {
    revalidatePath(`/projects/${projectId}`);
  }
}
