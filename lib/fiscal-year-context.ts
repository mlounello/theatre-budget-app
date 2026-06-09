import type { FiscalYearOption } from "@/lib/db";

export const GLOBAL_FISCAL_YEAR_STORAGE_KEY = "tba_global_fiscal_year_id";

function todayYmd(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function resolveCurrentFiscalYearId(fiscalYears: FiscalYearOption[], date = new Date()): string {
  const ymd = todayYmd(date);
  const containingToday = fiscalYears.find((fy) => Boolean(fy.startDate) && Boolean(fy.endDate) && fy.startDate! <= ymd && ymd <= fy.endDate!);
  if (containingToday) return containingToday.id;

  const openEnded = fiscalYears.find((fy) => Boolean(fy.startDate) && !fy.endDate && fy.startDate! <= ymd);
  if (openEnded) return openEnded.id;

  const mostRecent = [...fiscalYears]
    .filter((fy) => Boolean(fy.startDate))
    .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0];
  return mostRecent?.id ?? fiscalYears[0]?.id ?? "";
}

export function resolveRequestedFiscalYearId(
  fiscalYears: FiscalYearOption[],
  requestedFiscalYearId: string | null | undefined,
  options: { allowAll?: boolean } = {}
): string {
  const requested = (requestedFiscalYearId ?? "").trim();
  if (requested === "all" && options.allowAll) return requested;
  if (requested && fiscalYears.some((fy) => fy.id === requested)) return requested;
  return resolveCurrentFiscalYearId(fiscalYears);
}
