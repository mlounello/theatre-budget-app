"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { getFiscalYearOptions, getHistoricalMonthlyActuals } from "@/lib/db";

type MonthUpdateInput = {
  id?: string;
  monthStart?: string;
  amount: number;
};

type FiscalMonth = {
  fiscalMonthIndex: number;
  monthStart: string;
};

type ComputedMonth = {
  fiscalMonthIndex: number;
  monthStart: string;
  amount: number;
  percent: number;
  source: "historical" | "even";
};

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMonthUpdates(value: FormDataEntryValue | null): MonthUpdateInput[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        id: typeof entry?.id === "string" ? entry.id.trim() : "",
        monthStart: typeof entry?.monthStart === "string" ? entry.monthStart.trim() : "",
        amount: Number.parseFloat(String(entry?.amount ?? "0"))
      }))
      .filter((entry) => (entry.id || entry.monthStart) && Number.isFinite(entry.amount));
  } catch {
    return [];
  }
}

function parseBulkPlanAccountCodes(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function planningSuccess(message: string, params: { fiscalYearId?: string; organizationId?: string } = {}): never {
  const search = new URLSearchParams();
  search.set("ok", message);
  if (params.fiscalYearId) search.set("fiscalYearId", params.fiscalYearId);
  if (params.organizationId) search.set("organizationId", params.organizationId);
  redirect(`/budget-planning?${search.toString()}`);
}

function planningError(message: string, params: { fiscalYearId?: string; organizationId?: string } = {}): never {
  const search = new URLSearchParams();
  search.set("error", message);
  if (params.fiscalYearId) search.set("fiscalYearId", params.fiscalYearId);
  if (params.organizationId) search.set("organizationId", params.organizationId);
  redirect(`/budget-planning?${search.toString()}`);
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

async function requirePlanningAccess(): Promise<{ userId: string }> {
  const access = await getAccessContext();
  if (!access.userId) throw new Error("You must be signed in.");
  if (access.role !== "admin" && access.role !== "project_manager") {
    throw new Error("Only Admin or Project Manager can manage budget plans.");
  }
  return { userId: access.userId };
}

function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function fromCents(value: number): number {
  return Number((value / 100).toFixed(2));
}

function parseYearMonth(value: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (!match) {
    throw new Error("Invalid date format; expected YYYY-MM-DD.");
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("Invalid fiscal year start date.");
  }
  return { year, month };
}

function computeFiscalMonths(fiscalYearStart: string): FiscalMonth[] {
  const { year: startYear, month: startMonth } = parseYearMonth(fiscalYearStart);
  const months: FiscalMonth[] = [];
  const startIndex = startMonth - 1;
  for (let i = 0; i < 12; i += 1) {
    const total = startIndex + i;
    const year = startYear + Math.floor(total / 12);
    const month = (total % 12) + 1;
    const monthStart = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
    months.push({ fiscalMonthIndex: i + 1, monthStart });
  }
  return months;
}

function fiscalMonthIndexForDate(monthStart: string, fiscalYearStart: string): number | null {
  const target = parseYearMonth(monthStart);
  const start = parseYearMonth(fiscalYearStart);
  const diff = (target.year - start.year) * 12 + (target.month - start.month);
  if (diff < 0 || diff > 11) return null;
  return diff + 1;
}

function mapHistoryToFiscalMonths(
  rows: Array<{ monthStart: string; obligatedAmount: number }>,
  fiscalYearStart: string
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const row of rows) {
    const index = fiscalMonthIndexForDate(row.monthStart, fiscalYearStart);
    if (!index) continue;
    totals.set(
      index,
      (totals.get(index) ?? 0) + (Number.isFinite(row.obligatedAmount) ? row.obligatedAmount : 0)
    );
  }
  return totals;
}

function computePlanMonths(params: {
  annualAmount: number;
  fiscalMonths: FiscalMonth[];
  historyByIndex: Map<number, number>;
}): ComputedMonth[] {
  const annualCents = toCents(params.annualAmount);
  if (annualCents < 0) {
    throw new Error("Annual amount must be non-negative.");
  }

  const historyTotalCents = params.fiscalMonths.reduce((sum, month) => {
    const value = params.historyByIndex.get(month.fiscalMonthIndex) ?? 0;
    return sum + toCents(value);
  }, 0);

  if (annualCents === 0) {
    return params.fiscalMonths.map((month) => ({
      ...month,
      amount: 0,
      percent: 0,
      source: historyTotalCents > 0 ? "historical" : "even"
    }));
  }

  if (historyTotalCents <= 0) {
    const base = Math.floor(annualCents / 12);
    let remaining = annualCents - base * 12;
    return params.fiscalMonths.map((month) => {
      const extra = remaining > 0 ? 1 : 0;
      if (remaining > 0) remaining -= 1;
      const cents = base + extra;
      return {
        ...month,
        amount: fromCents(cents),
        percent: annualCents > 0 ? cents / annualCents : 0,
        source: "even"
      };
    });
  }

  const allocations = params.fiscalMonths.map((month) => {
    const historyAmount = params.historyByIndex.get(month.fiscalMonthIndex) ?? 0;
    const historyCents = toCents(historyAmount);
    const ratio = historyTotalCents > 0 ? historyCents / historyTotalCents : 0;
    const raw = annualCents * ratio;
    const floored = Math.floor(raw);
    return {
      month,
      raw,
      floored,
      remainder: raw - floored
    };
  });

  let remaining = annualCents - allocations.reduce((sum, row) => sum + row.floored, 0);
  const sorted = [...allocations].sort((a, b) => {
    if (b.remainder === a.remainder) {
      return a.month.fiscalMonthIndex - b.month.fiscalMonthIndex;
    }
    return b.remainder - a.remainder;
  });

  let cursor = 0;
  while (remaining > 0) {
    const target = sorted[cursor % sorted.length];
    target.floored += 1;
    remaining -= 1;
    cursor += 1;
  }

  return allocations.map((entry) => {
    const cents = entry.floored;
    return {
      ...entry.month,
      amount: fromCents(cents),
      percent: annualCents > 0 ? cents / annualCents : 0,
      source: "historical"
    };
  });
}

async function fetchFiscalYearStart(fiscalYearId: string): Promise<string> {
  const fiscalYears = await getFiscalYearOptions();
  const fiscalYear = fiscalYears.find((fy) => fy.id === fiscalYearId);
  if (!fiscalYear) throw new Error("Fiscal year not found.");
  if (!fiscalYear.startDate) throw new Error("Fiscal year start date is required.");
  return fiscalYear.startDate;
}

async function replaceBudgetPlanMonths(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  planId: string,
  months: ComputedMonth[]
): Promise<void> {
  const { error: deleteError } = await supabase.from("budget_plan_months").delete().eq("budget_plan_id", planId);
  if (deleteError) throw new Error(deleteError.message);

  const insertRows = months.map((month) => ({
    budget_plan_id: planId,
    month_start: month.monthStart,
    fiscal_month_index: month.fiscalMonthIndex,
    amount: month.amount,
    percent: month.percent,
    source: month.source
  }));

  const { error: insertError } = await supabase.from("budget_plan_months").insert(insertRows);
  if (insertError) throw new Error(insertError.message);
}

async function recomputePercents(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  planId: string
): Promise<{ totalCents: number }> {
  const { data, error } = await supabase
    .from("budget_plan_months")
    .select("id, amount")
    .eq("budget_plan_id", planId)
    .order("fiscal_month_index", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((row) => ({
    id: row.id as string,
    amount: Number(row.amount ?? 0)
  }));
  const totalCents = rows.reduce((sum, row) => sum + toCents(row.amount), 0);

  const updates = rows.map((row) => ({
    id: row.id,
    percent: totalCents > 0 ? toCents(row.amount) / totalCents : 0
  }));

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("budget_plan_months")
      .update({ percent: update.percent })
      .eq("id", update.id);
    if (updateError) throw new Error(updateError.message);
  }

  return { totalCents };
}

async function upsertBudgetPlanAnnualAmount(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
  fiscalYearId: string;
  organizationId: string;
  accountCodeId: string;
  annualAmount: number;
  sourceFiscalYearId: string;
}): Promise<void> {
  const {
    supabase,
    userId,
    fiscalYearId,
    organizationId,
    accountCodeId,
    annualAmount,
    sourceFiscalYearId
  } = params;

  const { data: existingPlan, error: existingError } = await supabase
    .from("budget_plans")
    .select("id")
    .eq("fiscal_year_id", fiscalYearId)
    .eq("organization_id", organizationId)
    .eq("account_code_id", accountCodeId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  let planId: string;
  if (existingPlan?.id) {
    const { data: updatedPlan, error: updateError } = await supabase
      .from("budget_plans")
      .update({
        annual_amount: annualAmount,
        source_fiscal_year_id: sourceFiscalYearId || null,
        updated_by_user_id: userId
      })
      .eq("id", existingPlan.id)
      .select("id")
      .single();
    if (updateError || !updatedPlan) throw new Error(updateError?.message ?? "Unable to update budget plan.");
    planId = updatedPlan.id as string;
  } else {
    const { data: insertedPlan, error: insertError } = await supabase
      .from("budget_plans")
      .insert({
        fiscal_year_id: fiscalYearId,
        organization_id: organizationId,
        account_code_id: accountCodeId,
        annual_amount: annualAmount,
        source_fiscal_year_id: sourceFiscalYearId || null,
        created_by_user_id: userId,
        updated_by_user_id: userId
      })
      .select("id")
      .single();
    if (insertError || !insertedPlan) throw new Error(insertError?.message ?? "Unable to create budget plan.");
    planId = insertedPlan.id as string;
  }

  const [targetFiscalYearStart, sourceFiscalYearStart] = await Promise.all([
    fetchFiscalYearStart(fiscalYearId),
    fetchFiscalYearStart(sourceFiscalYearId)
  ]);

  const fiscalMonths = computeFiscalMonths(targetFiscalYearStart);
  const historyRows = await getHistoricalMonthlyActuals({
    fiscalYearId: sourceFiscalYearId,
    organizationId,
    accountCodeIds: [accountCodeId]
  });
  const historyByIndex = mapHistoryToFiscalMonths(
    historyRows.map((row) => ({
      monthStart: row.monthStart,
      obligatedAmount: row.obligatedAmount
    })),
    sourceFiscalYearStart
  );

  const computedMonths = computePlanMonths({
    annualAmount,
    fiscalMonths,
    historyByIndex
  });

  await replaceBudgetPlanMonths(supabase, planId, computedMonths);
}

export async function upsertBudgetPlanAnnualAmountAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const { userId } = await requirePlanningAccess();

    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const accountCodeId = String(formData.get("accountCodeId") ?? "").trim();
    const annualAmount = parseMoney(formData.get("annualAmount"));
    const sourceFiscalYearId = String(formData.get("sourceFiscalYearId") ?? "").trim() || fiscalYearId;

    if (!fiscalYearId || !organizationId || !accountCodeId) {
      throw new Error("Fiscal year, organization, and account code are required.");
    }
    if (annualAmount < 0) {
      throw new Error("Annual amount must be non-negative.");
    }

    await upsertBudgetPlanAnnualAmount({
      supabase,
      userId,
      fiscalYearId,
      organizationId,
      accountCodeId,
      annualAmount,
      sourceFiscalYearId
    });

    revalidatePath("/budget-planning");
    planningSuccess("Budget plan saved.", { fiscalYearId, organizationId });
  } catch (error) {
    rethrowIfRedirect(error);
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    planningError(getErrorMessage(error, "Unable to save budget plan."), { fiscalYearId, organizationId });
  }
}

export async function bulkCreateBudgetPlansAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const { userId } = await requirePlanningAccess();

    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const sourceFiscalYearId = String(formData.get("sourceFiscalYearId") ?? "").trim() || fiscalYearId;
    const accountCodeIds = parseBulkPlanAccountCodes(formData.get("bulkPlanAccountCodesJson"));
    if (!fiscalYearId || !organizationId) {
      throw new Error("Fiscal year and organization are required.");
    }
    if (accountCodeIds.length === 0) {
      throw new Error("No visible rows provided.");
    }

    for (const accountCodeId of accountCodeIds) {
      await upsertBudgetPlanAnnualAmount({
        supabase,
        userId,
        fiscalYearId,
        organizationId,
        accountCodeId,
        annualAmount: 0,
        sourceFiscalYearId
      });
    }

    revalidatePath("/budget-planning");
    planningSuccess("Bulk plans saved.", { fiscalYearId, organizationId });
  } catch (error) {
    rethrowIfRedirect(error);
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    planningError(getErrorMessage(error, "Unable to save bulk plans."), { fiscalYearId, organizationId });
  }
}

async function requireTwelveMonths(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  planId: string,
  label: string
): Promise<void> {
  const { count, error } = await supabase
    .from("budget_plan_months")
    .select("id", { count: "exact", head: true })
    .eq("budget_plan_id", planId);
  if (error) throw new Error(error.message);
  if ((count ?? 0) !== 12) {
    throw new Error(`Expected 12 fiscal months ${label}.`);
  }
}

export async function updateBudgetPlanMonthsAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const { userId } = await requirePlanningAccess();

    const planId = String(formData.get("budgetPlanId") ?? "").trim();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const updates = parseMonthUpdates(formData.get("monthUpdatesJson"));

    if (!planId) throw new Error("Budget plan is required.");
    if (updates.length === 0) throw new Error("No month updates provided.");

    for (const update of updates) {
      if (update.amount < 0) throw new Error("Monthly amount must be non-negative.");
    }

    await requireTwelveMonths(supabase, planId, "before update");

    const { data: existingMonths, error: monthsError } = await supabase
      .from("budget_plan_months")
      .select("id, month_start")
      .eq("budget_plan_id", planId);
    if (monthsError) throw new Error(monthsError.message);

    const byId = new Map<string, string>();
    const byMonthStart = new Map<string, string>();
    for (const row of existingMonths ?? []) {
      if (row.id) byId.set(String(row.id), String(row.id));
      if (row.month_start) byMonthStart.set(String(row.month_start), String(row.id));
    }

    for (const update of updates) {
      const id = update.id && byId.has(update.id) ? update.id : update.monthStart ? byMonthStart.get(update.monthStart) : null;
      if (!id) continue;
      const { error: updateError } = await supabase
        .from("budget_plan_months")
        .update({ amount: update.amount, source: "manual" })
        .eq("id", id);
      if (updateError) throw new Error(updateError.message);
    }

    const { totalCents } = await recomputePercents(supabase, planId);

    await requireTwelveMonths(supabase, planId, "after update");

    const annualAmount = fromCents(totalCents);

    const { error: touchError } = await supabase
      .from("budget_plans")
      .update({ annual_amount: annualAmount, updated_by_user_id: userId })
      .eq("id", planId);
    if (touchError) throw new Error(touchError.message);

    revalidatePath("/budget-planning");
    planningSuccess("Monthly plan updated.", { fiscalYearId, organizationId });
  } catch (error) {
    rethrowIfRedirect(error);
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    planningError(getErrorMessage(error, "Unable to update monthly plan."), { fiscalYearId, organizationId });
  }
}
