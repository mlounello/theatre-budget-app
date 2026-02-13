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

const CC_PROCUREMENT_STATUSES = ["requested", "receipts_uploaded", "statement_paid", "posted_to_account", "cancelled"] as const;

type ProcurementStatus = (typeof PROCUREMENT_STATUSES)[number] | (typeof CC_PROCUREMENT_STATUSES)[number];

function getStatusAmount(
  status: string | null | undefined,
  amounts: {
    estimated: number;
    requested: number;
    encumbered: number;
    pendingCc: number;
    posted: number;
  }
): number {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "posted") return amounts.posted;
  if (normalized === "pending_cc") return amounts.pendingCc;
  if (normalized === "encumbered") return amounts.encumbered;
  if (normalized === "requested") return amounts.requested !== 0 ? amounts.requested : amounts.estimated;
  return amounts.estimated !== 0 ? amounts.estimated : amounts.requested !== 0 ? amounts.requested : amounts.posted;
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

function parseStatus(value: FormDataEntryValue | null, isCreditCardPurchase: boolean): ProcurementStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  const allowed = new Set<string>(isCreditCardPurchase ? CC_PROCUREMENT_STATUSES : PROCUREMENT_STATUSES);
  if (allowed.has(normalized)) {
    return normalized as ProcurementStatus;
  }
  return "requested";
}

function toBudgetStatus(procurementStatus: ProcurementStatus, isCreditCardPurchase: boolean): PurchaseStatus {
  if (isCreditCardPurchase) {
    if (procurementStatus === "posted_to_account") return "posted";
    if (procurementStatus === "cancelled") return "cancelled";
    return "pending_cc";
  }
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

function isExternalProcurementProjectName(name: string | null | undefined): boolean {
  return String(name ?? "")
    .trim()
    .toLowerCase() === "external procurement";
}

async function getProjectMeta(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  projectId: string
): Promise<{ id: string; name: string; isExternal: boolean }> {
  const { data, error } = await supabase.from("projects").select("id, name").eq("id", projectId).single();
  if (error || !data) throw new Error("Project not found.");
  const name = data.name as string;
  return { id: data.id as string, name, isExternal: isExternalProcurementProjectName(name) };
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
  if (role && ["admin", "project_manager", "buyer"].includes(role)) return;

  const projectMeta = await getProjectMeta(supabase, projectId);
  if (!projectMeta.isExternal) {
    throw new Error("You do not have permission to create purchases for this project.");
  }

  const { data: elevated, error: elevatedError } = await supabase
    .from("project_memberships")
    .select("project_id")
    .eq("user_id", userId)
    .in("role", ["admin", "project_manager", "buyer"])
    .limit(1);
  if (elevatedError) throw new Error(elevatedError.message);
  if (!elevated || elevated.length === 0) throw new Error("You do not have permission to create purchases for this project.");
}

async function ensureProjectPmOrAdminAccess(
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
  if (!role || !["admin", "project_manager"].includes(role)) {
    throw new Error("Only Admin or Project Manager can edit procurement rows.");
  }
}

async function ensureProjectAdminAccess(
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
  if (role !== "admin") {
    throw new Error("Only Admin can delete procurement rows.");
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
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const orderValueRaw = String(formData.get("orderValue") ?? "").trim();
    const orderValue = parseMoney(formData.get("orderValue"));
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const requisitionNumber = String(formData.get("requisitionNumber") ?? "").trim();
    const poNumber = String(formData.get("poNumber") ?? "").trim();
    const vendorId = String(formData.get("vendorId") ?? "").trim();

    if (!projectId || !title) throw new Error("Project and title are required.");
    if (orderValueRaw === "" || orderValue === 0) throw new Error("Order value must be non-zero.");
    await ensureProjectCreateAccess(supabase, user.id, projectId);
    const projectMeta = await getProjectMeta(supabase, projectId);
    const budgetTracked = !projectMeta.isExternal;
    if (budgetTracked && !productionCategoryId) throw new Error("Department is required.");

    let line: { id: string; project_id: string; account_code_id: string | null } | null = null;
    if (budgetTracked) {
      let resolvedBudgetLineId = budgetLineId;
      if (!resolvedBudgetLineId) {
        const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
          p_project_id: projectId,
          p_production_category_id: productionCategoryId
        });
        if (ensureLineError || !ensuredLineId) throw new Error(ensureLineError?.message ?? "Could not resolve reporting line.");
        resolvedBudgetLineId = ensuredLineId as string;
      }
      const { data: lineData, error: lineError } = await supabase
        .from("project_budget_lines")
        .select("id, project_id, account_code_id")
        .eq("id", resolvedBudgetLineId)
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
        production_category_id: productionCategoryId || null,
        banner_account_code_id: bannerAccountCodeId || null,
        budget_tracked: budgetTracked,
        entered_by_user_id: user.id,
        title,
        reference_number: referenceNumber || null,
        requisition_number: requisitionNumber || null,
        po_number: poNumber || null,
        vendor_id: vendorId || null,
        estimated_amount: orderValue,
        requested_amount: orderValue,
        request_type: "requisition",
        is_credit_card: false,
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
          account_code_id: bannerAccountCodeId || line.account_code_id,
          production_category_id: productionCategoryId,
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

type BatchProcurementLine = {
  title: string;
  requisitionNumber: string | null;
  poNumber: string | null;
  amount: number;
  entryType: "requisition" | "cc";
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
        poNumber: String((entry as { poNumber?: unknown }).poNumber ?? "").trim() || null,
        amount: Number.parseFloat(String((entry as { amount?: unknown }).amount ?? "0")),
        entryType: String((entry as { entryType?: unknown }).entryType ?? "").trim().toLowerCase() === "cc" ? "cc" : "requisition"
      }))
      .filter((line) => line.title && Number.isFinite(line.amount) && line.amount !== 0);
  } catch {
    return [];
  }
}

