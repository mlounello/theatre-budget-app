import { getBudgetPlanningData, getBudgetPlanningOptions } from "@/lib/db";
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

  const { fiscalYears, organizations } = await getBudgetPlanningOptions();
  if (fiscalYears.length === 0 || organizations.length === 0) {
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

  const planningData = await getBudgetPlanningData({ fiscalYearId, organizationId });

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
              {planningData.organizations.map((org) => (
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
