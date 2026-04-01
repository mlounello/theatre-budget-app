import { getBudgetPlanMonths, getBudgetPlanningData, getBudgetPlans, getHistoricalMonthlyActuals } from "@/lib/db";
import { getAccessContext } from "@/lib/access";
import { redirect } from "next/navigation";
import { BudgetPlanningRow } from "@/app/budget-planning/budget-planning-row";
import { bulkCreateBudgetPlansAction } from "@/app/budget-planning/actions";

export default async function BudgetPlanningPage({
  searchParams
}: {
  searchParams?: Promise<{
    fiscalYearId?: string;
    organizationId?: string;
    q?: string;
    show?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const okMessage = resolvedSearchParams?.ok;
  const errorMessage = resolvedSearchParams?.error;
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
  const fallbackFiscalYearId = fiscalYears[0]?.id ?? "";
  const fiscalYearId = fiscalYears.some((fy) => fy.id === requestedFiscalYearId) ? requestedFiscalYearId : fallbackFiscalYearId;

  const orgOptions = organizations.filter((org) => !org.fiscalYearId || org.fiscalYearId === fiscalYearId);
  const requestedOrganizationId = (resolvedSearchParams?.organizationId ?? "").trim();
  const fallbackOrganizationId = orgOptions[0]?.id ?? organizations[0]?.id ?? "";
  const organizationId = orgOptions.some((org) => org.id === requestedOrganizationId) ? requestedOrganizationId : fallbackOrganizationId;

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

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Planning</p>
        <h1>Budget Planning</h1>
        <p className="heroSubtitle">
          Set an annual plan per account code and adjust monthly values as needed. Historical actuals are provided for guidance.
        </p>
        {okMessage ? <p className="successNote">{okMessage}</p> : null}
        {errorMessage ? <p className="errorNote">{errorMessage}</p> : null}
      </header>

      <article className="panel">
        <h2>Filters</h2>
        <form className="panelGrid">
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
          <div>
            <button className="buttonPrimary" type="submit">
              Apply
            </button>
            <a
              className="buttonLink"
              href={`/budget-planning?fiscalYearId=${encodeURIComponent(fiscalYearId)}&organizationId=${encodeURIComponent(
                organizationId
              )}`}
              style={{ marginLeft: "0.5rem" }}
            >
              Clear filters
            </a>
          </div>
        </form>
      </article>

      <article className="panel">
        <h2>Planning Grid</h2>
        {(() => {
          const filtered = planningData.accountCodes.filter((accountCode) => {
            if (searchQuery && !accountCode.label.toLowerCase().includes(searchQuery)) return false;
            const plan = planningData.planByAccountCodeId.get(accountCode.id) ?? null;
            const actuals = planningData.actualsByAccountCodeId.get(accountCode.id) ?? [];
            const hasHistory = actuals.some((row) => row.postedAmount !== 0);
            const hasPlan = Boolean(plan);

            if (showFilter === "history") return hasHistory;
            if (showFilter === "plans") return hasPlan;
            if (showFilter === "history_or_plan") return hasHistory || hasPlan;
            return true;
          });
          const visibleWithoutPlan = filtered.filter((accountCode) => !planningData.planByAccountCodeId.get(accountCode.id));
          const bulkPlanAccountCodesJson = JSON.stringify(visibleWithoutPlan.map((accountCode) => accountCode.id));

          return (
            <>
              <p className="helperText">
                Showing {filtered.length} of {planningData.accountCodes.length} account codes
              </p>
              {filtered.length > 0 && (
                <form action={bulkCreateBudgetPlansAction} className="panelGrid">
                  <input type="hidden" name="fiscalYearId" value={fiscalYearId} />
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="sourceFiscalYearId" value={fiscalYearId} />
                  <input type="hidden" name="bulkPlanAccountCodesJson" value={bulkPlanAccountCodesJson} />
                  <label>
                    Bulk annual amount
                    <input type="number" name="bulkAnnualAmount" min="0" step="0.01" defaultValue="0.00" />
                  </label>
                  <div>
                    <button className="buttonPrimary" type="submit" disabled={visibleWithoutPlan.length === 0}>
                      Create plans for visible rows without a plan
                    </button>
                    <p className="helperText">
                      Applies to {visibleWithoutPlan.length} rows. Existing plans are not overwritten.
                    </p>
                  </div>
                </form>
              )}
              {filtered.length === 0 ? (
                <p className="helperText">No account codes match the current filters.</p>
              ) : (
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Account Code</th>
                        <th>Prior Year Total</th>
                        <th>Annual Plan</th>
                        <th>Plan Source</th>
                        <th>Indicators</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((accountCode) => {
                        const plan = planningData.planByAccountCodeId.get(accountCode.id) ?? null;
                        const months = plan ? planningData.monthsByPlanId.get(plan.id) ?? [] : [];
                        const actuals = planningData.actualsByAccountCodeId.get(accountCode.id) ?? [];
                        return (
                          <BudgetPlanningRow
                            key={accountCode.id}
                            accountCode={accountCode}
                            plan={plan}
                            months={months}
                            actuals={actuals}
                            fiscalYearId={fiscalYearId}
                            organizationId={organizationId}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        })()}
      </article>
    </section>
  );
}
