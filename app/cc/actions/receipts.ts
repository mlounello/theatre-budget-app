"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { requireProjectRole } from "@/lib/access";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import { type ActionState, emptyState, ok, err, getErrorMessage, parseMoney } from "@/lib/action-helpers";
import { requireCcManagerRole, requireOrganizationMembership } from "@/app/cc/actions/_shared";

async function rescalePurchaseAllocations(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  purchaseId: string,
  nextTotal: number
): Promise<void> {
  const { data: allocations, error } = await supabase
    .from("purchase_allocations")
    .select("id, amount")
    .eq("purchase_id", purchaseId)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  if (!allocations?.length) return;

  const currentTotal = allocations.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  let applied = 0;
  for (const [index, allocation] of allocations.entries()) {
    const nextAmount = index === allocations.length - 1
      ? Number((nextTotal - applied).toFixed(2))
      : Number((currentTotal > 0 ? nextTotal * (Number(allocation.amount ?? 0) / currentTotal) : nextTotal / allocations.length).toFixed(2));
    applied += nextAmount;
    const { error: updateError } = await supabase
      .from("purchase_allocations")
      .update({ amount: nextAmount })
      .eq("id", allocation.id as string);
    if (updateError) throw new Error(updateError.message);
  }
}

export async function assignReceiptsToStatementAction(
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
    const receiptIds = formData
      .getAll("receiptId")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (!statementMonthId) return err("Statement month is required.");
    if (receiptIds.length === 0) return err("Select at least one receipt.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id, fiscal_year_id, credit_card_id, posted_at")
      .eq("id", statementMonthId)
      .single();
    if (statementMonthError || !statementMonth) return err("Statement month not found.");
    if (statementMonth.posted_at) return err("Statement month is already submitted.");

    const { data: receipts, error: receiptsError } = await supabase
      .from("purchase_receipts")
      .select("id, purchase_id, cc_statement_month_id, purchases!purchase_receipts_purchase_id_fkey!inner(id, fiscal_year_id, status, request_type, is_credit_card, credit_card_id)")
      .in("id", receiptIds);
    if (receiptsError) return err(receiptsError.message);
    if (!receipts || receipts.length !== receiptIds.length) return err("One or more receipts were not found.");

    for (const receipt of receipts) {
      const purchase = receipt.purchases as
        | { id?: string; fiscal_year_id?: string; status?: string; request_type?: string; is_credit_card?: boolean | null; credit_card_id?: string | null }
        | null;
      if (!purchase) return err("Receipt purchase link is invalid.");
      if (purchase.fiscal_year_id !== statementMonth.fiscal_year_id) {
        return err("Receipts and statement months must belong to the same fiscal year.");
      }
      if ((purchase.request_type as string) !== "expense" || !Boolean(purchase.is_credit_card as boolean | null)) {
        return err("Only receipts from credit-card expense requests can be assigned.");
      }
      if ((purchase.status as string) !== "pending_cc") {
        return err("Only receipts from Pending CC purchases can be assigned.");
      }
      if ((receipt.cc_statement_month_id as string | null) && (receipt.cc_statement_month_id as string) !== statementMonthId) {
        return err("One or more receipts are already assigned to another statement month.");
      }
    }

    const { error: updateError } = await supabase
      .from("purchase_receipts")
      .update({
        cc_statement_month_id: statementMonthId
      })
      .in("id", receiptIds);
    if (updateError) return err(updateError.message);

    const purchaseIds = Array.from(
      new Set(
        receipts.map((receipt) => (receipt.purchase_id as string | null) ?? "").filter((value) => value.length > 0)
      )
    );
    if (purchaseIds.length > 0) {
      const { error: purchaseUpdateError } = await supabase
        .from("purchases")
        .update({
          credit_card_id: statementMonth.credit_card_id as string,
          cc_statement_month_id: statementMonthId
        })
        .in("id", purchaseIds);
      if (purchaseUpdateError) return err(purchaseUpdateError.message);
    }

    revalidatePath("/cc");
    return ok("Receipts added to statement month.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not add receipts to statement month."));
  }
}

