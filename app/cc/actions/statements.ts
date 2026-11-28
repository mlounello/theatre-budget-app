"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import { type ActionState, emptyState, ok, err, getErrorMessage } from "@/lib/action-helpers";
import { requireCcManagerRole } from "@/app/cc/actions/_shared";

async function syncEmployeeCardSourceWorkflow(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  statementMonthId: string,
  workflowStatus: "receipts_uploaded" | "statement_paid" | "posted_to_account"
): Promise<void> {
  const [{ data: receiptRows, error: receiptError }, { data: directlyLinkedRows, error: directlyLinkedError }] = await Promise.all([
    supabase
      .from("purchase_receipts")
      .select("authorization_purchase_id, purchase_id")
      .eq("cc_statement_month_id", statementMonthId)
      .or("authorization_purchase_id.not.is.null,purchase_id.not.is.null"),
    supabase
      .from("purchases")
      .select("id")
      .eq("cc_statement_month_id", statementMonthId)
      .eq("expense_stage", "employee_card")
  ]);
  if (receiptError) throw new Error(receiptError.message);
  if (directlyLinkedError) throw new Error(directlyLinkedError.message);

  const candidateIds = Array.from(new Set([
    ...(receiptRows ?? []).map((row) => String(row.authorization_purchase_id ?? "").trim()),
    ...(receiptRows ?? []).map((row) => String(row.purchase_id ?? "").trim()),
    ...(directlyLinkedRows ?? []).map((row) => String(row.id ?? "").trim())
  ].filter(Boolean)));
  if (candidateIds.length === 0) return;

  const { data: employeeCardRows, error: employeeCardError } = await supabase
    .from("purchases")
    .select("id")
    .in("id", candidateIds)
    .eq("expense_stage", "employee_card");
  if (employeeCardError) throw new Error(employeeCardError.message);
  const employeeCardIds = (employeeCardRows ?? []).map((row) => String(row.id));
  if (employeeCardIds.length === 0) return;

  const { error: updateError } = await supabase
    .from("purchases")
    .update({
      cc_workflow_status: workflowStatus,
      procurement_status: workflowStatus
    })
    .in("id", employeeCardIds);
  if (updateError) throw new Error(updateError.message);
}

async function getStatementMonthLinkedPurchaseTotals(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  statementMonthId: string
): Promise<{ totalsByPurchaseId: Map<string, number>; hasStatementLines: boolean }> {
  const { data: receiptRows, error: receiptError } = await supabase
    .from("purchase_receipts")
    .select("purchase_id, amount_received")
    .eq("cc_statement_month_id", statementMonthId);
  if (receiptError) throw new Error(receiptError.message);

  const totalsByPurchaseId = new Map<string, number>();
  for (const row of receiptRows ?? []) {
    const purchaseId = String(row.purchase_id ?? "").trim();
    if (!purchaseId) continue;
    const amount = Number(row.amount_received ?? 0);
    totalsByPurchaseId.set(purchaseId, (totalsByPurchaseId.get(purchaseId) ?? 0) + (Number.isFinite(amount) ? amount : 0));
  }
  if (totalsByPurchaseId.size > 0) {
    return { totalsByPurchaseId, hasStatementLines: false };
  }

  const { data: directlyLinkedPurchases, error: directlyLinkedPurchasesError } = await supabase
    .from("purchases")
    .select("id, status, pending_cc_amount, posted_amount")
    .eq("cc_statement_month_id", statementMonthId);
  if (directlyLinkedPurchasesError) throw new Error(directlyLinkedPurchasesError.message);

  for (const purchase of directlyLinkedPurchases ?? []) {
    const purchaseId = String(purchase.id ?? "").trim();
    if (!purchaseId) continue;
    const amount =
      String(purchase.status ?? "") === "posted"
        ? Number(purchase.posted_amount ?? 0)
        : Number(purchase.pending_cc_amount ?? 0) || Number(purchase.posted_amount ?? 0);
    totalsByPurchaseId.set(purchaseId, Number.isFinite(amount) ? amount : 0);
  }
  if (totalsByPurchaseId.size > 0) {
    return { totalsByPurchaseId, hasStatementLines: false };
  }

  const { data: statementLines, error: statementLinesError } = await supabase
    .from("cc_statement_lines")
    .select("matched_purchase_ids")
    .eq("statement_month_id", statementMonthId);
  if (statementLinesError) throw new Error(statementLinesError.message);

  const matchedPurchaseIds = Array.from(
    new Set(
      (statementLines ?? []).flatMap((row) =>
        Array.isArray(row.matched_purchase_ids)
          ? row.matched_purchase_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
          : []
      )
    )
  );
  const hasStatementLines = (statementLines ?? []).length > 0;
  if (matchedPurchaseIds.length === 0) {
    return { totalsByPurchaseId, hasStatementLines };
  }

  const { data: matchedPurchases, error: matchedPurchasesError } = await supabase
    .from("purchases")
    .select("id, status, pending_cc_amount, posted_amount")
    .in("id", matchedPurchaseIds);
  if (matchedPurchasesError) throw new Error(matchedPurchasesError.message);

  for (const purchase of matchedPurchases ?? []) {
    const purchaseId = String(purchase.id ?? "").trim();
    if (!purchaseId) continue;
    const amount =
      String(purchase.status ?? "") === "posted"
        ? Number(purchase.posted_amount ?? 0)
        : Number(purchase.pending_cc_amount ?? 0) || Number(purchase.posted_amount ?? 0);
    totalsByPurchaseId.set(purchaseId, Number.isFinite(amount) ? amount : 0);
  }

  return { totalsByPurchaseId, hasStatementLines };
}

