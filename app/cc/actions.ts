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

export async function createCreditCardAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
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

export async function createStatementMonthAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const creditCardId = String(formData.get("creditCardId") ?? "").trim();
    const month = String(formData.get("statementMonth") ?? "").trim();

    if (!projectId || !creditCardId || !month) throw new Error("Project, card, and statement month are required.");
    const statementDate = toStatementDate(month);

    const { data: existing, error: existingError } = await supabase
      .from("cc_statement_months")
      .select("id")
      .eq("project_id", projectId)
      .eq("credit_card_id", creditCardId)
      .eq("statement_month", statementDate)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (existing?.id) {
      revalidatePath("/cc");
      ccSuccess("Statement month already exists.");
    }

    const { error } = await supabase.from("cc_statement_months").insert({
      project_id: projectId,
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

export async function addStatementLineAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const statementMonthId = String(formData.get("statementMonthId") ?? "").trim();
    const projectBudgetLineId = String(formData.get("projectBudgetLineId") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));
    const note = String(formData.get("note") ?? "").trim();

    if (!statementMonthId || !projectBudgetLineId) throw new Error("Statement month and budget line are required.");
    if (amount <= 0) throw new Error("Amount must be greater than zero.");

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
      .select("id, project_id, credit_card_id, statement_month")
      .eq("id", statementLine.statement_month_id as string)
      .single();
    if (statementMonthError || !statementMonth) throw new Error("Statement month not found.");

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
      if ((purchase.project_id as string) !== (statementMonth.project_id as string)) {
        throw new Error("All purchases must belong to the same project as the statement month.");
      }
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
          status: "posted",
          posted_amount: pendingAmount,
          pending_cc_amount: 0,
          credit_card_id: (statementMonth.credit_card_id as string) ?? (purchase.credit_card_id as string | null),
          posted_date: new Date().toISOString().slice(0, 10)
        })
        .eq("id", purchase.id as string);
      if (updateError) throw new Error(updateError.message);

      const { error: eventError } = await supabase.from("purchase_events").insert({
        purchase_id: purchase.id as string,
        from_status: "pending_cc",
        to_status: "posted",
        estimated_amount_snapshot: Number(purchase.estimated_amount ?? 0),
        requested_amount_snapshot: Number(purchase.requested_amount ?? 0),
        encumbered_amount_snapshot: 0,
        pending_cc_amount_snapshot: 0,
        posted_amount_snapshot: pendingAmount,
        changed_by_user_id: user.id,
        note: `Matched to statement ${(statementMonth.statement_month as string).slice(0, 7)}`
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
    revalidatePath(`/projects/${statementMonth.project_id as string}`);
    ccSuccess("Statement match posted.");
  } catch (error) {
    rethrowIfRedirect(error);
    ccError(getErrorMessage(error, "Could not match statement line."));
  }
}
