"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext, requireProjectRole } from "@/lib/access";
import type { PurchaseStatus } from "@/lib/types";

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

function toStatementDate(monthValue: string): string {
  const trimmed = monthValue.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) throw new Error("Statement month must be in YYYY-MM format.");
  return `${trimmed}-01`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

async function requireCcManagerRole(): Promise<void> {
  const access = await getAccessContext();
  if (access.role !== "admin" && access.role !== "project_manager") {
    throw new Error("You must be an Admin or Project Manager to manage credit card statements.");
  }
}

async function requireGlobalAdmin(): Promise<void> {
  const access = await getAccessContext();
  if (access.role !== "admin") {
    throw new Error("Only Admin can manage credit cards.");
  }
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

export async function createCreditCardAction(
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
    await requireGlobalAdmin();

    const nickname = String(formData.get("nickname") ?? "").trim();
    const maskedNumber = String(formData.get("maskedNumber") ?? "").trim();
    const active = formData.get("active") === "on";

    if (!nickname) return err("Card nickname is required.");

    const { error } = await supabase.from("credit_cards").insert({
      nickname,
      masked_number: maskedNumber || null,
      active
    });
    if (error) return err(error.message);

    revalidatePath("/cc");
    revalidatePath("/requests");
    return ok("Credit card saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not save credit card."));
  }
}

export async function updateCreditCardAction(
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
    await requireGlobalAdmin();

    const id = String(formData.get("id") ?? "").trim();
    const nickname = String(formData.get("nickname") ?? "").trim();
    const maskedNumber = String(formData.get("maskedNumber") ?? "").trim();
    const active = formData.get("active") === "on";
    if (!id || !nickname) return err("Card ID and nickname are required.");

    const { data: updated, error } = await supabase
      .from("credit_cards")
      .update({ nickname, masked_number: maskedNumber || null, active })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return err(error.message);
    if (!updated?.id) return err("Credit card update was not applied.");

    revalidatePath("/cc");
    return ok("Credit card updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update credit card."));
  }
}

export async function deleteCreditCardAction(
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
    await requireGlobalAdmin();

    const id = String(formData.get("id") ?? "").trim();
    if (!id) return err("Card ID is required.");

    const { error } = await supabase.from("credit_cards").delete().eq("id", id);
    if (error) return err(error.message);

    revalidatePath("/cc");
    return ok("Credit card deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete credit card."));
  }
}

export async function createStatementMonthAction(
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

    const creditCardId = String(formData.get("creditCardId") ?? "").trim();
    const month = String(formData.get("statementMonth") ?? "").trim();

    if (!creditCardId || !month) return err("Card and statement month are required.");
    const statementDate = toStatementDate(month);
    await requireCcManagerRole();

    const { data: existingRows, error: existingError } = await supabase
      .from("cc_statement_months")
      .select("id")
      .eq("credit_card_id", creditCardId)
      .eq("statement_month", statementDate)
      .limit(1);
    if (existingError) return err(existingError.message);

    if ((existingRows ?? []).length > 0) {
      revalidatePath("/cc");
      return ok("Statement month already exists.");
    }

    const { error } = await supabase.from("cc_statement_months").insert({
      project_id: null,
      credit_card_id: creditCardId,
      statement_month: statementDate,
      created_by_user_id: user.id
    });
    if (error) return err(error.message);

    revalidatePath("/cc");
    return ok("Statement month saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not save statement month."));
  }
}

export async function updateStatementMonthAction(
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
    const creditCardId = String(formData.get("creditCardId") ?? "").trim();
    const month = String(formData.get("statementMonth") ?? "").trim();
    if (!id || !creditCardId || !month) return err("Statement month, id, and card are required.");

    const { data: existing, error: existingError } = await supabase
      .from("cc_statement_months")
      .select("id, posted_at, posted_to_banner_at")
      .eq("id", id)
      .single();
    if (existingError || !existing) return err("Statement month not found.");
    if (existing.posted_to_banner_at) return err("Cannot edit a statement month that is already posted to Banner.");
    if (existing.posted_at) return err("Reopen this statement month before editing.");
    await requireCcManagerRole();

    const statementDate = toStatementDate(month);
    const { data: updated, error } = await supabase
      .from("cc_statement_months")
      .update({ credit_card_id: creditCardId, statement_month: statementDate })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return err(error.message);
    if (!updated?.id) return err("Statement month update was not applied.");

    revalidatePath("/cc");
    return ok("Statement month updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update statement month."));
  }
}

