"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { getFiscalYearOptions, getHistoricalMonthlyActuals } from "@/lib/db";

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

export type InstitutionalAllocationImportRow = {
  orgCode: string;
  orgName: string;
  accountCode: string;
  accountName: string;
  monthlyAmounts: Record<string, number>;
  annualAmount: number;
  sourceRow: number;
};

export type InstitutionalAllocationImportPreview = {
  fiscalYearName: string;
  fiscalYearStartDate: string;
  fiscalYearEndDate: string;
  rows: InstitutionalAllocationImportRow[];
  totalsByOrg: Record<string, number>;
  totalsByMonth: Record<string, number>;
  grandTotal: number;
  expectedGrandTotal: number | null;
  errors: string[];
  warnings: string[];
};

type AllocationImportConfig = {
  fiscalYearName: string;
  fiscalYearStartDate: string;
  fiscalYearEndDate: string;
  expectedGrandTotal: number | null;
  requiredOrganizations: Record<string, string>;
  months: string[];
  monthAliases: Map<string, string>;
};

const DEFAULT_ALLOCATION_IMPORT_FISCAL_YEAR = "FY27";
const DEFAULT_ALLOCATION_IMPORT_START_DATE = "2026-06-01";
const DEFAULT_ALLOCATION_IMPORT_END_DATE = "2027-05-31";
const DEFAULT_ALLOCATION_IMPORT_ORGS = {
  "2AC200": "Theatre",
  "2AC230": "Theatre Productions"
} as const;
const FISCAL_MONTH_ALIASES = [
  ["jun", "june"],
  ["jul", "july"],
  ["aug", "august"],
  ["sep", "sept", "september"],
  ["oct", "october"],
  ["nov", "november"],
  ["dec", "december"],
  ["jan", "january"],
  ["feb", "february"],
  ["mar", "march"],
  ["apr", "april"],
  ["may"]
];

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

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellToText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((entry) => entry.text).join("");
    }
  }
  return String(value).trim();
}

function cellToMoney(value: ExcelJS.CellValue): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = cellToText(value)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/[()]/g, (char) => (char === "(" ? "-" : ""));
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function addMonths(dateIso: string, offset: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function buildJuneMayMonths(startDate: string): string[] {
  return Array.from({ length: 12 }, (_, index) => addMonths(startDate, index));
}

function buildMonthAliases(months: string[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (let index = 0; index < FISCAL_MONTH_ALIASES.length; index += 1) {
    const monthStart = months[index];
    if (!monthStart) continue;
    for (const alias of FISCAL_MONTH_ALIASES[index]) {
      aliases.set(alias, monthStart);
    }
  }
  return aliases;
}

function parseDateInput(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : fallback;
}

function parseOptionalExpectedTotal(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildAllocationImportConfig(formData: FormData): AllocationImportConfig {
  const fiscalYearName = String(formData.get("fiscalYearName") ?? DEFAULT_ALLOCATION_IMPORT_FISCAL_YEAR).trim() || DEFAULT_ALLOCATION_IMPORT_FISCAL_YEAR;
  const fiscalYearStartDate = parseDateInput(formData.get("fiscalYearStartDate"), DEFAULT_ALLOCATION_IMPORT_START_DATE);
  const fiscalYearEndDate = parseDateInput(formData.get("fiscalYearEndDate"), DEFAULT_ALLOCATION_IMPORT_END_DATE);
  const months = buildJuneMayMonths(fiscalYearStartDate);
  return {
    fiscalYearName,
    fiscalYearStartDate,
    fiscalYearEndDate,
    expectedGrandTotal: parseOptionalExpectedTotal(formData.get("expectedGrandTotal")),
    requiredOrganizations: DEFAULT_ALLOCATION_IMPORT_ORGS,
    months,
    monthAliases: buildMonthAliases(months)
  };
}

function monthFromHeader(value: string, config: AllocationImportConfig): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.includes("year-end") || normalized.includes("year end") || normalized.includes("audit")) return null;
  for (const [alias, monthStart] of config.monthAliases) {
    const pattern = new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, "i");
    if (pattern.test(normalized)) return monthStart;
  }
  return null;
}