export async function submitStatementMonthAction(
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
    await requireCcManagerRole();

    const statementMonthId = String(formData.get("statementMonthId") ?? "").trim();
    if (!statementMonthId) return err("Statement month is required.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id, statement_month, posted_at")
      .eq("id", statementMonthId)
      .single();
    if (statementMonthError || !statementMonth) return err("Statement month not found.");
    if (statementMonth.posted_at) return err("Statement month is already submitted.");

    const { data: receipts, error: receiptsError } = await supabase
      .from("purchase_receipts")
      .select("id, amount_received, purchase_id, purchases!purchase_receipts_purchase_id_fkey!inner(id, project_id, status, estimated_amount, requested_amount, pending_cc_amount, request_type, is_credit_card)")
      .eq("cc_statement_month_id", statementMonthId);
    if (receiptsError) return err(receiptsError.message);
    if (!receipts || receipts.length === 0) return err("No receipts assigned to this statement month.");

    const purchaseIds = Array.from(
      new Set(
        receipts
          .map((receipt) => {
            const purchase = receipt.purchases as { id?: string } | null;
            return (purchase?.id as string | undefined) ?? null;
          })
          .filter((value): value is string => Boolean(value))
      )
    );

    const { data: purchases, error: purchasesError } = await supabase
      .from("purchases")
      .select("id, status, estimated_amount, requested_amount, pending_cc_amount, request_type, is_credit_card")
      .in("id", purchaseIds);
    if (purchasesError) return err(purchasesError.message);
    if (!purchases || purchases.length === 0) return err("No purchases found for assigned receipts.");

    for (const purchase of purchases) {
      if ((purchase.request_type as string) !== "expense" || !Boolean(purchase.is_credit_card as boolean | null)) continue;
      if ((purchase.status as string) !== "pending_cc") continue;
      const pendingAmount = Number(purchase.pending_cc_amount ?? 0);
      const { error: updateError } = await supabase
        .from("purchases")
        .update({
          cc_workflow_status: "statement_paid",
          procurement_status: "statement_paid"
        })
        .eq("id", purchase.id as string);
      if (updateError) return err(updateError.message);

      const { error: eventError } = await supabase.from("purchase_events").insert({
        purchase_id: purchase.id as string,
        from_status: "pending_cc",
        to_status: "pending_cc",
        estimated_amount_snapshot: Number(purchase.estimated_amount ?? 0),
        requested_amount_snapshot: Number(purchase.requested_amount ?? 0),
        encumbered_amount_snapshot: 0,
        pending_cc_amount_snapshot: pendingAmount,
        posted_amount_snapshot: 0,
        changed_by_user_id: user.id,
        note: `Statement paid ${(statementMonth.statement_month as string).slice(0, 7)}; awaiting accounts posting`
      });
      if (eventError) return err(eventError.message);

      await createInstitutionalCommitmentForPurchase(supabase, purchase.id as string, user.id);
    }

    const { data: monthUpdated, error: monthUpdateError } = await supabase
      .from("cc_statement_months")
      .update({ posted_at: new Date().toISOString(), posted_to_banner_at: null })
      .eq("id", statementMonthId)
      .select("id")
      .maybeSingle();
    if (monthUpdateError) return err(monthUpdateError.message);
    if (!monthUpdated?.id) return err("Statement month submit update was not applied.");

    await syncEmployeeCardSourceWorkflow(supabase, statementMonthId, "statement_paid");

    revalidatePath("/cc");
    revalidatePath("/requests");
    revalidatePath("/");
    return ok("Statement month submitted and linked receipts marked Statement Paid.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not submit statement month."));
  }
}