export async function createProcurementBatchAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const lines = parseBatchLinesJson(formData.get("linesJson"));

    if (!projectId) throw new Error("Project is required.");
    if (lines.length === 0) throw new Error("Add at least one valid line (title + non-zero amount).");

    await ensureProjectCreateAccess(supabase, user.id, projectId);
    const projectMeta = await getProjectMeta(supabase, projectId);
    const budgetTracked = !projectMeta.isExternal;
    if (budgetTracked && !productionCategoryId) throw new Error("Department is required.");

    let line: { id: string; account_code_id: string | null } | null = null;
    if (budgetTracked) {
      const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
        p_project_id: projectId,
        p_production_category_id: productionCategoryId
      });
      if (ensureLineError || !ensuredLineId) throw new Error(ensureLineError?.message ?? "Could not resolve reporting line.");

      const { data: lineData, error: lineError } = await supabase
        .from("project_budget_lines")
        .select("id, project_id, account_code_id")
        .eq("id", ensuredLineId as string)
        .single();
      if (lineError || !lineData) throw new Error("Invalid budget line.");
      if ((lineData.project_id as string) !== projectId) throw new Error("Budget line must belong to selected project.");
      line = {
        id: lineData.id as string,
        account_code_id: (lineData.account_code_id as string | null) ?? null
      };
    }

    // Prevalidate row-level details before writes.
    for (const entry of lines) {
      if (!entry.title) throw new Error("Each line needs a title.");
      if (!Number.isFinite(entry.amount) || entry.amount === 0) throw new Error("Each line amount must be non-zero.");
      if (entry.entryType !== "requisition" && entry.entryType !== "cc") throw new Error("Invalid line type.");
    }

    const createdPurchaseIds: string[] = [];
    for (const entry of lines) {
      const isCc = entry.entryType === "cc";
      const toStatus: PurchaseStatus = isCc ? "pending_cc" : "requested";
      const requisitionNumber = entry.requisitionNumber;
      const poNumber = entry.poNumber;

      const { data: purchase, error: insertError } = await supabase
        .from("purchases")
        .insert({
          project_id: projectId,
          budget_line_id: line?.id ?? null,
          production_category_id: productionCategoryId || null,
          banner_account_code_id: bannerAccountCodeId || null,
          budget_tracked: budgetTracked,
          entered_by_user_id: user.id,
          title: entry.title,
          reference_number: null,
          requisition_number: requisitionNumber,
          po_number: poNumber,
          estimated_amount: entry.amount,
          requested_amount: isCc ? 0 : entry.amount,
          encumbered_amount: 0,
          pending_cc_amount: isCc ? entry.amount : 0,
          posted_amount: 0,
          request_type: isCc ? "expense" : "requisition",
          is_credit_card: isCc,
          cc_workflow_status: isCc ? "requested" : null,
          status: toStatus,
          procurement_status: "requested"
        })
        .select("id")
        .single();

      if (insertError || !purchase) {
        throw new Error(insertError?.message ?? "Failed creating one of the batch rows.");
      }
      createdPurchaseIds.push(purchase.id as string);

      if (budgetTracked && line) {
        const { error: allocationError } = await supabase.from("purchase_allocations").insert({
          purchase_id: purchase.id,
          reporting_budget_line_id: line.id,
          account_code_id: bannerAccountCodeId || line.account_code_id,
          production_category_id: productionCategoryId,
          amount: entry.amount,
          reporting_bucket: "direct"
        });
        if (allocationError) throw new Error(allocationError.message);
      }

      const { error: eventError } = await supabase.from("purchase_events").insert({
        purchase_id: purchase.id,
        from_status: null,
        to_status: toStatus,
        estimated_amount_snapshot: entry.amount,
        requested_amount_snapshot: isCc ? 0 : entry.amount,
        encumbered_amount_snapshot: 0,
        pending_cc_amount_snapshot: isCc ? entry.amount : 0,
        posted_amount_snapshot: 0,
        changed_by_user_id: user.id,
        note: isCc ? "Batch created credit-card entry" : "Batch created requisition entry"
      });
      if (eventError) throw new Error(eventError.message);
    }

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    revalidatePath(`/projects/${projectId}`);
    ok(`Batch added (${createdPurchaseIds.length} rows).`);
  } catch (error) {
    rethrowIfRedirect(error);
    fail(getErrorMessage(error, "Could not create batch orders."));
  }
}

