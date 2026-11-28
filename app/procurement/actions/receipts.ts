"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { type ActionState, emptyState, ok, err, getErrorMessage, parseMoney } from "@/lib/action-helpers";
import { ensurePurchasePmOrAdminAccess } from "@/app/procurement/actions/_shared";

async function getPurchaseIdForReceivingDoc(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  docId: string
): Promise<string> {
  const { data, error } = await supabase.from("purchase_receiving_docs").select("id, purchase_id").eq("id", docId).single();
  if (error || !data) throw new Error("Receiving doc not found.");
  return data.purchase_id as string;
}

async function getPurchaseIdForReceipt(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  receiptId: string
): Promise<string> {
  const { data, error } = await supabase.from("purchase_receipts").select("id, purchase_id").eq("id", receiptId).single();
  if (error || !data) throw new Error("Receipt not found.");
  return data.purchase_id as string;
}

export async function addProcurementReceiptAction(
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
    const note = String(formData.get("note") ?? "").trim();
    const amountReceived = parseMoney(formData.get("amountReceived"));
    const attachmentUrl = String(formData.get("attachmentUrl") ?? "").trim();
    const fullyReceived = formData.get("fullyReceived") === "on";
    const receiptDate = String(formData.get("receiptDate") ?? "").trim();
    const chargeTo = String(formData.get("chargeTo") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const accountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();

    if (!purchaseId) return err("Purchase is required.");
    await ensurePurchasePmOrAdminAccess(supabase, user.id, purchaseId);

    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, request_type, is_credit_card, expense_stage, project_id, organization_id, production_category_id, banner_account_code_id")
      .eq("id", purchaseId)
      .single();
    if (purchaseError || !purchase) return err("Purchase could not be found.");
    const isCardExpense = purchase.request_type === "expense" && Boolean(purchase.is_credit_card);
    const [scopeType, scopeId] = chargeTo.split(":");
    const projectId = scopeType === "project" ? scopeId : isCardExpense ? "" : String(purchase.project_id ?? "");
    const organizationId = scopeType === "organization" ? scopeId : projectId ? "" : isCardExpense ? "" : String(purchase.organization_id ?? "");
    if (isCardExpense) {
      if (!note) return err("Receipt description is required.");
      if (amountReceived === 0) return err("Receipt amount must be non-zero. Use a negative amount for a return or credit.");
      if (!receiptDate) return err("Receipt date is required.");
      if (!projectId && !organizationId) return err("Choose the budget this receipt should charge.");
      if (projectId && !productionCategoryId) return err("Choose a Production Category for this receipt.");
      if (!accountCodeId) return err("Choose a Banner account / FOAP for this receipt.");
    }

    const { error } = await supabase.from("purchase_receipts").insert({
      purchase_id: purchaseId,
      note: note || null,
      amount_received: amountReceived === 0 ? null : amountReceived,
      fully_received: fullyReceived,
      attachment_url: attachmentUrl || null,
      created_by_user_id: user.id,
      receipt_date: receiptDate || null,
      project_id: projectId || null,
      organization_id: organizationId || null,
      production_category_id: projectId ? productionCategoryId || null : null,
      account_code_id: accountCodeId || (purchase.banner_account_code_id as string | null) || null,
      authorization_purchase_id: purchase.expense_stage === "authorization" || purchase.expense_stage === "employee_card" ? purchaseId : null
    });
    if (error) return err(error.message);

    if (purchase.expense_stage === "employee_card") {
      const { error: statusError } = await supabase
        .from("purchases")
        .update({
          procurement_status: "receipts_uploaded",
          cc_workflow_status: "receipts_uploaded"
        })
        .eq("id", purchaseId)
        .eq("procurement_status", "requested");
      if (statusError) return err(statusError.message);
    }

    revalidatePath("/procurement");
    revalidatePath("/cc");
    revalidatePath("/");
    return ok("Receipt log added.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not add receipt log."));
  }
}

export async function addProcurementReceivingDocAction(
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
    const docCode = String(formData.get("docCode") ?? "").trim();
    const receivedOn = String(formData.get("receivedOn") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();

    if (!purchaseId) return err("Purchase is required.");
    await ensurePurchasePmOrAdminAccess(supabase, user.id, purchaseId);
    if (!docCode) return err("Receiving document code is required.");

    const { error } = await supabase.from("purchase_receiving_docs").insert({
      purchase_id: purchaseId,
      doc_code: docCode,
      received_on: receivedOn || null,
      note: note || null,
      created_by_user_id: user.id
    });
    if (error) return err(error.message);

    revalidatePath("/procurement");
    return ok("Receiving doc added.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not add receiving doc."));
  }
}

export async function deleteProcurementReceivingDocAction(
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
    if (!id) return err("Receiving doc id is required.");
    const purchaseId = await getPurchaseIdForReceivingDoc(supabase, id);
    await ensurePurchasePmOrAdminAccess(supabase, user.id, purchaseId);

    const { error } = await supabase.from("purchase_receiving_docs").delete().eq("id", id);
    if (error) return err(error.message);

    revalidatePath("/procurement");
    return ok("Receiving doc deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete receiving doc."));
  }
}

export async function deleteProcurementReceiptAction(
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
    if (!id) return err("Receipt id is required.");
    const purchaseId = await getPurchaseIdForReceipt(supabase, id);
    await ensurePurchasePmOrAdminAccess(supabase, user.id, purchaseId);

    const { error } = await supabase.from("purchase_receipts").delete().eq("id", id);
    if (error) return err(error.message);

    const [{ data: purchase, error: purchaseError }, { count: remainingReceiptCount, error: receiptCountError }] = await Promise.all([
      supabase.from("purchases").select("expense_stage, procurement_status").eq("id", purchaseId).single(),
      supabase.from("purchase_receipts").select("id", { count: "exact", head: true }).eq("purchase_id", purchaseId)
    ]);
    if (purchaseError) return err(purchaseError.message);
    if (receiptCountError) return err(receiptCountError.message);
    if (purchase.expense_stage === "employee_card" && purchase.procurement_status === "receipts_uploaded" && (remainingReceiptCount ?? 0) === 0) {
      const { error: statusError } = await supabase
        .from("purchases")
        .update({
          procurement_status: "requested",
          cc_workflow_status: "requested"
        })
        .eq("id", purchaseId);
      if (statusError) return err(statusError.message);
    }

    revalidatePath("/procurement");
    revalidatePath("/cc");
    revalidatePath("/");
    return ok("Receipt log deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete receipt log."));
  }
}
