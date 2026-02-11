"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStatementDate(monthValue: string): string {
  const trimmed = monthValue.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) throw new Error("Statement month must be in YYYY-MM format.");
  return `${trimmed}-01`;
}

function ccSuccess(message: string): never {
  redirect(`/cc?ok=${encodeURIComponent(message)}`);
}

function ccError(message: string): never {
  redirect(`/cc?error=${encodeURIComponent(message)}`);
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

async function requireCcManagerRole(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string
): Promise<void> {
  const { data: roleRows, error: roleError } = await supabase
    .from("project_memberships")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "project_manager"]);

  if (roleError) throw new Error(roleError.message);
  if ((roleRows ?? []).length === 0) {
    throw new Error("You must be an Admin or Project Manager to manage credit card statements.");
  }
}

async function requireGlobalAdmin(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("project_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1);
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) {
    throw new Error("Only Admin can manage credit cards.");
  }
}

export async function createCreditCardAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");
    await requireGlobalAdmin(supabase, user.id);

    const nickname = String(formData.get("nickname") ?? "").trim();
    const maskedNumber = String(formData.get("maskedNumber") ?? "").trim();
    const active = formData.get("active") === "on";

    if (!nickname) throw new Error("Card nickname is required.");

    const { error } = await supabase.from("credit_cards").insert({
      nickname,
      masked_number: maskedNumber || null,
      active
    });
    if (error) throw new Error(error.message);

    revalidatePath("/cc");
    revalidatePath("/requests");
    ccSuccess("Credit card saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    ccError(getErrorMessage(error, "Could not save credit card."));
  }
}

export async function updateCreditCardAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");
    await requireGlobalAdmin(supabase, user.id);

    const id = String(formData.get("id") ?? "").trim();
    const nickname = String(formData.get("nickname") ?? "").trim();
    const maskedNumber = String(formData.get("maskedNumber") ?? "").trim();
    const active = formData.get("active") === "on";
    if (!id || !nickname) throw new Error("Card ID and nickname are required.");

    const { error } = await supabase
      .from("credit_cards")
      .update({ nickname, masked_number: maskedNumber || null, active })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/cc");
    ccSuccess("Credit card updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    ccError(getErrorMessage(error, "Could not update credit card."));
  }
}

export async function deleteCreditCardAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");
    await requireGlobalAdmin(supabase, user.id);

    const id = String(formData.get("id") ?? "").trim();
    if (!id) throw new Error("Card ID is required.");

    const { error } = await supabase.from("credit_cards").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/cc");
    ccSuccess("Credit card deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    ccError(getErrorMessage(error, "Could not delete credit card."));
  }
}

export async function createStatementMonthAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const creditCardId = String(formData.get("creditCardId") ?? "").trim();
    const month = String(formData.get("statementMonth") ?? "").trim();

    if (!creditCardId || !month) throw new Error("Card and statement month are required.");
    const statementDate = toStatementDate(month);
    await requireCcManagerRole(supabase, user.id);

    const { data: existingRows, error: existingError } = await supabase
      .from("cc_statement_months")
      .select("id")
      .eq("credit_card_id", creditCardId)
      .eq("statement_month", statementDate)
      .limit(1);
    if (existingError) throw new Error(existingError.message);

    if ((existingRows ?? []).length > 0) {
      revalidatePath("/cc");
      ccSuccess("Statement month already exists.");
    }

    const { error } = await supabase.from("cc_statement_months").insert({
      project_id: null,
      credit_card_id: creditCardId,
      statement_month: statementDate,
      created_by_user_id: user.id
    });
    if (error) throw new Error(error.message);

    revalidatePath("/cc");
    ccSuccess("Statement month saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    ccError(getErrorMessage(error, "Could not save statement month."));
  }
}

export async function updateStatementMonthAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const id = String(formData.get("id") ?? "").trim();
    const creditCardId = String(formData.get("creditCardId") ?? "").trim();
    const month = String(formData.get("statementMonth") ?? "").trim();
    if (!id || !creditCardId || !month) throw new Error("Statement month, id, and card are required.");

    const { data: existing, error: existingError } = await supabase
      .from("cc_statement_months")
      .select("id")
      .eq("id", id)
      .single();
    if (existingError || !existing) throw new Error("Statement month not found.");
    await requireCcManagerRole(supabase, user.id);

    const statementDate = toStatementDate(month);
    const { error } = await supabase
      .from("cc_statement_months")
      .update({ credit_card_id: creditCardId, statement_month: statementDate })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/cc");
    ccSuccess("Statement month updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    ccError(getErrorMessage(error, "Could not update statement month."));
  }
}