export async function updateProcurementAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("id") ?? "").trim();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const requestedBudgetTracked = formData.get("budgetTracked") === "on";
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
    const orderValueRaw = String(formData.get("orderValue") ?? "").trim();
    const orderValue = parseMoney(formData.get("orderValue"));

    if (!id) throw new Error("Purchase id is required.");

    const { data: existing, error: existingError } = await supabase
      .from("purchases")
      .select(
        "id, project_id, status, request_type, is_credit_card, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, budget_tracked, budget_line_id"
      )
      .eq("id", id)
      .single();
    if (existingError || !existing) throw new Error("Purchase not found.");
    const nextProjectId = projectId || (existing.project_id as string);
    const nextProjectMeta = await getProjectMeta(supabase, nextProjectId);
    const budgetTracked = nextProjectMeta.isExternal ? false : requestedBudgetTracked;

    const isCreditCardPurchase =
      (existing.request_type as string | null) === "expense" && Boolean(existing.is_credit_card as boolean | null);
    const procurementStatus = parseStatus(formData.get("procurementStatus"), isCreditCardPurchase);
    const existingOrderValue = getStatusAmount(existing.status as string, {
      estimated: Number(existing.estimated_amount ?? 0),
      requested: Number(existing.requested_amount ?? 0),
      encumbered: Number(existing.encumbered_amount ?? 0),
      pendingCc: Number(existing.pending_cc_amount ?? 0),
      posted: Number(existing.posted_amount ?? 0)
    });
    const nextRequested = orderValueRaw !== "" ? orderValue : existingOrderValue;
    const nextBudgetStatus = toBudgetStatus(procurementStatus, isCreditCardPurchase);
    const nextRequestedAmount = nextBudgetStatus === "requested" ? nextRequested : 0;
    const nextEncumberedAmount = nextBudgetStatus === "encumbered" ? nextRequested : 0;
    const nextPendingCcAmount = nextBudgetStatus === "pending_cc" ? nextRequested : 0;
    const nextPostedAmount = nextBudgetStatus === "posted" ? nextRequested : 0;
    const nextCcWorkflowStatus = isCreditCardPurchase
      ? procurementStatus === "posted_to_account"
        ? "posted_to_account"
        : procurementStatus === "statement_paid"
          ? "statement_paid"
          : procurementStatus === "receipts_uploaded"
            ? "receipts_uploaded"
            : "requested"
      : null;

    if (budgetTracked && !productionCategoryId) throw new Error("Department is required.");

    let verifiedBudgetLine: { id: string; account_code_id: string | null } | null = null;
    if (budgetTracked) {
      let resolvedBudgetLineId = budgetLineId;
      if (!resolvedBudgetLineId) {
        const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
          p_project_id: nextProjectId,
          p_production_category_id: productionCategoryId
        });
        if (ensureLineError || !ensuredLineId) throw new Error(ensureLineError?.message ?? "Could not resolve reporting line.");
        resolvedBudgetLineId = ensuredLineId as string;
      }
      const { data: line, error: lineError } = await supabase
        .from("project_budget_lines")
        .select("id, project_id, account_code_id")
        .eq("id", resolvedBudgetLineId)
        .single();
      if (lineError || !line) throw new Error("Invalid budget line.");
      if ((line.project_id as string) !== nextProjectId) {
        throw new Error("Budget line must belong to the selected project.");
      }
      verifiedBudgetLine = { id: line.id as string, account_code_id: (line.account_code_id as string | null) ?? null };
    }

    const { error } = await supabase
      .from("purchases")
      .update({
        project_id: nextProjectId,
        budget_tracked: budgetTracked,
        budget_line_id: budgetTracked ? verifiedBudgetLine?.id ?? budgetLineId : null,
        production_category_id: productionCategoryId || null,
        banner_account_code_id: bannerAccountCodeId || null,
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
        posted_date: nextBudgetStatus === "posted" ? paidOn || receivedOn || new Date().toISOString().slice(0, 10) : null,
        cc_workflow_status: nextCcWorkflowStatus
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    if (!budgetTracked) {
      const { error: deleteAllocationsError } = await supabase.from("purchase_allocations").delete().eq("purchase_id", id);
      if (deleteAllocationsError) throw new Error(deleteAllocationsError.message);
    } else {
      const { error: deleteAllocationsError } = await supabase.from("purchase_allocations").delete().eq("purchase_id", id);
      if (deleteAllocationsError) throw new Error(deleteAllocationsError.message);
      if (verifiedBudgetLine) {
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
          reporting_budget_line_id: verifiedBudgetLine.id,
          account_code_id: bannerAccountCodeId || verifiedBudgetLine.account_code_id,
          production_category_id: productionCategoryId,
          amount: allocationAmount,
          reporting_bucket: "direct"
        });
        if (createAllocationError) throw new Error(createAllocationError.message);
      }
    }

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    revalidatePath(`/projects/${existing.project_id as string}`);
    revalidatePath(`/projects/${nextProjectId}`);
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
      amount_received: amountReceived === 0 ? null : amountReceived,
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