function parseAccountCodeFromRow(values: string[]): { accountCode: string; accountName: string } | null {
  for (let idx = 0; idx < values.length; idx += 1) {
    const text = values[idx];
    const match = /\b(\d{5})\b/.exec(text);
    if (!match) continue;
    const accountCode = match[1];
    const sameCellName = text.replace(accountCode, "").replace(/[-|:]/g, " ").trim();
    const nextName = values.slice(idx + 1).find((value) => value.trim() && !/^\$?[-(),.\d\s]+$/.test(value.trim())) ?? "";
    const accountName = sameCellName || nextName || `Account ${accountCode}`;
    return { accountCode, accountName };
  }
  return null;
}

function detectHeaderRow(
  worksheet: ExcelJS.Worksheet,
  config: AllocationImportConfig
): { rowNumber: number; monthColumns: Map<string, number> } | null {
  for (let rowNumber = 1; rowNumber <= Math.min(20, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const monthColumns = new Map<string, number>();
    row.eachCell((cell, colNumber) => {
      const monthStart = monthFromHeader(cellToText(cell.value), config);
      if (monthStart && !monthColumns.has(monthStart)) {
        monthColumns.set(monthStart, colNumber);
      }
    });
    if (monthColumns.size >= 8) {
      return { rowNumber, monthColumns };
    }
  }
  return null;
}

function buildImportPreview(
  config: AllocationImportConfig,
  rows: InstitutionalAllocationImportRow[],
  errors: string[],
  warnings: string[]
): InstitutionalAllocationImportPreview {
  const totalsByOrg: Record<string, number> = {};
  const totalsByMonth: Record<string, number> = Object.fromEntries(config.months.map((month) => [month, 0]));
  for (const row of rows) {
    totalsByOrg[row.orgCode] = Number(((totalsByOrg[row.orgCode] ?? 0) + row.annualAmount).toFixed(2));
    for (const month of config.months) {
      totalsByMonth[month] = Number(((totalsByMonth[month] ?? 0) + (row.monthlyAmounts[month] ?? 0)).toFixed(2));
    }
  }
  const grandTotal = Number(rows.reduce((sum, row) => sum + row.annualAmount, 0).toFixed(2));
  if (config.expectedGrandTotal !== null && Math.abs(grandTotal - config.expectedGrandTotal) > 0.01) {
    warnings.push(`Imported operating-month total is ${grandTotal.toFixed(2)}; expected ${config.expectedGrandTotal.toFixed(2)}.`);
  }
  for (const orgCode of Object.keys(config.requiredOrganizations)) {
    if (!rows.some((row) => row.orgCode === orgCode)) {
      errors.push(`No import rows were found for required org ${orgCode}.`);
    }
  }
  return {
    fiscalYearName: config.fiscalYearName,
    fiscalYearStartDate: config.fiscalYearStartDate,
    fiscalYearEndDate: config.fiscalYearEndDate,
    rows,
    totalsByOrg,
    totalsByMonth,
    grandTotal,
    expectedGrandTotal: config.expectedGrandTotal,
    errors,
    warnings
  };
}

async function parseInstitutionalAllocationWorkbook(
  file: File,
  config: AllocationImportConfig
): Promise<InstitutionalAllocationImportPreview> {
  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.from(await file.arrayBuffer());
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet =
    workbook.worksheets.find((sheet) => !["instructions", "template"].includes(sheet.name.trim().toLowerCase())) ??
    workbook.worksheets[0];
  if (!worksheet) {
    return buildImportPreview(config, [], ["Workbook does not contain any worksheets."], []);
  }

  const detected = detectHeaderRow(worksheet, config);
  if (!detected) {
    return buildImportPreview(config, [], ["Could not find June-May monthly allocation headers."], []);
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: InstitutionalAllocationImportRow[] = [];
  let currentOrgCode: string | null = null;

  for (let rowNumber = detected.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      values.push(cellToText(cell.value));
    });
    const joined = values.join(" ").trim();
    if (!joined) continue;

    for (const orgCode of Object.keys(config.requiredOrganizations)) {
      if (new RegExp(`\\b${orgCode}\\b`, "i").test(joined)) {
        currentOrgCode = orgCode;
      }
    }

    const account = parseAccountCodeFromRow(values);
    if (!account) continue;
    if (!currentOrgCode) {
      errors.push(`Row ${rowNumber}: account ${account.accountCode} appears before an org heading.`);
      continue;
    }

    const monthlyAmounts: Record<string, number> = {};
    let annualAmount = 0;
    for (const month of config.months) {
      const column = detected.monthColumns.get(month);
      if (!column) {
        errors.push(`Missing monthly column for ${month}.`);
        continue;
      }
      const amount = Number(cellToMoney(row.getCell(column).value).toFixed(2));
      monthlyAmounts[month] = amount;
      annualAmount += amount;
    }
    annualAmount = Number(annualAmount.toFixed(2));
    if (annualAmount === 0) {
      warnings.push(`Row ${rowNumber}: ${currentOrgCode} / ${account.accountCode} has zero monthly allocation.`);
    }

    rows.push({
      orgCode: currentOrgCode,
      orgName: config.requiredOrganizations[currentOrgCode],
      accountCode: account.accountCode,
      accountName: account.accountName,
      monthlyAmounts,
      annualAmount,
      sourceRow: rowNumber
    });
  }

  if (rows.length === 0) {
    errors.push("No account allocation rows were found.");
  }

  return buildImportPreview(config, rows, [...new Set(errors)], [...new Set(warnings)]);
}

