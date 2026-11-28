"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { type ActionState, emptyState, ok, err, getErrorMessage, parseIdsJson } from "@/lib/action-helpers";
import { requireCcManagerRole } from "@/app/cc/actions/_shared";

function toStatementDate(monthValue: string): string {
  const trimmed = monthValue.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) throw new Error("Statement month must be in YYYY-MM format.");
  return `${trimmed}-01`;
}

async function requireGlobalAdmin(): Promise<void> {
  const access = await getAccessContext();
  if (access.role !== "admin") {
    throw new Error("Only Admin can manage credit cards.");
  }
}

async function requireFiscalYearForDate(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  fiscalYearId: string,
  date: string
): Promise<void> {
  if (!fiscalYearId) throw new Error("Fiscal year is required.");
  const { data, error } = await supabase
    .from("fiscal_years")
    .select("id")
    .eq("id", fiscalYearId)
    .lte("start_date", date)
    .gte("end_date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("The selected date is outside the selected fiscal year.");
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
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();

    if (!creditCardId || !month || !fiscalYearId) return err("Fiscal year, card, and statement month are required.");
    const statementDate = toStatementDate(month);
    await requireCcManagerRole();
    await requireFiscalYearForDate(supabase, fiscalYearId, statementDate);

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
      fiscal_year_id: fiscalYearId,
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
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    if (!id || !creditCardId || !month || !fiscalYearId) return err("Fiscal year, statement month, id, and card are required.");

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
    await requireFiscalYearForDate(supabase, fiscalYearId, statementDate);
    const { data: updated, error } = await supabase
      .from("cc_statement_months")
      .update({ fiscal_year_id: fiscalYearId, credit_card_id: creditCardId, statement_month: statementDate })
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
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    if (applyCreditCard && !creditCardId) return err("Credit card is required when applying credit card.");
    if (applyMonth && !month) return err("Statement month is required when applying month.");
    if (!fiscalYearId) return err("Fiscal year is required.");
    if (statementDate) await requireFiscalYearForDate(supabase, fiscalYearId, statementDate);

    const { data: months, error: monthsError } = await supabase
      .from("cc_statement_months")
      .select("id, fiscal_year_id, credit_card_id, statement_month, posted_at, posted_to_banner_at")
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
          statement_month: applyMonth ? (statementDate as string) : (monthRow.statement_month as string),
          fiscal_year_id: fiscalYearId
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