export async function deleteProcurementAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const id = String(formData.get("id") ?? "").trim();
    if (!id) throw new Error("Purchase id is required.");

    const { data: row, error: rowError } = await supabase.from("purchases").select("id, project_id").eq("id", id).single();
    if (rowError || !row) throw new Error("Purchase not found.");
    await ensureProjectAdminAccess(supabase, user.id, row.project_id as string);

    const { error } = await supabase.from("purchases").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    revalidatePath(`/projects/${row.project_id as string}`);
    ok("Procurement row deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    fail(getErrorMessage(error, "Could not delete procurement row."));
  }
}

export async function bulkDeleteProcurementAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) throw new Error("Select at least one procurement row.");

    const { data: rows, error: rowsError } = await supabase.from("purchases").select("id, project_id").in("id", ids);
    if (rowsError) throw new Error(rowsError.message);
    if (!rows || rows.length !== ids.length) throw new Error("Some selected rows were not found.");

    const projectIds = Array.from(new Set(rows.map((row) => row.project_id as string)));
    for (const projectId of projectIds) {
      await ensureProjectAdminAccess(supabase, user.id, projectId);
    }

    const { error: deleteError } = await supabase.from("purchases").delete().in("id", ids);
    if (deleteError) throw new Error(deleteError.message);

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    for (const projectId of projectIds) {
      revalidatePath(`/projects/${projectId}`);
    }
    ok("Selected procurement rows deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    fail(getErrorMessage(error, "Could not delete selected procurement rows."));
  }
}

