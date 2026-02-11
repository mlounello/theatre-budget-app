"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseStatus } from "@/lib/types";

const PROCUREMENT_STATUSES = [
  "requested",
  "ordered",
  "partial_received",
  "fully_received",
  "invoice_sent",
  "invoice_received",
  "paid",
  "cancelled"
] as const;

type ProcurementStatus = (typeof PROCUREMENT_STATUSES)[number];

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseStatus(value: FormDataEntryValue | null): ProcurementStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (PROCUREMENT_STATUSES.includes(normalized as ProcurementStatus)) {
    return normalized as ProcurementStatus;
  }
  return "requested";
}

function toBudgetStatus(procurementStatus: ProcurementStatus): PurchaseStatus {
  if (procurementStatus === "requested") return "requested";
  if (procurementStatus === "paid") return "posted";
  if (procurementStatus === "cancelled") return "cancelled";
  return "encumbered";
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

function rethrowIfRedirect(error: unknown): void {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : "";

  if (message.includes("NEXT_REDIRECT") || digest.includes("NEXT_REDIRECT")) {
    throw error;
  }
}

function ok(message: string): never {
  redirect(`/procurement?ok=${encodeURIComponent(message)}`);
}

function fail(message: string): never {
  redirect(`/procurement?error=${encodeURIComponent(message)}`);
}

async function ensureProjectCreateAccess(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  projectId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("project_memberships")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data?.role as string | undefined) ?? null;
  if (!role || !["admin", "project_manager", "buyer"].includes(role)) {
    throw new Error("You do not have permission to create purchases for this project.");
  }
}

export async function createProcurementOrderAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const budgetLineId = String(formData.get("budgetLineId") ?? "").trim();
    const budgetTracked = formData.get("budgetTracked") === "on";
    const title = String(formData.get("title") ?? "").trim();
    const orderValue = parseMoney(formData.get("orderValue"));
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const requisitionNumber = String(formData.get("requisitionNumber") ?? "").trim();
    const poNumber = String(formData.get("poNumber") ?? "").trim();
    const vendorId = String(formData.get("vendorId") ?? "").trim();

    if (!projectId || !title) throw new Error("Project and title are required.");
    if (orderValue <= 0) throw new Error("Order value must be greater than 0.");
    await ensureProjectCreateAccess(supabase, user.id, projectId);

    let line: { id: string; project_id: string; account_code_id: string | null } | null = null;
    if (budgetTracked) {
      if (!budgetLineId) throw new Error("Budget line is required when budget tracking is enabled.");
      const { data: lineData, error: lineError } = await supabase
        .from("project_budget_lines")
        .select("id, project_id, account_code_id")
        .eq("id", budgetLineId)
        .single();
      if (lineError || !lineData) throw new Error("Invalid budget line.");
      if ((lineData.project_id as string) !== projectId) throw new Error("Budget line must belong to the selected project.");
      line = {
        id: lineData.id as string,
        project_id: lineData.project_id as string,
        account_code_id: (lineData.account_code_id as string | null) ?? null
      };
    }

    const { data: purchase, error: insertError } = await supabase
      .from("purchases")
      .insert({
        project_id: projectId,
        budget_line_id: line?.id ?? null,
        budget_tracked: budgetTracked,
        entered_by_user_id: user.id,
        title,
        reference_number: referenceNumber || null,
        requisition_number: requisitionNumber || null,
        po_number: poNumber || null,
        vendor_id: vendorId || null,
        estimated_amount: orderValue,
        requested_amount: orderValue,
        status: "requested",
        procurement_status: "requested"
      })
      .select("id, project_id")
      .single();

    if (insertError || !purchase) {
      throw new Error(insertError?.message ?? "Unable to create procurement order.");
    }

    if (budgetTracked && line) {
      const { error: allocationError } = await supabase.from("purchase_allocations").insert({
        purchase_id: purchase.id,
        reporting_budget_line_id: line.id,
        account_code_id: line.account_code_id,
        amount: orderValue,
        reporting_bucket: "direct"
      });
      if (allocationError) throw new Error(allocationError.message);
    }

    const { error: eventError } = await supabase.from("purchase_events").insert({
      purchase_id: purchase.id,
      from_status: null,
      to_status: "requested",
      estimated_amount_snapshot: orderValue,
      requested_amount_snapshot: orderValue,
      encumbered_amount_snapshot: 0,
      pending_cc_amount_snapshot: 0,
      posted_amount_snapshot: 0,
      changed_by_user_id: user.id,
      note: "Procurement order created"
    });
    if (eventError) throw new Error(eventError.message);

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    revalidatePath(`/projects/${purchase.project_id as string}`);
    ok("Procurement order created.");
  } catch (error) {
    rethrowIfRedirect(error);
    fail(getErrorMessage(error, "Could not create procurement order."));
  }
}