export async function deleteStatementMonthAction(
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
    if (!id) return err("Statement month id is required.");

    const { data: existing, error: existingError } = await supabase
      .from("cc_statement_months")
      .select("id")
      .eq("id", id)
      .single();
    if (existingError || !existing) return err("Statement month not found.");
    await requireCcManagerRole();

    const { data: linkedPurchases, error: linkedError } = await supabase
      .from("purchases")
      .select("id")
      .eq("cc_statement_month_id", id)
      .limit(1);
    if (linkedError) return err(linkedError.message);
    if ((linkedPurchases ?? []).length > 0) {
      return err("Cannot delete a statement month that has linked purchases. Remove purchases first.");
    }

    const { data: linkedReceipts, error: linkedReceiptsError } = await supabase
      .from("purchase_receipts")
      .select("id")
      .eq("cc_statement_month_id", id)
      .limit(1);
    if (linkedReceiptsError) return err(linkedReceiptsError.message);
    if ((linkedReceipts ?? []).length > 0) {
      return err("Cannot delete a statement month that has linked receipts. Remove receipts first.");
    }

    const { error } = await supabase.from("cc_statement_months").delete().eq("id", id);
    if (error) return err(error.message);

    revalidatePath("/cc");
    return ok("Statement month deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete statement month."));
  }
}

export async function bulkUpdateCreditCardsAction(
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
    await requireGlobalAdmin();

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) return err("Select at least one credit card.");

    const applyActive = formData.get("applyActive") === "on";
    const applyMaskedNumber = formData.get("applyMaskedNumber") === "on";
    if (!applyActive && !applyMaskedNumber) return err("Choose at least one field to apply.");

    const activeValue = String(formData.get("activeValue") ?? "").trim().toLowerCase();
    const nextActive = activeValue === "true";
    const maskedNumber = String(formData.get("maskedNumber") ?? "").trim();

    const { data: cards, error: cardsError } = await supabase.from("credit_cards").select("id, active, masked_number").in("id", ids);
    if (cardsError) return err(cardsError.message);
    if (!cards || cards.length !== ids.length) return err("Some selected cards were not found.");

    for (const card of cards) {
      const { data: updated, error: updateError } = await supabase
        .from("credit_cards")
        .update({
          active: applyActive ? nextActive : Boolean(card.active as boolean | null),
          masked_number: applyMaskedNumber ? maskedNumber || null : ((card.masked_number as string | null) ?? null)
        })
        .eq("id", card.id as string)
        .select("id")
        .maybeSingle();
      if (updateError) return err(updateError.message);
      if (!updated?.id) return err("A bulk credit card update was not applied.");
    }

    revalidatePath("/cc");
    revalidatePath("/requests");
    return ok("Selected credit cards updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not bulk update credit cards."));
  }
}

export async function bulkDeleteCreditCardsAction(
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
    await requireGlobalAdmin();

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) return err("Select at least one credit card.");

    const { error } = await supabase.from("credit_cards").delete().in("id", ids);
    if (error) return err(error.message);

    revalidatePath("/cc");
    revalidatePath("/requests");
    return ok("Selected credit cards deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete selected credit cards."));
  }
}