export async function finalizeReceiptBatchAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");
    await requireCcManagerRole();

    const statementMonthId = String(formData.get("statementMonthId") ?? "").trim();
    const claimNumber = String(formData.get("claimNumber") ?? "").trim().toUpperCase();
    const receiptIds = formData.getAll("receiptId").map((value) => String(value).trim()).filter(Boolean);
    if (!statementMonthId) return err("Statement month is required.");
    if (!/^EC[0-9]{6}$/.test(claimNumber)) return err("Expense Claim number must use EC######.");
    if (receiptIds.length === 0) return err("Select at least one receipt.");

    const receipts = receiptIds.map((receiptId) => ({
      receipt_id: receiptId,
      expense_number: String(formData.get(`expenseNumber_${receiptId}`) ?? "").trim().toUpperCase()
    }));
    if (receipts.some((receipt) => !/^EX[0-9]{6}$/.test(receipt.expense_number))) {
      return err("Every selected receipt needs an EX###### Expense number.");
    }

    const { data, error } = await supabase.rpc("finalize_cc_receipt_batch", {
      p_statement_month_id: statementMonthId,
      p_claim_number: claimNumber,
      p_receipts: receipts,
      p_user_id: user.id
    });
    if (error) return err(error.message);

    const result = data as { purchase_ids?: string[]; receipt_count?: number; total?: number } | null;
    let commitmentWarning = false;
    const finalizedPurchaseIds = result?.purchase_ids ?? [];
    let finalizedAuthorizationIds: string[] = [];
    if (finalizedPurchaseIds.length > 0) {
      try {
        const { data: finalizedPurchases, error: finalizedError } = await supabase
          .from("purchases")
          .select("authorization_purchase_id")
          .in("id", finalizedPurchaseIds);
        if (finalizedError) throw finalizedError;
        finalizedAuthorizationIds = Array.from(new Set((finalizedPurchases ?? []).map((row) => String(row.authorization_purchase_id ?? "")).filter(Boolean)));
        if (finalizedAuthorizationIds.length > 0) {
          const { data: authorizations, error: authorizationError } = await supabase
            .from("purchases")
            .select("id, expense_claim_id, estimated_amount, pending_cc_amount")
            .in("id", finalizedAuthorizationIds);
          if (authorizationError) throw authorizationError;
          for (const authorization of authorizations ?? []) {
            await rescalePurchaseAllocations(
              supabase,
              authorization.id as string,
              Number(authorization.pending_cc_amount ?? 0)
            );
          }
          const claimIds = Array.from(new Set((authorizations ?? []).map((row) => String(row.expense_claim_id ?? "")).filter(Boolean)));
          for (const claimId of claimIds) {
            const claimAuthorizationIds = (authorizations ?? []).filter((row) => row.expense_claim_id === claimId).map((row) => row.id as string);
            const authorizedTotal = (authorizations ?? []).filter((row) => row.expense_claim_id === claimId).reduce((sum, row) => sum + Number(row.estimated_amount ?? 0), 0);
            const { data: actuals, error: actualsError } = await supabase
              .from("purchases")
              .select("pending_cc_amount, posted_amount, status")
              .in("authorization_purchase_id", claimAuthorizationIds)
              .neq("status", "cancelled");
            if (actualsError) throw actualsError;
            const settledTotal = (actuals ?? []).reduce((sum, row) => sum + Number(row.pending_cc_amount ?? 0) + Number(row.posted_amount ?? 0), 0);
            const { error: claimUpdateError } = await supabase.from("expense_claims").update({
              settled_amount: Number(settledTotal.toFixed(2)),
              status: settledTotal + 0.005 >= authorizedTotal ? "reconciled" : "approved"
            }).eq("id", claimId);
            if (claimUpdateError) throw claimUpdateError;
          }
        }
      } catch (summaryError) {
        commitmentWarning = true;
        console.error("Funding request summary refresh failed", { finalizedPurchaseIds, summaryError });
      }
    }
    for (const purchaseId of finalizedPurchaseIds) {
      try {
        await createInstitutionalCommitmentForPurchase(supabase, purchaseId, user.id);
      } catch (syncError) {
        commitmentWarning = true;
        console.error("Finalized receipt commitment sync failed", { purchaseId, syncError });
      }
    }
    for (const authorizationId of finalizedAuthorizationIds) {
      try {
        await createInstitutionalCommitmentForPurchase(supabase, authorizationId, user.id);
      } catch (syncError) {
        commitmentWarning = true;
        console.error("Funding authorization commitment sync failed", { authorizationId, syncError });
      }
    }

    revalidatePath("/cc");
    revalidatePath("/");
    revalidatePath("/institutional-budget");
    return ok(
      `${result?.receipt_count ?? receiptIds.length} receipt${receiptIds.length === 1 ? "" : "s"} finalized into ${claimNumber}.` +
      (commitmentWarning ? " The Expense Claim was saved, but one institutional commitment needs review." : "")
    );
  } catch (error) {
    return err(getErrorMessage(error, "Could not finalize the monthly Expense Claim."));
  }
}