export async function updateProcurementAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const procurementStatus = parseStatus(formData.get("procurementStatus"));
    const budgetTracked = formData.get("budgetTracked") === "on";
    const budgetLineId = String(formData.get("budgetLineId") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const requisitionNumber = String(formData.get("requisitionNumber") ?? "").trim();
    const poNumber = String(formData.get("poNumber") ?? "").trim();
    const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
    const vendorId = String(formData.get("vendorId") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const orderedOn = String(formData.get("orderedOn") ?? "").trim();
    const receivedOn = String(formData.get("receivedOn") ?? "").trim();
    const paidOn = String(formData.get("paidOn") ?? "").trim();
    const orderValue = parseMoney(formData.get("orderValue"));

    if (!id) throw new Error("Purchase id is required.");

    const { data: existing, error: existingError } = await supabase
      .from("purchases")
      .select("id, project_id, status, requested_amount, budget_tracked, budget_line_id")
      .eq("id", id)
      .single();
    if (existingError || !existing) throw new Error("Purchase not found.");

    const nextRequested = orderValue > 0 ? orderValue : Number(existing.requested_amount ?? 0);
    const nextBudgetStatus = toBudgetStatus(procurementStatus);
    const nextRequestedAmount = nextBudgetStatus === "requested" ? nextRequested : 0;
    const nextEncumberedAmount = nextBudgetStatus === "encumbered" ? nextRequested : 0;
    const nextPostedAmount = nextBudgetStatus === "posted" ? nextRequested : 0;
    const nextPendingCcAmount = 0;

    let verifiedBudgetLine: { id: string; account_code_id: string | null } | null = null;
    if (budgetTracked) {
      if (!budgetLineId) throw new Error("Budget line is required when budget tracking is enabled.");
      const { data: line, error: lineError } = await supabase
        .from("project_budget_lines")
        .select("id, project_id, account_code_id")
        .eq("id", budgetLineId)
        .single();
      if (lineError || !line) throw new Error("Invalid budget line.");
      if ((line.project_id as string) !== (existing.project_id as string)) {
        throw new Error("Budget line must belong to the same project.");
      }
      verifiedBudgetLine = { id: line.id as string, account_code_id: (line.account_code_id as string | null) ?? null };
    }

    const { error } = await supabase
      .from("purchases")
      .update({
        budget_tracked: budgetTracked,
        budget_line_id: budgetTracked ? verifiedBudgetLine?.id ?? budgetLineId : null,
        procurement_status: procurementStatus,
        status: nextBudgetStatus,
        reference_number: referenceNumber || null,
        requisition_number: requisitionNumber || null,
        po_number: poNumber || null,
        invoice_number: invoiceNumber || null,
        vendor_id: vendorId || null,
        notes: notes || null,
        ordered_on: orderedOn || null,
        received_on: receivedOn || null,
        paid_on: paidOn || null,
        estimated_amount: nextRequested,
        requested_amount: nextRequestedAmount,
        encumbered_amount: nextEncumberedAmount,
        pending_cc_amount: nextPendingCcAmount,
        posted_amount: nextPostedAmount,
        posted_date: nextBudgetStatus === "posted" ? paidOn || receivedOn || new Date().toISOString().slice(0, 10) : null
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    if (!budgetTracked) {
      const { error: deleteAllocationsError } = await supabase.from("purchase_allocations").delete().eq("purchase_id", id);
      if (deleteAllocationsError) throw new Error(deleteAllocationsError.message);
    } else {
      const { data: currentAllocations, error: currentAllocationsError } = await supabase
        .from("purchase_allocations")
        .select("id")
        .eq("purchase_id", id);
      if (currentAllocationsError) throw new Error(currentAllocationsError.message);

      if ((currentAllocations ?? []).length === 0 && verifiedBudgetLine) {
        const { error: createAllocationError } = await supabase.from("purchase_allocations").insert({
          purchase_id: id,
          reporting_budget_line_id: verifiedBudgetLine.id,
          account_code_id: verifiedBudgetLine.account_code_id,
          amount: nextRequested,
          reporting_bucket: "direct"
        });
        if (createAllocationError) throw new Error(createAllocationError.message);
      }
    }

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    revalidatePath(`/projects/${existing.project_id as string}`);
    ok("Procurement details updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    fail(getErrorMessage(error, "Could not update procurement details."));
  }
}

export async function addProcurementReceiptAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const amountReceived = parseMoney(formData.get("amountReceived"));
    const attachmentUrl = String(formData.get("attachmentUrl") ?? "").trim();
    const fullyReceived = formData.get("fullyReceived") === "on";

    if (!purchaseId) throw new Error("Purchase is required.");

    const { error } = await supabase.from("purchase_receipts").insert({
      purchase_id: purchaseId,
      note: note || null,
      amount_received: amountReceived > 0 ? amountReceived : null,
      fully_received: fullyReceived,
      attachment_url: attachmentUrl || null,
      created_by_user_id: user.id
    });
    if (error) throw new Error(error.message);

    revalidatePath("/procurement");
    ok("Receipt log added.");
  } catch (error) {
    rethrowIfRedirect(error);
    fail(getErrorMessage(error, "Could not add receipt log."));
  }
}

export async function deleteProcurementReceiptAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) throw new Error("Receipt id is required.");

    const { error } = await supabase.from("purchase_receipts").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/procurement");
    ok("Receipt log deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    fail(getErrorMessage(error, "Could not delete receipt log."));
  }
}

export async function createVendorAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const { data: membership, error: membershipError } = await supabase
      .from("project_memberships")
      .select("id")
      .eq("user_id", user.id)
      .in("role", ["admin", "project_manager"])
      .limit(1);
    if (membershipError) throw new Error(membershipError.message);
    if ((membership ?? []).length === 0) {
      throw new Error("Only Admin or Project Manager can add vendors.");
    }

    const name = String(formData.get("name") ?? "").trim();
    if (!name) throw new Error("Vendor name is required.");

    const { error } = await supabase.from("vendors").upsert({ name }, { onConflict: "name" });
    if (error) throw new Error(error.message);

    revalidatePath("/procurement");
    revalidatePath("/requests");
    ok("Vendor saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    fail(getErrorMessage(error, "Could not save vendor."));
  }
}