export async function bulkUpdateStatementMonthsAction(
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

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) return err("Select at least one statement month.");

    const applyCreditCard = formData.get("applyCreditCard") === "on";
    const applyMonth = formData.get("applyStatementMonth") === "on";
    if (!applyCreditCard && !applyMonth) return err("Choose at least one field to apply.");

    const creditCardId = String(formData.get("creditCardId") ?? "").trim();
    const month = String(formData.get("statementMonth") ?? "").trim();
    const statementDate = applyMonth ? toStatementDate(month) : null;
    if (applyCreditCard && !creditCardId) return err("Credit card is required when applying credit card.");
    if (applyMonth && !month) return err("Statement month is required when applying month.");

    const { data: months, error: monthsError } = await supabase
      .from("cc_statement_months")
      .select("id, credit_card_id, statement_month, posted_at, posted_to_banner_at")
      .in("id", ids);
    if (monthsError) return err(monthsError.message);
    if (!months || months.length !== ids.length) return err("Some selected statement months were not found.");

    for (const monthRow of months) {
      if (monthRow.posted_to_banner_at) return err("Cannot bulk edit statement months that are already posted to Banner.");
      if (monthRow.posted_at) return err("Cannot bulk edit submitted statement months.");
      const { data: updated, error: updateError } = await supabase
        .from("cc_statement_months")
        .update({
          credit_card_id: applyCreditCard ? creditCardId : (monthRow.credit_card_id as string),
          statement_month: applyMonth ? (statementDate as string) : (monthRow.statement_month as string)
        })
        .eq("id", monthRow.id as string)
        .select("id")
        .maybeSingle();
      if (updateError) return err(updateError.message);
      if (!updated?.id) return err("A bulk statement month update was not applied.");
    }

    revalidatePath("/cc");
    return ok("Selected statement months updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not bulk update statement months."));
  }
}

export async function bulkDeleteStatementMonthsAction(
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

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) return err("Select at least one statement month.");

    const { data: linkedPurchases, error: linkedError } = await supabase
      .from("purchases")
      .select("id, cc_statement_month_id")
      .in("cc_statement_month_id", ids)
      .limit(1);
    if (linkedError) return err(linkedError.message);
    if ((linkedPurchases ?? []).length > 0) {
      return err("Cannot bulk delete statement months that have linked purchases.");
    }

    const { data: linkedReceipts, error: linkedReceiptsError } = await supabase
      .from("purchase_receipts")
      .select("id, cc_statement_month_id")
      .in("cc_statement_month_id", ids)
      .limit(1);
    if (linkedReceiptsError) return err(linkedReceiptsError.message);
    if ((linkedReceipts ?? []).length > 0) {
      return err("Cannot bulk delete statement months that have linked receipts.");
    }

    const { error } = await supabase.from("cc_statement_months").delete().in("id", ids);
    if (error) return err(error.message);

    revalidatePath("/cc");
    return ok("Selected statement months deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not bulk delete statement months."));
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
      .select("id, credit_card_id, posted_at")
      .eq("id", statementMonthId)
      .single();
    if (statementMonthError || !statementMonth) return err("Statement month not found.");
    if (statementMonth.posted_at) return err("Statement month is already submitted.");

    const { data: receipts, error: receiptsError } = await supabase
      .from("purchase_receipts")
      .select("id, purchase_id, cc_statement_month_id, purchases!inner(id, status, request_type, is_credit_card, credit_card_id)")
      .in("id", receiptIds);
    if (receiptsError) return err(receiptsError.message);
    if (!receipts || receipts.length !== receiptIds.length) return err("One or more receipts were not found.");

    for (const receipt of receipts) {
      const purchase = receipt.purchases as
        | { id?: string; status?: string; request_type?: string; is_credit_card?: boolean | null; credit_card_id?: string | null }
        | null;
      if (!purchase) return err("Receipt purchase link is invalid.");
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
      .select("id, posted_at")
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
        .update({ cc_statement_month_id: null })
        .eq("id", receiptRow.purchase_id as string)
        .eq("cc_statement_month_id", statementMonthId);
      if (purchaseResetError) return err(purchaseResetError.message);
    }

    revalidatePath("/cc");
    return ok("Receipt removed from statement month.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not remove receipt from statement month."));
  }
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
      .select("id, amount_received, purchase_id, purchases!inner(id, project_id, status, estimated_amount, requested_amount, pending_cc_amount, request_type, is_credit_card)")
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
    }

    const { data: monthUpdated, error: monthUpdateError } = await supabase
      .from("cc_statement_months")
      .update({ posted_at: new Date().toISOString(), posted_to_banner_at: null })
      .eq("id", statementMonthId)
      .select("id")
      .maybeSingle();
    if (monthUpdateError) return err(monthUpdateError.message);
    if (!monthUpdated?.id) return err("Statement month submit update was not applied.");

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
    }

    const { data: statementUpdated, error: statementUpdateError } = await supabase
      .from("cc_statement_months")
      .update({ posted_to_banner_at: new Date().toISOString() })
      .eq("id", statementMonthId)
      .select("id")
      .maybeSingle();
    if (statementUpdateError) return err(statementUpdateError.message);
    if (!statementUpdated?.id) return err("Statement post-to-Banner update was not applied.");

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
    }

    const { data: statementUpdated, error: statementUpdateError } = await supabase
      .from("cc_statement_months")
      .update({ posted_to_banner_at: null })
      .eq("id", statementMonthId)
      .select("id")
      .maybeSingle();
    if (statementUpdateError) return err(statementUpdateError.message);
    if (!statementUpdated?.id) return err("Statement unpost update was not applied.");

    revalidatePath("/cc");
    revalidatePath("/requests");
    revalidatePath("/");
    return ok("Statement month unposted from Banner. Linked purchases moved back to Pending CC.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not unpost statement month from Banner."));
  }
}

