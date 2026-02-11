"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseStatus } from "@/lib/types";

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

  const budgetLineId = String(formData.get("budgetLineId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
  const estimatedAmount = parseMoney(formData.get("estimatedAmount"));
  const requestedAmount = parseMoney(formData.get("requestedAmount"));
  const allocationsJson = String(formData.get("allocationsJson") ?? "").trim();

  if (!budgetLineId || !title) {
    throw new Error("Budget line and title are required.");
  }

  const { data: budgetLine, error: budgetLineError } = await supabase
    .from("project_budget_lines")
    .select("id, project_id")
    .eq("id", budgetLineId)
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

  const { data: inserted, error } = await supabase
    .from("purchases")
    .insert({
      project_id: budgetLine.project_id,
      budget_line_id: budgetLine.id,
      entered_by_user_id: user.id,
      title,
      reference_number: referenceNumber || null,
      estimated_amount: estimatedAmount,
      requested_amount: requestedTotal,
      status: "requested"
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
      account_code_id: lineWithCode.account_code_id,
      amount: requestedTotal,
      reporting_bucket: "direct"
    });
    if (allocationError) throw new Error(allocationError.message);
  }

  const eventError = await supabase.from("purchase_events").insert({
    purchase_id: inserted.id,
    from_status: null,
    to_status: "requested",
    estimated_amount_snapshot: estimatedAmount,
    requested_amount_snapshot: requestedTotal,
    encumbered_amount_snapshot: 0,
    pending_cc_amount_snapshot: 0,
    posted_amount_snapshot: 0,
    changed_by_user_id: user.id,
    note: "Request created"
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
    posted_date: status === "posted" ? new Date().toISOString().slice(0, 10) : null
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
  if (amount <= 0) throw new Error("Receipt amount must be greater than 0.");

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, project_id")
    .eq("id", purchaseId)
    .single();
  if (purchaseError || !purchase) throw new Error("Purchase not found.");

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
    .select("id, project_id, status, estimated_amount, requested_amount")
    .eq("id", purchaseId)
    .single();
  if (purchaseError || !purchase) throw new Error("Purchase not found.");

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
  if (reconciledTotal <= 0) throw new Error("Add at least one receipt amount before reconciling to Pending CC.");

  const { error: updateError } = await supabase
    .from("purchases")
    .update({
      status: "pending_cc",
      encumbered_amount: 0,
      pending_cc_amount: reconciledTotal,
      posted_amount: 0
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