export async function updateStagedReceiptAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");
    await requireCcManagerRole();

    const receiptId = String(formData.get("receiptId") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const receiptDate = String(formData.get("receiptDate") ?? "").trim();
    const amount = parseMoney(formData.get("amountReceived"));
    const chargeTo = String(formData.get("chargeTo") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const accountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const [scopeType, scopeId] = chargeTo.split(":");
    const projectId = scopeType === "project" ? scopeId : "";
    const organizationId = scopeType === "organization" ? scopeId : "";

    if (!receiptId || !note || !receiptDate || amount === 0) {
      return err("Description, date, and a non-zero amount are required. Use a negative amount for a return or credit.");
    }
    if (!projectId && !organizationId) return err("Choose a project or organization budget.");
    if (projectId && !productionCategoryId) return err("Choose a Production Category.");
    if (!accountCodeId) return err("Choose a Banner account / FOAP.");

    const { data: receipt, error: receiptError } = await supabase
      .from("purchase_receipts")
      .select("id, cc_statement_month_id, purchase_id, purchases!purchase_receipts_purchase_id_fkey!inner(fiscal_year_id)")
      .eq("id", receiptId)
      .single();
    if (receiptError || !receipt) return err("Receipt not found.");
    if (receipt.cc_statement_month_id) return err("Finalized receipts must be edited through their EX Expense.");
    const purchase = receipt.purchases as { fiscal_year_id?: string } | null;
    const fiscalYearId = String(purchase?.fiscal_year_id ?? "");
    if (projectId) {
      const { data: project, error: projectError } = await supabase.from("projects").select("id, fiscal_year_id").eq("id", projectId).single();
      if (projectError || !project || project.fiscal_year_id !== fiscalYearId) return err("That project is outside this receipt's fiscal year.");
    } else {
      await requireOrganizationMembership(supabase, fiscalYearId, organizationId, { projectlessOnly: true });
    }

    const { error } = await supabase.from("purchase_receipts").update({
      note,
      amount_received: amount,
      receipt_date: receiptDate,
      project_id: projectId || null,
      organization_id: organizationId || null,
      production_category_id: projectId ? productionCategoryId : null,
      account_code_id: accountCodeId
    }).eq("id", receiptId);
    if (error) return err(error.message);

    revalidatePath("/cc");
    return ok("Receipt details and budget destination updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update the receipt."));
  }
}

export async function updateCcAttentionPurchaseAction(
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

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    const creditCardId = String(formData.get("creditCardId") ?? "").trim();
    const pendingCcAmount = parseMoney(formData.get("pendingCcAmount"));
    if (!purchaseId) return err("Transaction is required.");
    if (!creditCardId) return err("Choose a credit card.");
    if (pendingCcAmount <= 0) return err("Authorized cap must be greater than zero.");

    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, status, request_type, is_credit_card, estimated_amount, requested_amount, pending_cc_amount")
      .eq("id", purchaseId)
      .maybeSingle();
    if (purchaseError) return err(purchaseError.message);
    if (!purchase?.id) return err("Transaction not found or outside your access scope.");
    if (purchase.status !== "pending_cc" || purchase.request_type !== "expense" || !purchase.is_credit_card) {
      return err("Only pending credit-card expenses can be edited here.");
    }

    const { data: receiptRows, error: receiptsError } = await supabase
      .from("purchase_receipts")
      .select("amount_received")
      .eq("purchase_id", purchaseId);
    if (receiptsError) return err(receiptsError.message);
    const receiptTotal = (receiptRows ?? []).reduce((sum, row) => sum + Number(row.amount_received ?? 0), 0);
    if (pendingCcAmount + 0.005 < receiptTotal) {
      return err("Authorized cap cannot be lower than the receipts already recorded.");
    }

    const previousCap = Number(purchase.pending_cc_amount ?? 0);
    const { data: updated, error: updateError } = await supabase
      .from("purchases")
      .update({ credit_card_id: creditCardId, pending_cc_amount: pendingCcAmount })
      .eq("id", purchaseId)
      .select("id")
      .maybeSingle();
    if (updateError) return err(updateError.message);
    if (!updated?.id) return err("Transaction update was not applied.");
    await rescalePurchaseAllocations(supabase, purchaseId, pendingCcAmount);

    if (Math.abs(previousCap - pendingCcAmount) > 0.005) {
      const { error: eventError } = await supabase.from("purchase_events").insert({
        purchase_id: purchaseId,
        from_status: "pending_cc",
        to_status: "pending_cc",
        estimated_amount_snapshot: Number(purchase.estimated_amount ?? 0),
        requested_amount_snapshot: Number(purchase.requested_amount ?? 0),
        encumbered_amount_snapshot: 0,
        pending_cc_amount_snapshot: pendingCcAmount,
        posted_amount_snapshot: 0,
        changed_by_user_id: user.id,
        note: `Authorized card cap updated from ${previousCap.toFixed(2)} to ${pendingCcAmount.toFixed(2)}.`
      });
      if (eventError) return err(eventError.message);
    }

    await createInstitutionalCommitmentForPurchase(supabase, purchaseId, user.id);
    revalidatePath("/cc");
    revalidatePath("/procurement");
    revalidatePath("/");
    return ok("Transaction updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update the transaction."));
  }
}