export async function createReimbursementRequestAction(
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
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));

    if (!projectId || !productionCategoryId || !title) {
      return err("Project, department, and title are required.");
    }
    if (amount === 0) return err("Amount must be non-zero.");

    await requireProjectRole(projectId, ["admin", "project_manager", "buyer"], {
      productionCategoryId,
      errorMessage: "You do not have permission to create requests for this project."
    });

    const { data: budgetLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
      p_project_id: projectId,
      p_production_category_id: productionCategoryId
    });
    if (ensureLineError || !budgetLineId) return err(ensureLineError?.message ?? "Unable to resolve reporting line.");

    const { data: budgetLine, error: budgetLineError } = await supabase
      .from("project_budget_lines")
      .select("id, account_code_id")
      .eq("id", budgetLineId as string)
      .single();
    if (budgetLineError || !budgetLine) return err("Reporting line not found.");

    const { data: inserted, error: insertError } = await supabase
      .from("purchases")
      .insert({
        project_id: projectId,
        budget_line_id: budgetLine.id,
        production_category_id: productionCategoryId,
        banner_account_code_id: bannerAccountCodeId || null,
        entered_by_user_id: user.id,
        title,
        reference_number: referenceNumber || null,
        requisition_number: null,
        estimated_amount: amount,
        requested_amount: amount,
        encumbered_amount: 0,
        pending_cc_amount: 0,
        posted_amount: 0,
        status: "requested",
        request_type: "expense",
        is_credit_card: false,
        cc_workflow_status: null,
        procurement_status: "requested"
      })
      .select("id")
      .single();
    if (insertError || !inserted) return err(insertError?.message ?? "Could not create reimbursement.");

    const { error: allocationError } = await supabase.from("purchase_allocations").insert({
      purchase_id: inserted.id as string,
      reporting_budget_line_id: budgetLine.id as string,
      account_code_id: bannerAccountCodeId || (budgetLine.account_code_id as string | null) || null,
      production_category_id: productionCategoryId,
      amount,
      reporting_bucket: "direct"
    });
    if (allocationError) return err(allocationError.message);

    const { error: eventError } = await supabase.from("purchase_events").insert({
      purchase_id: inserted.id as string,
      from_status: null,
      to_status: "requested" as PurchaseStatus,
      estimated_amount_snapshot: amount,
      requested_amount_snapshot: amount,
      encumbered_amount_snapshot: 0,
      pending_cc_amount_snapshot: 0,
      posted_amount_snapshot: 0,
      changed_by_user_id: user.id,
      note: "Reimbursement request created"
    });
    if (eventError) return err(eventError.message);

    revalidatePath("/cc");
    revalidatePath("/requests");
    revalidatePath("/");
    return ok("Reimbursement request saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not save reimbursement request."));
  }
}