export async function deleteStatementMonthAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const id = String(formData.get("id") ?? "").trim();
    if (!id) throw new Error("Statement month id is required.");

    const { data: existing, error: existingError } = await supabase
      .from("cc_statement_months")
      .select("id")
      .eq("id", id)
      .single();
    if (existingError || !existing) throw new Error("Statement month not found.");
    await requireCcManagerRole(supabase, user.id);

    const { data: matchedLines, error: matchedLinesError } = await supabase
      .from("cc_statement_lines")
      .select("id, matched_purchase_ids")
      .eq("statement_month_id", id);
    if (matchedLinesError) throw new Error(matchedLinesError.message);
    const hasMatchedPurchases = (matchedLines ?? []).some(
      (line) => Array.isArray(line.matched_purchase_ids) && line.matched_purchase_ids.length > 0
    );
    if (hasMatchedPurchases) {
      throw new Error("Cannot delete a statement month that has matched purchases. Remove matches first.");
    }

    const { error } = await supabase.from("cc_statement_months").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/cc");
    ccSuccess("Statement month deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    ccError(getErrorMessage(error, "Could not delete statement month."));
  }
}

export async function addStatementLineAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const statementMonthId = String(formData.get("statementMonthId") ?? "").trim();
    const projectBudgetLineId = String(formData.get("projectBudgetLineId") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));
    const note = String(formData.get("note") ?? "").trim();

    if (!statementMonthId || !projectBudgetLineId) throw new Error("Statement month and budget line are required.");
    if (amount <= 0) throw new Error("Amount must be greater than zero.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id")
      .eq("id", statementMonthId)
      .single();
    if (statementMonthError || !statementMonth) throw new Error("Statement month not found.");

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");
    await requireCcManagerRole(supabase, user.id);

    const { error } = await supabase.from("cc_statement_lines").insert({
      statement_month_id: statementMonthId,
      project_budget_line_id: projectBudgetLineId,
      amount,
      note: note || null
    });
    if (error) throw new Error(error.message);

    revalidatePath("/cc");
    ccSuccess("Statement line added.");
  } catch (error) {
    rethrowIfRedirect(error);
    ccError(getErrorMessage(error, "Could not add statement line."));
  }
}

export async function confirmStatementLineMatchAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const statementLineId = String(formData.get("statementLineId") ?? "").trim();
    const purchaseIds = formData
      .getAll("purchaseId")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (!statementLineId) throw new Error("Statement line is required.");
    if (purchaseIds.length === 0) throw new Error("Select at least one pending purchase to match.");

    const { data: statementLine, error: statementLineError } = await supabase
      .from("cc_statement_lines")
      .select("id, amount, matched_purchase_ids, statement_month_id, project_budget_line_id")
      .eq("id", statementLineId)
      .single();
    if (statementLineError || !statementLine) throw new Error("Statement line not found.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id, credit_card_id, statement_month")
      .eq("id", statementLine.statement_month_id as string)
      .single();
    if (statementMonthError || !statementMonth) throw new Error("Statement month not found.");
    await requireCcManagerRole(supabase, user.id);

    const { data: purchases, error: purchasesError } = await supabase
      .from("purchases")
      .select("id, project_id, budget_line_id, status, pending_cc_amount, credit_card_id, estimated_amount, requested_amount")
      .in("id", purchaseIds);
    if (purchasesError) throw new Error(purchasesError.message);
    if (!purchases || purchases.length !== purchaseIds.length) throw new Error("One or more selected purchases were not found.");

    const selectedTotal = purchases.reduce((sum, purchase) => sum + Number(purchase.pending_cc_amount ?? 0), 0);
    const statementAmount = Number(statementLine.amount ?? 0);
    if (Math.abs(selectedTotal - statementAmount) > 0.01) {
      throw new Error(`Selected purchases total ${selectedTotal.toFixed(2)} but statement line is ${statementAmount.toFixed(2)}.`);
    }

    for (const purchase of purchases) {
      if ((purchase.budget_line_id as string) !== (statementLine.project_budget_line_id as string)) {
        throw new Error("All purchases must match the selected statement budget line.");
      }
      if ((purchase.status as string) !== "pending_cc") {
        throw new Error("Only pending credit-card purchases can be matched.");
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
      if (updateError) throw new Error(updateError.message);

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
      if (eventError) throw new Error(eventError.message);
    }

    const matchedPurchaseIds = Array.from(new Set([...(statementLine.matched_purchase_ids as string[] | null | undefined) ?? [], ...purchaseIds]));
    const { error: lineUpdateError } = await supabase
      .from("cc_statement_lines")
      .update({ matched_purchase_ids: matchedPurchaseIds })
      .eq("id", statementLineId);
    if (lineUpdateError) throw new Error(lineUpdateError.message);

    const { data: openLines, error: openLinesError } = await supabase
      .from("cc_statement_lines")
      .select("id, matched_purchase_ids")
      .eq("statement_month_id", statementMonth.id as string);
    if (openLinesError) throw new Error(openLinesError.message);

    const allMatched = (openLines ?? []).every((line) => Array.isArray(line.matched_purchase_ids) && line.matched_purchase_ids.length > 0);
    if (allMatched) {
      await supabase.from("cc_statement_months").update({ posted_at: new Date().toISOString() }).eq("id", statementMonth.id as string);
    }

    revalidatePath("/cc");
    revalidatePath("/requests");
    revalidatePath("/");
    revalidatePath("/projects");
    ccSuccess("Statement match posted.");
  } catch (error) {
    rethrowIfRedirect(error);
    ccError(getErrorMessage(error, "Could not match statement line."));
  }
}