function parsePreviewPayload(value: FormDataEntryValue | null): InstitutionalAllocationImportPreview {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Missing import preview payload.");
  }
  const parsed = JSON.parse(value) as InstitutionalAllocationImportPreview;
  if (!parsed || !parsed.fiscalYearName || !parsed.fiscalYearStartDate || !parsed.fiscalYearEndDate || !Array.isArray(parsed.rows)) {
    throw new Error("Invalid institutional allocation import preview payload.");
  }
  return parsed;
}

async function ensureImportFiscalYear(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  preview: InstitutionalAllocationImportPreview
): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from("fiscal_years")
    .select("id")
    .eq("name", preview.fiscalYearName)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("fiscal_years")
      .update({ start_date: preview.fiscalYearStartDate, end_date: preview.fiscalYearEndDate, status: "active" })
      .eq("id", existing.id as string);
    if (updateError) throw new Error(updateError.message);
    return existing.id as string;
  }

  const { data: maxSortRows, error: maxSortError } = await supabase
    .from("fiscal_years")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (maxSortError) throw new Error(maxSortError.message);

  const { data: inserted, error: insertError } = await supabase
    .from("fiscal_years")
    .insert({
      name: preview.fiscalYearName,
      start_date: preview.fiscalYearStartDate,
      end_date: preview.fiscalYearEndDate,
      status: "active",
      sort_order: ((maxSortRows?.[0]?.sort_order as number | null) ?? -1) + 1
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new Error(insertError?.message ?? `Could not create ${preview.fiscalYearName}.`);
  return inserted.id as string;
}

async function ensureImportOrganization(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  fiscalYearId: string,
  orgCode: string,
  orgName: string
): Promise<string> {
  const { data: existingRows, error: existingError } = await supabase
    .from("organizations")
    .select("id")
    .eq("fiscal_year_id", fiscalYearId)
    .eq("org_code", orgCode)
    .limit(1);
  if (existingError) throw new Error(existingError.message);
  const existing = existingRows?.[0];
  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("organizations")
      .update({ name: orgName })
      .eq("id", existing.id as string);
    if (updateError) throw new Error(updateError.message);
    return existing.id as string;
  }

  const { data: maxSortRows, error: maxSortError } = await supabase
    .from("organizations")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (maxSortError) throw new Error(maxSortError.message);

  const { data: inserted, error: insertError } = await supabase
    .from("organizations")
    .insert({
      fiscal_year_id: fiscalYearId,
      org_code: orgCode,
      name: orgName,
      sort_order: ((maxSortRows?.[0]?.sort_order as number | null) ?? -1) + 1
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new Error(insertError?.message ?? `Could not create org ${orgCode}.`);
  return inserted.id as string;
}

async function ensureImportAccountCode(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  accountCode: string,
  accountName: string
): Promise<string> {
  const { data, error } = await supabase
    .from("account_codes")
    .upsert(
      {
        code: accountCode,
        category: accountName,
        name: accountName,
        active: true,
        is_revenue: false
      },
      { onConflict: "code" }
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? `Could not upsert account ${accountCode}.`);
  return data.id as string;
}

async function upsertImportBudgetPlan(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  fiscalYearId: string;
  organizationId: string;
  accountCodeId: string;
  annualAmount: number;
  userId: string;
}): Promise<string> {
  const { supabase, fiscalYearId, organizationId, accountCodeId, annualAmount, userId } = params;
  const { data: existing, error: existingError } = await supabase
    .from("budget_plans")
    .select("id")
    .eq("fiscal_year_id", fiscalYearId)
    .eq("organization_id", organizationId)
    .eq("account_code_id", accountCodeId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing?.id) {
    const { data: updated, error: updateError } = await supabase
      .from("budget_plans")
      .update({ annual_amount: annualAmount, updated_by_user_id: userId, source_fiscal_year_id: fiscalYearId })
      .eq("id", existing.id as string)
      .select("id")
      .single();
    if (updateError || !updated) throw new Error(updateError?.message ?? "Could not update budget plan.");
    return updated.id as string;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("budget_plans")
    .insert({
      fiscal_year_id: fiscalYearId,
      organization_id: organizationId,
      account_code_id: accountCodeId,
      annual_amount: annualAmount,
      source_fiscal_year_id: fiscalYearId,
      created_by_user_id: userId,
      updated_by_user_id: userId
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new Error(insertError?.message ?? "Could not create budget plan.");
  return inserted.id as string;
}

async function upsertImportMonths(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  planId: string,
  monthlyAmounts: Record<string, number>,
  annualAmount: number,
  months: string[]
): Promise<void> {
  for (let index = 0; index < months.length; index += 1) {
    const monthStart = months[index];
    const amount = Number((monthlyAmounts[monthStart] ?? 0).toFixed(2));
    const { data: existing, error: existingError } = await supabase
      .from("budget_plan_months")
      .select("id")
      .eq("budget_plan_id", planId)
      .eq("month_start", monthStart)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const values = {
      fiscal_month_index: index + 1,
      amount,
      percent: annualAmount > 0 ? amount / annualAmount : 0,
      source: "manual"
    };

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("budget_plan_months")
        .update(values)
        .eq("id", existing.id as string);
      if (updateError) throw new Error(updateError.message);
    } else {
      const { error: insertError } = await supabase.from("budget_plan_months").insert({
        budget_plan_id: planId,
        month_start: monthStart,
        ...values
      });
      if (insertError) throw new Error(insertError.message);
    }
  }
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

async function requireAllocationImportAccess(): Promise<{ userId: string }> {
  const access = await getAccessContext();
  if (!access.userId) throw new Error("You must be signed in.");
  if (access.role !== "admin") {
    throw new Error("Only Admin can import institutional allocations.");
  }
  return { userId: access.userId };
}

export type InstitutionalAllocationImportActionState = ActionState & {
  preview: InstitutionalAllocationImportPreview | null;
  previewPayload: string;
};

const emptyImportState: InstitutionalAllocationImportActionState = {
  ok: true,
  message: "",
  timestamp: 0,
  preview: null,
  previewPayload: ""
};

export async function previewInstitutionalAllocationImportAction(
  _prevState: InstitutionalAllocationImportActionState = emptyImportState,
  formData: FormData
): Promise<InstitutionalAllocationImportActionState> {
  try {
    void _prevState;
    await requireAllocationImportAccess();
    const config = buildAllocationImportConfig(formData);
    const file = formData.get("allocationFile");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Upload an institutional allocation XLSX file.");
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      throw new Error("Allocation import requires an .xlsx workbook.");
    }

    const preview = await parseInstitutionalAllocationWorkbook(file, config);
    const canCommit = preview.errors.length === 0;
    return {
      ok: canCommit,
      message: canCommit
        ? `Preview ready: ${preview.rows.length} rows, ${preview.grandTotal.toFixed(2)} total.`
        : `Preview found ${preview.errors.length} error(s).`,
      timestamp: Date.now(),
      preview,
      previewPayload: JSON.stringify(preview)
    };
  } catch (error) {
    rethrowIfRedirect(error);
    return {
      ok: false,
      message: getErrorMessage(error, "Unable to preview institutional allocation import."),
      timestamp: Date.now(),
      preview: null,
      previewPayload: ""
    };
  }
}

export async function commitInstitutionalAllocationImportAction(
  _prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  try {
    void _prevState;
    const { userId } = await requireAllocationImportAccess();
    const supabase = await getSupabaseServerClient();
    const preview = parsePreviewPayload(formData.get("previewPayload"));
    if (preview.errors.length > 0) {
      throw new Error("Resolve preview errors before committing the import.");
    }

    const fiscalYearId = await ensureImportFiscalYear(supabase, preview);
    const orgIdByCode = new Map<string, string>();
    const accountIdByCode = new Map<string, string>();
    let planCount = 0;

    for (const row of preview.rows) {
      let organizationId = orgIdByCode.get(row.orgCode);
      if (!organizationId) {
        organizationId = await ensureImportOrganization(supabase, fiscalYearId, row.orgCode, row.orgName);
        orgIdByCode.set(row.orgCode, organizationId);
      }

      let accountCodeId = accountIdByCode.get(row.accountCode);
      if (!accountCodeId) {
        accountCodeId = await ensureImportAccountCode(supabase, row.accountCode, row.accountName);
        accountIdByCode.set(row.accountCode, accountCodeId);
      }

      const planId = await upsertImportBudgetPlan({
        supabase,
        fiscalYearId,
        organizationId,
        accountCodeId,
        annualAmount: row.annualAmount,
        userId
      });
      await upsertImportMonths(supabase, planId, row.monthlyAmounts, row.annualAmount, Object.keys(row.monthlyAmounts).sort());
      planCount += 1;
    }

    revalidatePath("/budget-planning");
    revalidatePath("/institutional-budget");
    revalidatePath("/overview");
    return ok(`${preview.fiscalYearName} allocation import committed. Updated ${planCount} budget plans.`);
  } catch (error) {
    rethrowIfRedirect(error);
    return err(getErrorMessage(error, "Unable to commit institutional allocation import."));
  }
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
  for (const month of months) {
    const { data: existing, error: existingError } = await supabase
      .from("budget_plan_months")
      .select("id")
      .eq("budget_plan_id", planId)
      .eq("month_start", month.monthStart)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const values = {
      fiscal_month_index: month.fiscalMonthIndex,
      amount: month.amount,
      percent: month.percent,
      source: month.source
    };

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("budget_plan_months")
        .update(values)
        .eq("id", existing.id as string);
      if (updateError) throw new Error(updateError.message);
    } else {
      const { error: insertError } = await supabase.from("budget_plan_months").insert({
        budget_plan_id: planId,
        month_start: month.monthStart,
        ...values
      });
      if (insertError) throw new Error(insertError.message);
    }
  }
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

export async function upsertBudgetPlanAnnualAmountAction(
  _prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  try {
    void _prevState;
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
    return ok("Budget plan saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    return err(getErrorMessage(error, "Unable to save budget plan."));
  }
}

export async function bulkCreateBudgetPlansAction(
  _prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  try {
    void _prevState;
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
    return ok("Bulk plans saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    return err(getErrorMessage(error, "Unable to save bulk plans."));
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

export async function updateBudgetPlanMonthsAction(
  _prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  try {
    void _prevState;
    const supabase = await getSupabaseServerClient();
    const { userId } = await requirePlanningAccess();

    const planId = String(formData.get("budgetPlanId") ?? "").trim();
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
    return ok("Monthly plan updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    return err(getErrorMessage(error, "Unable to update monthly plan."));
  }
}
