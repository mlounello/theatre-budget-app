import { getBudgetPlanMonths, getBudgetPlanningData, getBudgetPlans, getHistoricalMonthlyActuals } from "@/lib/db";
import { getAccessContext } from "@/lib/access";
import { redirect } from "next/navigation";
import { BudgetPlanningExportButton } from "@/app/budget-planning/budget-planning-export";
import { InstitutionalAllocationImportPanel } from "@/app/budget-planning/institutional-allocation-import-panel";
import { BudgetPlanningMatrix, type BudgetPlanningMatrixRow } from "@/app/budget-planning/budget-planning-matrix";
import { resolveRequestedFiscalYearId } from "@/lib/fiscal-year-context";
import { FilterToolbar } from "@/components/ui/toolbars";

export default async function BudgetPlanningPage({
  searchParams
}: {
  searchParams?: Promise<{
    fiscalYearId?: string;
    organizationId?: string;
    q?: string;
    show?: string;
  }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");
  const isAdmin = access.role === "admin";

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const searchQuery = (resolvedSearchParams?.q ?? "").trim().toLowerCase();
  const showFilter = (resolvedSearchParams?.show ?? "").trim().toLowerCase();

  const initialPlanningData = await getBudgetPlanningData({
    fiscalYearId: resolvedSearchParams?.fiscalYearId ?? "",
    organizationId: resolvedSearchParams?.organizationId ?? ""
  });
  const { fiscalYears, organizations, accountCodes } = initialPlanningData;
  if (fiscalYears.length === 0 || organizations.length === 0 || accountCodes.length === 0) {
    return (
      <section>
        <header className="sectionHeader">
          <p className="eyebrow">Planning</p>
          <h1>Budget Planning</h1>
          <p className="heroSubtitle">No fiscal years or organizations are available yet.</p>
        </header>
      </section>
    );
  }

  const requestedFiscalYearId = (resolvedSearchParams?.fiscalYearId ?? "").trim();
  const fiscalYearId = resolveRequestedFiscalYearId(fiscalYears, requestedFiscalYearId);

  const orgOptions = organizations.filter((org) => !org.fiscalYearId || org.fiscalYearId === fiscalYearId);
  const requestedOrganizationId = (resolvedSearchParams?.organizationId ?? "").trim();
  const fallbackOrganizationId = orgOptions[0]?.id ?? organizations[0]?.id ?? "";
  const organizationId = orgOptions.some((org) => org.id === requestedOrganizationId) ? requestedOrganizationId : fallbackOrganizationId;
  const selectedFiscalYear = fiscalYears.find((fy) => fy.id === fiscalYearId) ?? null;
  const selectedOrganization = organizations.find((org) => org.id === organizationId) ?? null;

  if (!fiscalYearId || !organizationId) {
    return (
      <section>
        <header className="sectionHeader">
          <p className="eyebrow">Planning</p>
          <h1>Budget Planning</h1>
          <p className="heroSubtitle">Select a fiscal year and organization to begin planning.</p>
        </header>
      </section>
    );
  }

  const rawFiscalYearId = (resolvedSearchParams?.fiscalYearId ?? "").trim();
  const rawOrganizationId = (resolvedSearchParams?.organizationId ?? "").trim();

  let planningData = initialPlanningData;
  if (fiscalYearId !== rawFiscalYearId || organizationId !== rawOrganizationId) {
    const plans = await getBudgetPlans({ fiscalYearId, organizationId });
    const planIds = plans.map((plan) => plan.id);
    const [months, actuals] = await Promise.all([
      getBudgetPlanMonths(planIds),
      getHistoricalMonthlyActuals({ fiscalYearId, organizationId })
    ]);

    const planByAccountCodeId = new Map(plans.map((plan) => [plan.accountCodeId, plan]));

    const monthsByPlanId = new Map<string, typeof months>();
    for (const month of months) {
      const list = monthsByPlanId.get(month.budgetPlanId) ?? [];
      list.push(month);
      monthsByPlanId.set(month.budgetPlanId, list);
    }
    for (const [planId, list] of monthsByPlanId) {
      list.sort((a, b) => a.fiscalMonthIndex - b.fiscalMonthIndex);
      monthsByPlanId.set(planId, list);
    }

    const actualsByAccountCodeId = new Map<string, typeof actuals>();
    for (const row of actuals) {
      const list = actualsByAccountCodeId.get(row.accountCodeId) ?? [];
      list.push(row);
      actualsByAccountCodeId.set(row.accountCodeId, list);
    }
    for (const [accountCodeId, list] of actualsByAccountCodeId) {
      list.sort((a, b) => a.monthStart.localeCompare(b.monthStart));
      actualsByAccountCodeId.set(accountCodeId, list);
    }

    planningData = {
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

  const selectedStart = selectedFiscalYear?.startDate ?? "";
  const priorFiscalYear = planningData.fiscalYears
    .filter((fy) => fy.startDate && selectedStart && fy.startDate < selectedStart)
    .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] ?? null;
  const priorActuals = priorFiscalYear ? await getHistoricalMonthlyActuals({ fiscalYearId: priorFiscalYear.id, organizationId }) : [];
  const priorActualsByAccount = new Map<string, typeof priorActuals>();
  for (const actual of priorActuals) priorActualsByAccount.set(actual.accountCodeId, [...(priorActualsByAccount.get(actual.accountCodeId) ?? []), actual]);

  const targetStartDate = selectedFiscalYear?.startDate ?? `${new Date().getUTCFullYear()}-06-01`;
  const targetStart = new Date(`${targetStartDate}T00:00:00Z`);
  const priorStart = priorFiscalYear?.startDate ? new Date(`${priorFiscalYear.startDate}T00:00:00Z`) : null;
  const monthStarts = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(targetStart.getUTCFullYear(), targetStart.getUTCMonth() + index, 1));
    return date.toISOString().slice(0, 10);
  });
  const monthLabels = monthStarts.map((monthStart) => new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${monthStart}T00:00:00Z`)));

  const matrixRows: BudgetPlanningMatrixRow[] = planningData.accountCodes.map((accountCode) => {
    const plan = planningData.planByAccountCodeId.get(accountCode.id) ?? null;
    const months = plan ? planningData.monthsByPlanId.get(plan.id) ?? [] : [];
    const amountByMonth = new Map(months.map((month) => [month.monthStart, month.amount]));
    const priorAmounts = Array(12).fill(0) as number[];
    for (const actual of priorActualsByAccount.get(accountCode.id) ?? []) {
      if (!priorStart) continue;
      const actualDate = new Date(`${actual.monthStart}T00:00:00Z`);
      const index = (actualDate.getUTCFullYear() - priorStart.getUTCFullYear()) * 12 + actualDate.getUTCMonth() - priorStart.getUTCMonth();
      if (index >= 0 && index < 12) priorAmounts[index] += actual.obligatedAmount;
    }
    const sources = new Set(months.map((month) => month.source));
    const planSource = !plan ? "none" : sources.has("manual") ? "manual" : sources.size === 1 && sources.has("even") ? "even" : "historical";
    return { accountCodeId: accountCode.id, code: accountCode.code, category: accountCode.category, name: accountCode.name, isRevenue: accountCode.isRevenue, planId: plan?.id ?? null, planSource, monthStarts, plannedAmounts: monthStarts.map((monthStart) => amountByMonth.get(monthStart) ?? 0), priorAmounts };
  });
  const filteredRows = matrixRows.filter((row) => {
    if (searchQuery && !`${row.code} ${row.category} ${row.name}`.toLowerCase().includes(searchQuery)) return false;
    const hasHistory = row.priorAmounts.some((amount) => amount !== 0);
    const hasPlan = Boolean(row.planId);
    if (showFilter === "history") return hasHistory;
    if (showFilter === "plans") return hasPlan;
    if (showFilter === "history_or_plan") return hasHistory || hasPlan;
    return true;
  });
  const exportHeaders = ["Account Code", "Type", `${priorFiscalYear?.name ?? "Prior year"} Actual`, "Annual Plan", ...monthLabels];
  const exportRows = filteredRows.map((row) => {
    const result: Record<string, string | number> = { "Account Code": `${row.code} | ${row.category} | ${row.name}`, Type: row.isRevenue ? "Revenue target" : "Expense allocation", [`${priorFiscalYear?.name ?? "Prior year"} Actual`]: Number(row.priorAmounts.reduce((sum, amount) => sum + amount, 0).toFixed(2)), "Annual Plan": Number(row.plannedAmounts.reduce((sum, amount) => sum + amount, 0).toFixed(2)) };
    monthLabels.forEach((label, index) => { result[label] = Number((row.plannedAmounts[index] ?? 0).toFixed(2)); });
    return result;
  });
  const orgLabel = selectedOrganization?.label?.replace(/[^a-z0-9]+/gi, "_") ?? "org";

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Planning</p>
        <h1>Budget Planning</h1>
        <p className="heroSubtitle">
          Set an annual plan per account code and adjust monthly values as needed. Historical actuals are provided for guidance.
        </p>
      </header>

      {isAdmin && selectedFiscalYear && selectedOrganization ? (
        <InstitutionalAllocationImportPanel
          fiscalYearName={selectedFiscalYear.name}
          fiscalYearStartDate={selectedFiscalYear.startDate ?? ""}
          fiscalYearEndDate={selectedFiscalYear.endDate ?? ""}
          organizationId={selectedOrganization.id}
          organizationLabel={selectedOrganization.label}
        />
      ) : null}

      <article className="panel"><FilterToolbar label="Budget planning filters">
        <form className="inlineFilters">
          <label>
            Fiscal Year
            <select name="fiscalYearId" defaultValue={fiscalYearId}>
              {planningData.fiscalYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Organization
            <select name="organizationId" defaultValue={organizationId}>
              {orgOptions.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Account Code Search
            <input type="text" name="q" placeholder="Search account codes" defaultValue={resolvedSearchParams?.q ?? ""} />
          </label>
          <label>
            Show
            <select name="show" defaultValue={showFilter || "all"}>
              <option value="all">All rows</option>
              <option value="history">Has history</option>
              <option value="plans">Has plan</option>
              <option value="history_or_plan">History or plan</option>
            </select>
          </label>
          <div className="varianceActions">
            <button className="buttonPrimary" type="submit">Apply</button>
            <a
              className="buttonLink"
              href={`/budget-planning?fiscalYearId=${encodeURIComponent(fiscalYearId)}&organizationId=${encodeURIComponent(
                organizationId
              )}`}
            >
              Clear filters
            </a>
          </div>
        </form></FilterToolbar>
      </article>

      <article className="panel">
        <div className="compactHeader"><div><h2>Monthly Planning Matrix</h2><p className="helperText">Showing {filteredRows.length} of {planningData.accountCodes.length} accounts · June through May</p></div><BudgetPlanningExportButton headers={exportHeaders} rows={exportRows} filename={`budget_planning_${selectedFiscalYear?.name ?? "fiscal"}_${orgLabel}.csv`} /></div>
        {filteredRows.length === 0 ? <p className="helperText">No account codes match the current filters.</p> : <BudgetPlanningMatrix fiscalYearId={fiscalYearId} organizationId={organizationId} sourceFiscalYearId={priorFiscalYear?.id ?? fiscalYearId} monthLabels={monthLabels} priorFiscalYearName={priorFiscalYear?.name ?? null} rows={filteredRows} />}
      </article>
    </section>
  );
}