export async function updateExpenseBudgetDestinationAction(
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

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    const chargeTo = String(formData.get("chargeTo") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const [scopeType, scopeId] = chargeTo.split(":");
    const projectId = scopeType === "project" ? scopeId : "";
    const organizationId = scopeType === "organization" ? scopeId : "";

    if (!purchaseId || (!projectId && !organizationId) || (projectId && organizationId)) {
      return err("Choose exactly one project or organization budget for this Expense.");
    }
    if (!bannerAccountCodeId) return err("Choose a Banner account / FOAP charge for this Expense.");
    if (projectId && !productionCategoryId) return err("Choose a Production Category for this Expense.");

    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, fiscal_year_id, request_type, expense_number")
      .eq("id", purchaseId)
      .maybeSingle();
    if (purchaseError) return err(purchaseError.message);
    if (!purchase?.id || purchase.request_type !== "expense") return err("Expense not found or outside your access scope.");

    if (projectId) {
      await requireProjectRole(projectId, ["admin", "project_manager"], {
        productionCategoryId,
        errorMessage: "You do not have permission to charge this Expense to that project or category."
      });
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, fiscal_year_id")
        .eq("id", projectId)
        .maybeSingle();
      if (projectError || !project?.id) return err("The selected project could not be found.");
      if (project.fiscal_year_id !== purchase.fiscal_year_id) return err("The selected project is outside this Expense's fiscal year.");
    } else {
      await requireOrganizationMembership(supabase, purchase.fiscal_year_id as string, organizationId, { projectlessOnly: true });
    }

    const { error: updateError } = await supabase.rpc("update_expense_budget_destination", {
      p_purchase_id: purchaseId,
      p_project_id: projectId || null,
      p_organization_id: organizationId || null,
      p_production_category_id: projectId ? productionCategoryId : null,
      p_account_code_id: bannerAccountCodeId,
      p_user_id: user.id
    });
    if (updateError) return err(updateError.message);

    await createInstitutionalCommitmentForPurchase(supabase, purchaseId, user.id);
    revalidatePath("/cc");
    revalidatePath("/procurement");
    revalidatePath("/");
    return ok(`${purchase.expense_number || "Expense"} budget destination updated.`);
  } catch (error) {
    return err(getErrorMessage(error, "Could not update the Expense budget destination."));
  }
}