export async function reopenStatementMonthAction(
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
    await requireCcManagerRole();

    const statementMonthId = String(formData.get("statementMonthId") ?? "").trim();
    if (!statementMonthId) return err("Statement month is required.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id, posted_at, posted_to_banner_at, statement_month")
      .eq("id", statementMonthId)
      .single();
    if (statementMonthError || !statementMonth) return err("Statement month not found.");
    if (!statementMonth.posted_at) return err("Statement month is already open.");
    if (statementMonth.posted_to_banner_at) {
      return err("Statement month is already posted to Banner. Reopening is blocked to protect posted totals.");
    }

    const { data: receiptRows, error: receiptError } = await supabase
      .from("purchase_receipts")
      .select("purchase_id")
      .eq("cc_statement_month_id", statementMonthId);
    if (receiptError) return err(receiptError.message);

    const purchaseIds = Array.from(
      new Set((receiptRows ?? []).map((row) => String(row.purchase_id ?? "")).filter(Boolean))
    );

    if (purchaseIds.length > 0) {
      const { data: purchases, error: purchasesError } = await supabase
        .from("purchases")
        .select("id, status, request_type, is_credit_card")
        .in("id", purchaseIds);
      if (purchasesError) return err(purchasesError.message);

      for (const purchase of purchases ?? []) {
        const isCc = (purchase.request_type as string) === "expense" && Boolean(purchase.is_credit_card as boolean | null);
        if (!isCc) continue;
        if ((purchase.status as string) === "posted") {
          return err("One or more linked purchases are already posted. Reopen is blocked.");
        }
      }

      const { error: purchaseResetError } = await supabase
        .from("purchases")
        .update({ cc_workflow_status: "receipts_uploaded", procurement_status: "receipts_uploaded" })
        .in("id", purchaseIds);
      if (purchaseResetError) return err(purchaseResetError.message);
    }

    const { data: monthReset, error: monthResetError } = await supabase
      .from("cc_statement_months")
      .update({ posted_at: null, posted_to_banner_at: null })
      .eq("id", statementMonthId)
      .select("id")
      .maybeSingle();
    if (monthResetError) return err(monthResetError.message);
    if (!monthReset?.id) return err("Statement month reopen update was not applied.");

    await syncEmployeeCardSourceWorkflow(supabase, statementMonthId, "receipts_uploaded");

    revalidatePath("/cc");
    revalidatePath("/requests");
    return ok("Statement month reopened.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not reopen statement month."));
  }
}

