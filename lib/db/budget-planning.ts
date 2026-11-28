import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { BudgetPlanMonthRow, BudgetPlanRow, MonthlyActualByOrgAccountRow } from "@/lib/types";
import { type FiscalYearOption, type OrganizationOption, type AccountCodeOption, asNumber } from "@/lib/db/shared";
import { getFiscalYearOptions, getFiscalYearOrganizationOptions, getAccountCodeOptions } from "@/lib/db/options";

export async function getBudgetPlanningOptions(): Promise<{
  fiscalYears: FiscalYearOption[];
  organizations: OrganizationOption[];
  accountCodes: AccountCodeOption[];
}> {
  const [fiscalYears, organizations, accountCodes] = await Promise.all([
    getFiscalYearOptions(),
    getFiscalYearOrganizationOptions(),
    getAccountCodeOptions()
  ]);

  return { fiscalYears, organizations, accountCodes };
}

export async function getBudgetPlanningData(params: {
  fiscalYearId: string;
  organizationId: string;
}): Promise<{
  fiscalYears: FiscalYearOption[];
  organizations: OrganizationOption[];
  accountCodes: AccountCodeOption[];
  plans: BudgetPlanRow[];
  months: BudgetPlanMonthRow[];
  actuals: MonthlyActualByOrgAccountRow[];
  planByAccountCodeId: Map<string, BudgetPlanRow>;
  monthsByPlanId: Map<string, BudgetPlanMonthRow[]>;
  actualsByAccountCodeId: Map<string, MonthlyActualByOrgAccountRow[]>;
}> {
  const { fiscalYearId, organizationId } = params;
  const { fiscalYears, organizations, accountCodes } = await getBudgetPlanningOptions();

  if (!fiscalYearId || !organizationId) {
    return {
      fiscalYears,
      organizations,
      accountCodes,
      plans: [],
      months: [],
      actuals: [],
      planByAccountCodeId: new Map<string, BudgetPlanRow>(),
      monthsByPlanId: new Map<string, BudgetPlanMonthRow[]>(),
      actualsByAccountCodeId: new Map<string, MonthlyActualByOrgAccountRow[]>()
    };
  }

  const plans = await getBudgetPlans({ fiscalYearId, organizationId });
  const planIds = plans.map((plan) => plan.id);

  const [months, actuals] = await Promise.all([
    getBudgetPlanMonths(planIds),
    getHistoricalMonthlyActuals({ fiscalYearId, organizationId })
  ]);

  const planByAccountCodeId = new Map<string, BudgetPlanRow>();
  for (const plan of plans) {
    planByAccountCodeId.set(plan.accountCodeId, plan);
  }

  const monthsByPlanId = new Map<string, BudgetPlanMonthRow[]>();
  for (const month of months) {
    const list = monthsByPlanId.get(month.budgetPlanId) ?? [];
    list.push(month);
    monthsByPlanId.set(month.budgetPlanId, list);
  }
  for (const [planId, list] of monthsByPlanId) {
    list.sort((a, b) => a.fiscalMonthIndex - b.fiscalMonthIndex);
    monthsByPlanId.set(planId, list);
  }

  const actualsByAccountCodeId = new Map<string, MonthlyActualByOrgAccountRow[]>();
  for (const row of actuals) {
    const list = actualsByAccountCodeId.get(row.accountCodeId) ?? [];
    list.push(row);
    actualsByAccountCodeId.set(row.accountCodeId, list);
  }
  for (const [accountCodeId, list] of actualsByAccountCodeId) {
    list.sort((a, b) => a.monthStart.localeCompare(b.monthStart));
    actualsByAccountCodeId.set(accountCodeId, list);
  }

  return {
    fiscalYears,
    organizations,
    accountCodes,
    plans,
    months,
    actuals,
    planByAccountCodeId,
    monthsByPlanId,
    actualsByAccountCodeId
  };
}

export async function getBudgetPlans(params: {
  fiscalYearId: string;
  organizationId: string;
}): Promise<BudgetPlanRow[]> {
  const supabase = await getSupabaseServerClient();
  const { fiscalYearId, organizationId } = params;

  const { data, error } = await supabase
    .from("budget_plans")
    .select(
      "id, fiscal_year_id, organization_id, account_code_id, annual_amount, source_fiscal_year_id, created_at, updated_at, account_codes(code, category, name)"
    )
    .eq("fiscal_year_id", fiscalYearId)
    .eq("organization_id", organizationId)
    .order("account_code_id", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const account = row.account_codes as { code?: string; category?: string; name?: string } | null;
    const label = account ? `${account.code ?? ""} | ${account.category ?? ""} | ${account.name ?? ""}`.trim() : "";
    return {
      id: row.id as string,
      fiscalYearId: row.fiscal_year_id as string,
      organizationId: row.organization_id as string,
      accountCodeId: row.account_code_id as string,
      accountCodeLabel: label,
      annualAmount: asNumber(row.annual_amount as string | number | null),
      sourceFiscalYearId: (row.source_fiscal_year_id as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    };
  });
}

export async function getBudgetPlanMonths(planIds: string[]): Promise<BudgetPlanMonthRow[]> {
  const supabase = await getSupabaseServerClient();
  if (planIds.length === 0) return [];

  const { data, error } = await supabase
    .from("budget_plan_months")
    .select("id, budget_plan_id, month_start, fiscal_month_index, amount, percent, source, created_at, updated_at")
    .in("budget_plan_id", planIds)
    .order("fiscal_month_index", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    budgetPlanId: row.budget_plan_id as string,
    monthStart: row.month_start as string,
    fiscalMonthIndex: (row.fiscal_month_index as number | null) ?? 0,
    amount: asNumber(row.amount as string | number | null),
    percent: Number(row.percent ?? 0),
    source: (row.source as "historical" | "manual" | "even") ?? "historical",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }));
}

export async function getHistoricalMonthlyActuals(params: {
  fiscalYearId: string;
  organizationId: string;
  accountCodeIds?: string[];
}): Promise<MonthlyActualByOrgAccountRow[]> {
  const supabase = await getSupabaseServerClient();
  const { fiscalYearId, organizationId, accountCodeIds } = params;

  let query = supabase
    .from("v_monthly_actuals_by_org_account")
    .select("fiscal_year_id, organization_id, account_code_id, month_start, obligated_amount")
    .eq("fiscal_year_id", fiscalYearId)
    .eq("organization_id", organizationId);

  if (accountCodeIds && accountCodeIds.length > 0) {
    query = query.in("account_code_id", accountCodeIds);
  }

  const { data, error } = await query.order("month_start", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
    organizationId: row.organization_id as string,
    accountCodeId: row.account_code_id as string,
    monthStart: row.month_start as string,
    obligatedAmount: asNumber(row.obligated_amount as string | number | null)
  }));
}