export async function addStatementLineAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const statementMonthId = String(formData.get("statementMonthId") ?? "").trim();
    const projectBudgetLineId = String(formData.get("projectBudgetLineId") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));
    const note = String(formData.get("note") ?? "").trim();

    if (!statementMonthId || !projectBudgetLineId) return err("Statement month and budget line are required.");
    if (amount === 0) return err("Amount must be non-zero.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id")
      .eq("id", statementMonthId)
      .single();
    if (statementMonthError || !statementMonth) return err("Statement month not found.");

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");
    await requireCcManagerRole();

    const { error } = await supabase.from("cc_statement_lines").insert({
      statement_month_id: statementMonthId,
      project_budget_line_id: projectBudgetLineId,
      amount,
      note: note || null
    });
    if (error) return err(error.message);

    revalidatePath("/cc");
    return ok("Statement line added.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not add statement line."));
  }
}

export async function confirmStatementLineMatchAction(
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

    const statementLineId = String(formData.get("statementLineId") ?? "").trim();
    const purchaseIds = formData
      .getAll("purchaseId")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (!statementLineId) return err("Statement line is required.");
    if (purchaseIds.length === 0) return err("Select at least one pending purchase to match.");

    const { data: statementLine, error: statementLineError } = await supabase
      .from("cc_statement_lines")
      .select("id, amount, matched_purchase_ids, statement_month_id, project_budget_line_id")
      .eq("id", statementLineId)
      .single();
    if (statementLineError || !statementLine) return err("Statement line not found.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id, credit_card_id, statement_month")
      .eq("id", statementLine.statement_month_id as string)
      .single();
    if (statementMonthError || !statementMonth) return err("Statement month not found.");
    await requireCcManagerRole();

    const { data: purchases, error: purchasesError } = await supabase
      .from("purchases")
      .select("id, project_id, budget_line_id, status, pending_cc_amount, credit_card_id, estimated_amount, requested_amount")
      .in("id", purchaseIds);
    if (purchasesError) return err(purchasesError.message);
    if (!purchases || purchases.length !== purchaseIds.length) return err("One or more selected purchases were not found.");

    const selectedTotal = purchases.reduce((sum, purchase) => sum + Number(purchase.pending_cc_amount ?? 0), 0);
    const statementAmount = Number(statementLine.amount ?? 0);
    if (Math.abs(selectedTotal - statementAmount) > 0.01) {
      return err(`Selected purchases total ${selectedTotal.toFixed(2)} but statement line is ${statementAmount.toFixed(2)}.`);
    }

    for (const purchase of purchases) {
      if ((purchase.budget_line_id as string) !== (statementLine.project_budget_line_id as string)) {
        return err("All purchases must match the selected statement budget line.");
      }
      if ((purchase.status as string) !== "pending_cc") {
        return err("Only pending credit-card purchases can be matched.");
      }
    }

    for (const purchase of purchases) {
      const pendingAmount = Number(purchase.pending_cc_amount ?? 0);
      const { error: updateError } = await supabase
        .from("purchases")
        .update({
          status: "pending_cc",
          posted_amount: 0,
          pending_cc_amount: pendingAmount,
          cc_workflow_status: "statement_paid",
          credit_card_id: (statementMonth.credit_card_id as string) ?? (purchase.credit_card_id as string | null),
          posted_date: null
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
    }

    const matchedPurchaseIds = Array.from(new Set([...(statementLine.matched_purchase_ids as string[] | null | undefined) ?? [], ...purchaseIds]));
    const { error: lineUpdateError } = await supabase
      .from("cc_statement_lines")
      .update({ matched_purchase_ids: matchedPurchaseIds })
      .eq("id", statementLineId);
    if (lineUpdateError) return err(lineUpdateError.message);

    const { data: openLines, error: openLinesError } = await supabase
      .from("cc_statement_lines")
      .select("id, matched_purchase_ids")
      .eq("statement_month_id", statementMonth.id as string);
    if (openLinesError) return err(openLinesError.message);

    const allMatched = (openLines ?? []).every((line) => Array.isArray(line.matched_purchase_ids) && line.matched_purchase_ids.length > 0);
    if (allMatched) {
      await supabase.from("cc_statement_months").update({ posted_at: new Date().toISOString() }).eq("id", statementMonth.id as string);
    }

    revalidatePath("/cc");
    revalidatePath("/requests");
    revalidatePath("/");
    revalidatePath("/projects");
    return ok("Statement match posted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not match statement line."));
  }
}

export type { ActionState };