export async function postStatementMonthToBannerAction(
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
    await requireCcManagerRole();

    const statementMonthId = String(formData.get("statementMonthId") ?? "").trim();
    if (!statementMonthId) return err("Statement month is required.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id, statement_month, posted_at, posted_to_banner_at")
      .eq("id", statementMonthId)
      .single();
    if (statementMonthError || !statementMonth) return err("Statement month not found.");
    if (!statementMonth.posted_at) return err("Submit statement as paid before posting to Banner.");
    if (statementMonth.posted_to_banner_at) return err("Statement month is already posted to Banner.");

    const { data: receiptRows, error: receiptError } = await supabase
      .from("purchase_receipts")
      .select("purchase_id, amount_received")
      .eq("cc_statement_month_id", statementMonthId);
    if (receiptError) return err(receiptError.message);
    if (!receiptRows || receiptRows.length === 0) return err("No receipts are linked to this statement month.");

    const totalsByPurchaseId = new Map<string, number>();
    for (const row of receiptRows) {
      const purchaseId = String(row.purchase_id ?? "").trim();
      if (!purchaseId) continue;
      const amount = Number(row.amount_received ?? 0);
      totalsByPurchaseId.set(purchaseId, (totalsByPurchaseId.get(purchaseId) ?? 0) + (Number.isFinite(amount) ? amount : 0));
    }
    const purchaseIds = [...totalsByPurchaseId.keys()];

    const { data: purchases, error: purchasesError } = await supabase
      .from("purchases")
      .select("id, project_id, status, estimated_amount, requested_amount, request_type, is_credit_card")
      .in("id", purchaseIds);
    if (purchasesError) return err(purchasesError.message);

    for (const purchase of purchases ?? []) {
      const isCc = (purchase.request_type as string) === "expense" && Boolean(purchase.is_credit_card as boolean | null);
      if (!isCc) continue;
      if ((purchase.status as string) !== "pending_cc") continue;
      const postedAmount = totalsByPurchaseId.get(purchase.id as string) ?? 0;

      const { error: updateError } = await supabase
        .from("purchases")
        .update({
          status: "posted",
          requested_amount: 0,
          encumbered_amount: 0,
          pending_cc_amount: 0,
          posted_amount: postedAmount,
          posted_date: new Date().toISOString().slice(0, 10),
          cc_workflow_status: "posted_to_account",
          procurement_status: "posted_to_account"
        })
        .eq("id", purchase.id as string);
      if (updateError) return err(updateError.message);

      const { error: eventError } = await supabase.from("purchase_events").insert({
        purchase_id: purchase.id as string,
        from_status: "pending_cc",
        to_status: "posted",
        estimated_amount_snapshot: Number(purchase.estimated_amount ?? 0),
        requested_amount_snapshot: Number(purchase.requested_amount ?? 0),
        encumbered_amount_snapshot: 0,
        pending_cc_amount_snapshot: 0,
        posted_amount_snapshot: postedAmount,
        changed_by_user_id: user.id,
        note: `Posted to Banner for statement ${(statementMonth.statement_month as string).slice(0, 7)}`
      });
      if (eventError) return err(eventError.message);

      await createInstitutionalCommitmentForPurchase(supabase, purchase.id as string, user.id);
    }

    const { data: statementUpdated, error: statementUpdateError } = await supabase
      .from("cc_statement_months")
      .update({ posted_to_banner_at: new Date().toISOString() })
      .eq("id", statementMonthId)
      .select("id")
      .maybeSingle();
    if (statementUpdateError) return err(statementUpdateError.message);
    if (!statementUpdated?.id) return err("Statement post-to-Banner update was not applied.");

    await syncEmployeeCardSourceWorkflow(supabase, statementMonthId, "posted_to_account");

    revalidatePath("/cc");
    revalidatePath("/requests");
    revalidatePath("/");
    return ok("Statement month posted to Banner. Pending CC moved to YTD.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not post statement month to Banner."));
  }
}