export async function bulkUpdateProcurementAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) throw new Error("Select at least one procurement row.");

    const applyProject = formData.get("applyProject") === "on";
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
      throw new Error("Choose at least one field to apply.");
    }

    const targetProjectId = String(formData.get("projectId") ?? "").trim();
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
        "id, project_id, budget_tracked, budget_line_id, production_category_id, banner_account_code_id, status, procurement_status, request_type, is_credit_card, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, reference_number, requisition_number, po_number, invoice_number, vendor_id, notes, ordered_on, received_on, paid_on"
      )
      .in("id", ids);
    if (rowsError) throw new Error(rowsError.message);
    if (!rows || rows.length !== ids.length) throw new Error("Some selected procurement rows were not found.");

    const existingProjectIds = Array.from(new Set(rows.map((row) => row.project_id as string)));
    for (const projectId of existingProjectIds) {
      await ensureProjectPmOrAdminAccess(supabase, user.id, projectId);
    }
    if (applyProject) {
      if (!targetProjectId) throw new Error("Project is required when applying project.");
      await ensureProjectPmOrAdminAccess(supabase, user.id, targetProjectId);
    }

    const projectIdsForMeta = new Set(existingProjectIds);
    if (applyProject && targetProjectId) projectIdsForMeta.add(targetProjectId);
    const { data: projectMetas, error: projectMetasError } = await supabase
      .from("projects")
      .select("id, name")
      .in("id", Array.from(projectIdsForMeta));
    if (projectMetasError) throw new Error(projectMetasError.message);
    const externalByProjectId = new Map<string, boolean>(
      ((projectMetas as Array<{ id?: unknown; name?: unknown }> | null) ?? []).map((row) => [
        row.id as string,
        isExternalProcurementProjectName(row.name as string)
      ])
    );

    // First pass: validate all target values before mutating any rows.
    for (const existing of rows) {
      const nextProjectId = applyProject ? targetProjectId : (existing.project_id as string);
      const nextProductionCategoryId = applyCategory
        ? targetProductionCategoryId
        : ((existing.production_category_id as string | null) ?? "");
      if (!nextProjectId) throw new Error("Project is required when applying project.");
      const nextProjectIsExternal = externalByProjectId.get(nextProjectId) ?? false;
      const budgetTracked = nextProjectIsExternal ? false : Boolean(existing.budget_tracked);
      if (budgetTracked && !nextProductionCategoryId) throw new Error("Department is required.");

      const isCreditCardPurchase =
        (existing.request_type as string | null) === "expense" && Boolean(existing.is_credit_card as boolean | null);
      parseStatus(applyProcurementStatus ? targetProcurementStatusRaw : (existing.procurement_status as string), isCreditCardPurchase);

      if (applyOrderValue && (targetOrderValueRaw === "" || targetOrderValue === 0)) {
        throw new Error("Order Value must be non-zero when applying order value.");
      }

      if (budgetTracked) {
        const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
          p_project_id: nextProjectId,
          p_production_category_id: nextProductionCategoryId
        });
        if (ensureLineError || !ensuredLineId) throw new Error(ensureLineError?.message ?? "Could not resolve reporting line.");

        const { data: line, error: lineError } = await supabase
          .from("project_budget_lines")
          .select("id, project_id")
          .eq("id", ensuredLineId as string)
          .single();
        if (lineError || !line) throw new Error("Invalid budget line.");
        if ((line.project_id as string) !== nextProjectId) throw new Error("Budget line must belong to selected project.");
      }
    }

    for (const existing of rows) {
      const rowId = existing.id as string;
      const nextProjectId = applyProject ? targetProjectId : (existing.project_id as string);
      const nextProductionCategoryId = applyCategory
        ? targetProductionCategoryId
        : ((existing.production_category_id as string | null) ?? "");
      if (!nextProjectId) throw new Error("Project is required when applying project.");
      const nextProjectIsExternal = externalByProjectId.get(nextProjectId) ?? false;
      const budgetTracked = nextProjectIsExternal ? false : Boolean(existing.budget_tracked);
      if (budgetTracked && !nextProductionCategoryId) throw new Error("Department is required.");

      const isCreditCardPurchase =
        (existing.request_type as string | null) === "expense" && Boolean(existing.is_credit_card as boolean | null);
      const nextProcurementStatus = applyProcurementStatus
        ? parseStatus(targetProcurementStatusRaw, isCreditCardPurchase)
        : parseStatus(existing.procurement_status as string, isCreditCardPurchase);

      const currentValue = getStatusAmount(existing.status as string, {
        estimated: Number(existing.estimated_amount ?? 0),
        requested: Number(existing.requested_amount ?? 0),
        encumbered: Number(existing.encumbered_amount ?? 0),
        pendingCc: Number(existing.pending_cc_amount ?? 0),
        posted: Number(existing.posted_amount ?? 0)
      });
      const nextValue = applyOrderValue ? targetOrderValue : currentValue;
      if (applyOrderValue && (targetOrderValueRaw === "" || targetOrderValue === 0)) {
        throw new Error("Order Value must be non-zero when applying order value.");
      }

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

      let verifiedBudgetLine: { id: string; account_code_id: string | null } | null = null;
      if (budgetTracked) {
        const { data: ensuredLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
          p_project_id: nextProjectId,
          p_production_category_id: nextProductionCategoryId
        });
        if (ensureLineError || !ensuredLineId) throw new Error(ensureLineError?.message ?? "Could not resolve reporting line.");
        const { data: line, error: lineError } = await supabase
          .from("project_budget_lines")
          .select("id, project_id, account_code_id")
          .eq("id", ensuredLineId as string)
          .single();
        if (lineError || !line) throw new Error("Invalid budget line.");
        if ((line.project_id as string) !== nextProjectId) throw new Error("Budget line must belong to selected project.");
        verifiedBudgetLine = { id: line.id as string, account_code_id: (line.account_code_id as string | null) ?? null };
      }

      const nextBannerAccountCodeId = applyBanner
        ? targetBannerAccountCodeId || null
        : ((existing.banner_account_code_id as string | null) ?? null);
      const nextReceivedOn = applyReceivedOn ? targetReceivedOn || null : ((existing.received_on as string | null) ?? null);
      const nextPaidOn = applyPaidOn ? targetPaidOn || null : ((existing.paid_on as string | null) ?? null);

      const { error: updateError } = await supabase
        .from("purchases")
        .update({
          project_id: nextProjectId,
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
          ordered_on: applyOrderedOn ? targetOrderedOn || null : ((existing.ordered_on as string | null) ?? null),
          received_on: nextReceivedOn,
          paid_on: nextPaidOn,
          estimated_amount: nextValue,
          requested_amount: nextRequestedAmount,
          encumbered_amount: nextEncumberedAmount,
          pending_cc_amount: nextPendingCcAmount,
          posted_amount: nextPostedAmount,
          posted_date: nextBudgetStatus === "posted" ? nextPaidOn || nextReceivedOn || new Date().toISOString().slice(0, 10) : null,
          cc_workflow_status: nextCcWorkflowStatus
        })
        .eq("id", rowId);
      if (updateError) throw new Error(updateError.message);

      const { error: deleteAllocError } = await supabase.from("purchase_allocations").delete().eq("purchase_id", rowId);
      if (deleteAllocError) throw new Error(deleteAllocError.message);
      if (budgetTracked && verifiedBudgetLine) {
        const allocationAmount =
          nextBudgetStatus === "encumbered"
            ? nextEncumberedAmount
            : nextBudgetStatus === "pending_cc"
              ? nextPendingCcAmount
              : nextBudgetStatus === "posted"
                ? nextPostedAmount
                : nextRequestedAmount;
        const { error: insertAllocError } = await supabase.from("purchase_allocations").insert({
          purchase_id: rowId,
          reporting_budget_line_id: verifiedBudgetLine.id,
          account_code_id: nextBannerAccountCodeId || verifiedBudgetLine.account_code_id,
          production_category_id: nextProductionCategoryId,
          amount: allocationAmount,
          reporting_bucket: "direct"
        });
        if (insertAllocError) throw new Error(insertAllocError.message);
      }
    }

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    for (const projectId of existingProjectIds) {
      revalidatePath(`/projects/${projectId}`);
    }
    ok("Bulk procurement update saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    fail(getErrorMessage(error, "Could not bulk update procurement rows."));
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
