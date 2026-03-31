import { getBudgetPlanMonths, getBudgetPlanningData, getBudgetPlans, getHistoricalMonthlyActuals } from "@/lib/db";
import { getAccessContext } from "@/lib/access";
import { redirect } from "next/navigation";
import { BudgetPlanningRow } from "@/app/budget-planning/budget-planning-row";

export default async function BudgetPlanningPage({
  searchParams
}: {
  searchParams?: Promise<{
    fiscalYearId?: string;
    organizationId?: string;
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
          <div>
            <button className="buttonPrimary" type="submit">
              Apply
            </button>
          </div>
        </form>
      </article>

      <article className="panel">
        <h2>Planning Grid</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Account Code</th>
                <th>Prior Year Total</th>
                <th>Annual Plan</th>
                <th>Plan Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {planningData.accountCodes.map((accountCode) => {
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
      </article>
    </section>
  );
}