export async function unpostStatementMonthFromBannerAction(
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
    await requireCcManagerRole();

    const statementMonthId = String(formData.get("statementMonthId") ?? "").trim();
    if (!statementMonthId) return err("Statement month is required.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id, statement_month, posted_at, posted_to_banner_at")
      .eq("id", statementMonthId)
      .single();
    if (statementMonthError || !statementMonth) return err("Statement month not found.");
    if (!statementMonth.posted_at) return err("Statement month is not submitted.");
    if (!statementMonth.posted_to_banner_at) return err("Statement month is not posted to Banner.");

    const { totalsByPurchaseId, hasStatementLines } = await getStatementMonthLinkedPurchaseTotals(supabase, statementMonthId);
    if (totalsByPurchaseId.size === 0) {
      const { data: statementUpdated, error: statementUpdateError } = await supabase
        .from("cc_statement_months")
        .update({ posted_to_banner_at: null })
        .eq("id", statementMonthId)
        .select("id")
        .maybeSingle();
      if (statementUpdateError) return err(statementUpdateError.message);
      if (!statementUpdated?.id) return err("Statement unpost update was not applied.");

      await syncEmployeeCardSourceWorkflow(supabase, statementMonthId, "statement_paid");

      revalidatePath("/cc");
      revalidatePath("/requests");
      revalidatePath("/");
      if (hasStatementLines) {
        return ok("Statement month unposted from Banner. Historical statement lines were preserved, but no linked purchases were restored.");
      }
      return ok("Statement month unposted from Banner. No linked receipts or purchases were found for this historical month.");
    }
    const purchaseIds = [...totalsByPurchaseId.keys()];

    const { data: purchases, error: purchasesError } = await supabase
      .from("purchases")
      .select("id, status, estimated_amount, requested_amount, request_type, is_credit_card")
      .in("id", purchaseIds);
    if (purchasesError) return err(purchasesError.message);

    for (const purchase of purchases ?? []) {
      const isCc = (purchase.request_type as string) === "expense" && Boolean(purchase.is_credit_card as boolean | null);
      if (!isCc) continue;
      const pendingAmount = totalsByPurchaseId.get(purchase.id as string) ?? 0;

      const { error: updateError } = await supabase
        .from("purchases")
        .update({
          status: "pending_cc",
          requested_amount: 0,
          encumbered_amount: 0,
          pending_cc_amount: pendingAmount,
          posted_amount: 0,
          posted_date: null,
          cc_workflow_status: "statement_paid",
          procurement_status: "statement_paid"
        })
        .eq("id", purchase.id as string);
      if (updateError) return err(updateError.message);

      const { error: eventError } = await supabase.from("purchase_events").insert({
        purchase_id: purchase.id as string,
        from_status: "posted",
        to_status: "pending_cc",
        estimated_amount_snapshot: Number(purchase.estimated_amount ?? 0),
        requested_amount_snapshot: Number(purchase.requested_amount ?? 0),
        encumbered_amount_snapshot: 0,
        pending_cc_amount_snapshot: pendingAmount,
        posted_amount_snapshot: 0,
        changed_by_user_id: user.id,
        note: `Unposted from Banner for statement ${(statementMonth.statement_month as string).slice(0, 7)}`
      });
      if (eventError) return err(eventError.message);

      await createInstitutionalCommitmentForPurchase(supabase, purchase.id as string, user.id);
    }

    const { data: statementUpdated, error: statementUpdateError } = await supabase
      .from("cc_statement_months")
      .update({ posted_to_banner_at: null })
      .eq("id", statementMonthId)
      .select("id")
      .maybeSingle();
    if (statementUpdateError) return err(statementUpdateError.message);
    if (!statementUpdated?.id) return err("Statement unpost update was not applied.");

    await syncEmployeeCardSourceWorkflow(supabase, statementMonthId, "statement_paid");

    revalidatePath("/cc");
    revalidatePath("/requests");
    revalidatePath("/");
    return ok("Statement month unposted from Banner. Linked purchases moved back to Pending CC.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not unpost statement month from Banner."));
  }
}