export async function reconcileCcPurchaseToReceiptsAction(
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

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    if (!purchaseId) return err("Transaction is required.");
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, status, request_type, is_credit_card, estimated_amount, requested_amount, pending_cc_amount")
      .eq("id", purchaseId)
      .maybeSingle();
    if (purchaseError) return err(purchaseError.message);
    if (!purchase?.id) return err("Transaction not found or outside your access scope.");
    if (purchase.status !== "pending_cc" || purchase.request_type !== "expense" || !purchase.is_credit_card) {
      return err("Only pending credit-card expenses can be reconciled here.");
    }

    const { data: receiptRows, error: receiptsError } = await supabase
      .from("purchase_receipts")
      .select("amount_received")
      .eq("purchase_id", purchaseId);
    if (receiptsError) return err(receiptsError.message);
    if (!receiptRows?.length) return err("Add at least one receipt before reconciling this expense.");
    const receiptTotal = receiptRows.reduce((sum, row) => sum + Number(row.amount_received ?? 0), 0);
    const previousCap = Number(purchase.pending_cc_amount ?? 0);
    if (receiptTotal === 0) return err("Receipts net to zero. Add a non-zero total before reconciling.");
    if (receiptTotal > previousCap + 0.005) {
      return err("Receipt total is above the authorized cap. Increase the cap or document the overage first.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("purchases")
      .update({
        pending_cc_amount: receiptTotal,
        cc_workflow_status: "receipts_uploaded",
        procurement_status: "receipts_uploaded"
      })
      .eq("id", purchaseId)
      .select("id")
      .maybeSingle();
    if (updateError) return err(updateError.message);
    if (!updated?.id) return err("Reconciliation update was not applied.");
    await rescalePurchaseAllocations(supabase, purchaseId, receiptTotal);

    const releasedAmount = Math.max(previousCap - receiptTotal, 0);
    const { error: eventError } = await supabase.from("purchase_events").insert({
      purchase_id: purchaseId,
      from_status: "pending_cc",
      to_status: "pending_cc",
      estimated_amount_snapshot: Number(purchase.estimated_amount ?? 0),
      requested_amount_snapshot: Number(purchase.requested_amount ?? 0),
      encumbered_amount_snapshot: 0,
      pending_cc_amount_snapshot: receiptTotal,
      posted_amount_snapshot: 0,
      changed_by_user_id: user.id,
      note: `Reconciled to receipt total ${receiptTotal.toFixed(2)}; released ${releasedAmount.toFixed(2)} of unused authorization.`
    });
    if (eventError) return err(eventError.message);

    await createInstitutionalCommitmentForPurchase(supabase, purchaseId, user.id);
    revalidatePath("/cc");
    revalidatePath("/procurement");
    revalidatePath("/");
    return ok(`Reconciled at the ${receiptTotal.toFixed(2)} actual. The unused ${releasedAmount.toFixed(2)} hold was released.`);
  } catch (error) {
    return err(getErrorMessage(error, "Could not reconcile the transaction."));
  }
}

export async function unassignReceiptFromStatementAction(
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
    const receiptId = String(formData.get("receiptId") ?? "").trim();
    if (!statementMonthId || !receiptId) return err("Statement month and receipt are required.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id, credit_card_id, posted_at")
      .eq("id", statementMonthId)
      .single();
    if (statementMonthError || !statementMonth) return err("Statement month not found.");
    if (statementMonth.posted_at) return err("Cannot remove purchases from a submitted statement month.");

    const { data: receiptRow, error: receiptRowError } = await supabase
      .from("purchase_receipts")
      .select("id, purchase_id")
      .eq("id", receiptId)
      .maybeSingle();
    if (receiptRowError) return err(receiptRowError.message);
    if (!receiptRow?.purchase_id) return err("Receipt not found.");

    const { error: updateError } = await supabase
      .from("purchase_receipts")
      .update({ cc_statement_month_id: null })
      .eq("id", receiptId)
      .eq("cc_statement_month_id", statementMonthId);
    if (updateError) return err(updateError.message);

    const { data: statementLines, error: statementLinesError } = await supabase
      .from("cc_statement_lines")
      .select("id, matched_purchase_ids")
      .eq("statement_month_id", statementMonthId);
    if (statementLinesError) return err(statementLinesError.message);

    for (const line of statementLines ?? []) {
      const matchedPurchaseIds = Array.isArray(line.matched_purchase_ids)
        ? line.matched_purchase_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [];
      if (!matchedPurchaseIds.includes(receiptRow.purchase_id as string)) continue;

      const nextMatchedPurchaseIds = matchedPurchaseIds.filter((value) => value !== (receiptRow.purchase_id as string));
      const { error: lineUpdateError } = await supabase
        .from("cc_statement_lines")
        .update({ matched_purchase_ids: nextMatchedPurchaseIds })
        .eq("id", line.id as string);
      if (lineUpdateError) return err(lineUpdateError.message);
    }

    const { count: remainingAssignedCount, error: remainingAssignedError } = await supabase
      .from("purchase_receipts")
      .select("id", { head: true, count: "exact" })
      .eq("purchase_id", receiptRow.purchase_id as string)
      .eq("cc_statement_month_id", statementMonthId);
    if (remainingAssignedError) return err(remainingAssignedError.message);

    const { data: remainingMatchedLines, error: remainingMatchedLinesError } = await supabase
      .from("cc_statement_lines")
      .select("id")
      .eq("statement_month_id", statementMonthId)
      .contains("matched_purchase_ids", [receiptRow.purchase_id as string]);
    if (remainingMatchedLinesError) return err(remainingMatchedLinesError.message);

    if ((remainingAssignedCount ?? 0) === 0 && (remainingMatchedLines ?? []).length === 0) {
      const { error: purchaseResetError } = await supabase
        .from("purchases")
        .update({ cc_statement_month_id: null, credit_card_id: null })
        .eq("id", receiptRow.purchase_id as string)
        .eq("cc_statement_month_id", statementMonthId)
        .eq("credit_card_id", statementMonth.credit_card_id as string);
      if (purchaseResetError) return err(purchaseResetError.message);
    }

    revalidatePath("/cc");
    return ok("Receipt removed from statement month.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not remove receipt from statement month."));
  }
}
