import { createIncomeEntryAction } from "@/app/income/actions";
import { IncomeTable } from "@/app/income/income-table";
import { formatCurrency } from "@/lib/format";
import { getIncomeRows, getOrganizationOptions } from "@/lib/db";

export default async function IncomePage({
  searchParams
}: {
  searchParams?: Promise<{ ok?: string; error?: string; fy?: string; org?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const okMessage = resolvedSearchParams?.ok;
  const errorMessage = resolvedSearchParams?.error;
  const selectedFiscalYearId = (resolvedSearchParams?.fy ?? "").trim();
  const selectedOrganizationId = (resolvedSearchParams?.org ?? "").trim();

  const [organizations, rows] = await Promise.all([getOrganizationOptions(), getIncomeRows()]);

  const fiscalYearOptions = Array.from(
    new Map(
      organizations
        .filter((organization) => organization.fiscalYearId && organization.fiscalYearName)
        .map((organization) => [organization.fiscalYearId as string, organization.fiscalYearName as string])
    ).entries()
  ).map(([id, name]) => ({ id, name }));

  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));

  const filteredRows = rows.filter((row) => {
    const org = row.organizationId ? organizationById.get(row.organizationId) : null;
    const rowFiscalYearId = org?.fiscalYearId ?? "";
    if (selectedFiscalYearId && rowFiscalYearId !== selectedFiscalYearId) return false;
    if (selectedOrganizationId && row.organizationId !== selectedOrganizationId) return false;
    return true;
  });

  const scopeBuckets = new Map<
    string,
    {
      fiscalYearName: string;
      organizationLabel: string;
      startingBudget: number;
      additionalIncome: number;
      total: number;
    }
  >();

  for (const row of filteredRows) {
    const org = row.organizationId ? organizationById.get(row.organizationId) : null;
    const fiscalYearName = org?.fiscalYearName ?? "No Fiscal Year";
    const organizationLabel = org ? `${org.orgCode} | ${org.name}` : row.organizationLabel;
    const bucketKey = `${fiscalYearName}::${organizationLabel}`;
    const bucket = scopeBuckets.get(bucketKey) ?? {
      fiscalYearName,
      organizationLabel,
      startingBudget: 0,
      additionalIncome: 0,
      total: 0
    };
    if (row.incomeType === "starting_budget") bucket.startingBudget += row.amount;
    else bucket.additionalIncome += row.amount;
    bucket.total += row.amount;
    scopeBuckets.set(bucketKey, bucket);
  }

  const scopedTotals = Array.from(scopeBuckets.values()).sort(
    (a, b) => a.fiscalYearName.localeCompare(b.fiscalYearName) || a.organizationLabel.localeCompare(b.organizationLabel)
  );

  const totals = {
    overall: 0,
    startingBudget: 0,
    donations: 0,
    ticketSales: 0,
    other: 0
  };

  for (const row of filteredRows) {
    totals.overall += row.amount;
    if (row.incomeType === "starting_budget") totals.startingBudget += row.amount;
    else if (row.incomeType === "donation") totals.donations += row.amount;
    else if (row.incomeType === "ticket_sales") totals.ticketSales += row.amount;
    else totals.other += row.amount;
  }

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Income</p>
        <h1>Income and Starting Budget</h1>
        <p className="heroSubtitle">Track initial budget allocations plus incoming ticket and donation revenue by fiscal year and organization.</p>
        {okMessage ? <p className="successNote">{okMessage}</p> : null}
        {errorMessage ? <p className="errorNote">{errorMessage}</p> : null}
      </header>

      <article className="panel requestFormPanel">
        <h2>View Scope</h2>
        <form method="get" className="requestForm">
          <label>
            Fiscal Year
            <select name="fy" defaultValue={selectedFiscalYearId}>
              <option value="">All fiscal years</option>
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
                .filter((organization) => !selectedFiscalYearId || organization.fiscalYearId === selectedFiscalYearId)
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

      <article className="panel requestFormPanel">
        <h2>Add Income Entry</h2>
        <form className="requestForm" action={createIncomeEntryAction}>
          <label>
            Organization
            <select name="organizationId" required>
              <option value="">Select organization</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Income Type
            <select name="incomeType" defaultValue="starting_budget" required>
              <option value="starting_budget">Starting Budget</option>
              <option value="donation">Donation</option>
              <option value="ticket_sales">Ticket Sales</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            Description
            <input name="lineName" placeholder="Optional (auto-filled from type if blank)" />
          </label>

          <label>
            Reference
            <input name="referenceNumber" placeholder="Optional (donor, batch ID, etc.)" />
          </label>

          <label>
            Amount
            <input name="amount" type="number" step="0.01" required />
          </label>

          <label>
            Received On
            <input name="receivedOn" type="date" />
          </label>

          <button type="submit" className="buttonLink buttonPrimary">
            Save Income
          </button>
        </form>
      </article>

      <div className="gridCards">
        <article className="projectCard">
          <h2>Total Income</h2>
          <p className="heroTitle">{formatCurrency(totals.overall)}</p>
        </article>
        <article className="projectCard">
          <h2>Starting Budget</h2>
          <p className="heroTitle">{formatCurrency(totals.startingBudget)}</p>
        </article>
        <article className="projectCard">
          <h2>Donations</h2>
          <p className="heroTitle">{formatCurrency(totals.donations)}</p>
        </article>
        <article className="projectCard">
          <h2>Ticket Sales</h2>
          <p className="heroTitle">{formatCurrency(totals.ticketSales)}</p>
        </article>
      </div>

      <article className="panel">
        <h2>Income by Fiscal Year and Organization</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Fiscal Year</th>
                <th>Organization</th>
                <th>Starting Budget</th>
                <th>Additional Income</th>
                <th>Total Income</th>
              </tr>
            </thead>
            <tbody>
              {scopedTotals.length === 0 ? (
                <tr>
                  <td colSpan={5}>No income entries for the selected scope.</td>
                </tr>
              ) : null}
              {scopedTotals.map((scopeRow) => (
                <tr key={`${scopeRow.fiscalYearName}-${scopeRow.organizationLabel}`}>
                  <td>{scopeRow.fiscalYearName}</td>
                  <td>{scopeRow.organizationLabel}</td>
                  <td>{formatCurrency(scopeRow.startingBudget)}</td>
                  <td>{formatCurrency(scopeRow.additionalIncome)}</td>
                  <td>{formatCurrency(scopeRow.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <IncomeTable rows={filteredRows} organizations={organizations} />
    </section>
  );
}
