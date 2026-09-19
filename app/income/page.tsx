import { AddIncomeForm } from "@/app/income/add-income-form";
import { IncomeTable } from "@/app/income/income-table";
import { formatCurrency } from "@/lib/format";
import {
  getAccountCodeOptions,
  getFiscalYearOptions,
  getFiscalYearOrganizationOptions,
  getIncomeRows,
  getProductionCategoryOptions,
  getRevenuePerformanceRows
} from "@/lib/db";
import { getAccessContext } from "@/lib/access";
import { resolveRequestedFiscalYearId } from "@/lib/fiscal-year-context";
import { redirect } from "next/navigation";

export default async function IncomePage({
  searchParams
}: {
  searchParams?: Promise<{ fiscalYearId?: string; fy?: string; org?: string }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedFiscalYearId = (resolvedSearchParams?.fiscalYearId ?? resolvedSearchParams?.fy ?? "").trim();
  const selectedOrganizationId = (resolvedSearchParams?.org ?? "").trim();

  const [organizations, rows, accountCodeOptions, productionCategoryOptions, fiscalYearOptions] = await Promise.all([
    getFiscalYearOrganizationOptions(),
    getIncomeRows(),
    getAccountCodeOptions(),
    getProductionCategoryOptions(),
    getFiscalYearOptions()
  ]);
  const selectedFiscalYearId = resolveRequestedFiscalYearId(fiscalYearOptions, requestedFiscalYearId, { allowAll: true });
  const showAllFiscalYears = selectedFiscalYearId === "all";
  const allRevenuePerformance = await getRevenuePerformanceRows();
  const revenuePerformance = allRevenuePerformance.filter((row) => {
    if (!showAllFiscalYears && selectedFiscalYearId && row.fiscalYearId !== selectedFiscalYearId) return false;
    if (selectedOrganizationId && row.organizationId !== selectedOrganizationId) return false;
    return true;
  });

  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  const revenueAccountCodes = accountCodeOptions.filter((accountCode) => accountCode.isRevenue);
  const orgIdsInSelectedFy = new Set(
    rows
      .filter((row) => showAllFiscalYears || !selectedFiscalYearId || row.fiscalYearId === selectedFiscalYearId)
      .map((row) => row.organizationId)
      .filter((id): id is string => Boolean(id))
  );

  const filteredRows = rows.filter((row) => {
    if (!showAllFiscalYears && selectedFiscalYearId && row.fiscalYearId !== selectedFiscalYearId) return false;
    if (selectedOrganizationId && row.organizationId !== selectedOrganizationId) return false;
    return true;
  });

  const scopeBuckets = new Map<
    string,
    {
      fiscalYearName: string;
      organizationLabel: string;
      legacyStartingBudget: number;
      receivedRevenue: number;
    }
  >();

  for (const row of filteredRows) {
    const org = row.organizationId ? organizationById.get(row.organizationId) : null;
    const fiscalYearName = row.fiscalYearName ?? "No Fiscal Year";
    const organizationLabel = org ? `${org.orgCode} | ${org.name}` : row.organizationLabel;
    const bucketKey = `${fiscalYearName}::${organizationLabel}`;
    const bucket = scopeBuckets.get(bucketKey) ?? {
      fiscalYearName,
      organizationLabel,
      legacyStartingBudget: 0,
      receivedRevenue: 0
    };
    if (row.incomeType === "starting_budget") bucket.legacyStartingBudget += row.amount;
    else bucket.receivedRevenue += row.amount;
    scopeBuckets.set(bucketKey, bucket);
  }

  const scopedTotals = Array.from(scopeBuckets.values()).sort(
    (a, b) => a.fiscalYearName.localeCompare(b.fiscalYearName) || a.organizationLabel.localeCompare(b.organizationLabel)
  );

  const totals = {
    received: 0,
    legacyStartingBudget: 0,
    donations: 0,
    ticketSales: 0,
    other: 0
  };

  for (const row of filteredRows) {
    if (row.incomeType === "starting_budget") totals.legacyStartingBudget += row.amount;
    else if (row.incomeType === "donation") {
      totals.received += row.amount;
      totals.donations += row.amount;
    }
    else if (row.incomeType === "ticket_sales") totals.ticketSales += row.amount;
    else totals.other += row.amount;
    if (row.incomeType === "ticket_sales" || row.incomeType === "other") totals.received += row.amount;
  }
  const performanceTotals = revenuePerformance.reduce(
    (summary, row) => {
      summary.target += row.targetAmount;
      summary.received += row.receivedAmount;
      summary.remaining += row.remainingToTarget;
      summary.over += row.overTargetAmount;
      return summary;
    },
    { target: 0, received: 0, remaining: 0, over: 0 }
  );
  const unlinkedRevenue = Math.max(totals.received - performanceTotals.received, 0);

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Revenue</p>
        <h1>Revenue</h1>
        <p className="heroSubtitle">Post received revenue against institutional targets. Revenue offsets the target for reporting and never becomes available to spend.</p>
      </header>

      <article className="panel requestFormPanel">
        <h2>View Scope</h2>
        <form method="get" className="requestForm">
          <label>
            Fiscal Year
            <select name="fiscalYearId" defaultValue={selectedFiscalYearId}>
              <option value="all">All fiscal years</option>
              {fiscalYearOptions.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Organization
            <select name="org" defaultValue={selectedOrganizationId}>
              <option value="">All organizations</option>
              {organizations
                .filter((organization) => showAllFiscalYears || !selectedFiscalYearId || orgIdsInSelectedFy.has(organization.id))
                .map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.label}
                  </option>
                ))}
            </select>
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Apply Scope
          </button>
        </form>
      </article>

      <div className="institutionalSummaryGrid" aria-label="Revenue summary">
        <article className="projectCard">
          <h2>Target</h2>
          <p className="heroTitle">{formatCurrency(performanceTotals.target)}</p>
        </article>
        <article className="projectCard">
          <h2>Received</h2>
          <p className="heroTitle">{formatCurrency(performanceTotals.received)}</p>
        </article>
        <article className="projectCard">
          <h2>Remaining</h2>
          <p className="heroTitle">{formatCurrency(performanceTotals.remaining)}</p>
        </article>
        <article className="projectCard">
          <h2>Over target</h2>
          <p className="heroTitle">{formatCurrency(performanceTotals.over)}</p>
        </article>
      </div>
      {unlinkedRevenue > 0.005 ? (
        <p className="warningNote">
          {formatCurrency(unlinkedRevenue)} in received revenue is not linked to an institutional target in this scope. Assign a matching revenue account or create the target in Budget Planning.
        </p>
      ) : null}

      <article className="panel">
        <div className="sectionHeader compactHeader">
          <div>
            <p className="eyebrow">Institutional targets</p>
            <h2>Revenue Performance</h2>
          </div>
          <a className="buttonLink" href="/budget-planning">Manage targets</a>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Fiscal Year</th>
                <th>Organization</th>
                <th>Revenue Account</th>
                <th>Target</th>
                <th>Received</th>
                <th>Remaining</th>
                <th>Over Target</th>
              </tr>
            </thead>
            <tbody>
              {revenuePerformance.length === 0 ? (
                <tr>
                  <td colSpan={7}>No institutional revenue targets for the selected scope.</td>
                </tr>
              ) : null}
              {revenuePerformance.map((row) => (
                <tr key={`${row.fiscalYearId}-${row.organizationId}-${row.accountCodeId}`}>
                  <td>{row.fiscalYearName}</td>
                  <td>{row.organizationLabel}</td>
                  <td>{row.accountCode} | {row.accountName}</td>
                  <td>{formatCurrency(row.targetAmount)}</td>
                  <td><strong>{formatCurrency(row.receivedAmount)}</strong></td>
                  <td>{formatCurrency(row.remainingToTarget)}</td>
                  <td>{formatCurrency(row.overTargetAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <details className="panel revenueEntryPanel">
        <summary>
          <span><strong>Add Revenue Entry</strong><small>Post a receipt to a revenue account and its institutional target.</small></span>
        </summary>
        <AddIncomeForm
          organizations={organizations}
          fiscalYears={fiscalYearOptions}
          defaultFiscalYearId={showAllFiscalYears ? fiscalYearOptions[0]?.id ?? "" : selectedFiscalYearId}
          revenueAccountCodes={revenueAccountCodes}
          revenueTargets={allRevenuePerformance}
          productionCategoryOptions={productionCategoryOptions}
        />
      </details>

      {totals.legacyStartingBudget !== 0 ? (
        <details className="panel legacyBudgetPanel">
          <summary>
            <span><strong>Historical Starting-Budget Records</strong><small>{formatCurrency(totals.legacyStartingBudget)} retained for history; new allocations belong in Budget Planning.</small></span>
          </summary>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Fiscal Year</th><th>Organization</th><th>Historical starting budget</th><th>Received revenue</th></tr></thead>
              <tbody>
                {scopedTotals.map((scopeRow) => (
                  <tr key={`${scopeRow.fiscalYearName}-${scopeRow.organizationLabel}`}>
                    <td>{scopeRow.fiscalYearName}</td>
                    <td>{scopeRow.organizationLabel}</td>
                    <td>{formatCurrency(scopeRow.legacyStartingBudget)}</td>
                    <td>{formatCurrency(scopeRow.receivedRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <IncomeTable
        rows={filteredRows}
        organizations={organizations}
        fiscalYears={fiscalYearOptions}
        accountCodeOptions={accountCodeOptions}
        productionCategoryOptions={productionCategoryOptions}
      />
    </section>
  );
}
