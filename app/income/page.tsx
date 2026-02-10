import { createIncomeEntryAction } from "@/app/income/actions";
import { formatCurrency } from "@/lib/format";
import { getIncomeRows, getOrganizationOptions, type IncomeRow } from "@/lib/db";

function typeLabel(type: IncomeRow["incomeType"]): string {
  if (type === "starting_budget") return "Starting Budget";
  if (type === "donation") return "Donation";
  if (type === "ticket_sales") return "Ticket Sales";
  return "Other";
}

export default async function IncomePage({
  searchParams
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const okMessage = resolvedSearchParams?.ok;
  const errorMessage = resolvedSearchParams?.error;

  const [organizations, rows] = await Promise.all([getOrganizationOptions(), getIncomeRows()]);

  const totals = {
    overall: 0,
    startingBudget: 0,
    donations: 0,
    ticketSales: 0,
    other: 0
  };

  for (const row of rows) {
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
        <p className="heroSubtitle">Track initial budget allocations plus incoming ticket and donation revenue.</p>
        {okMessage ? <p className="successNote">{okMessage}</p> : null}
        {errorMessage ? <p className="errorNote">{errorMessage}</p> : null}
      </header>

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
            <input name="amount" type="number" step="0.01" min="0.01" required />
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

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Organization</th>
              <th>Type</th>
              <th>Description</th>
              <th>Reference</th>
              <th>Amount</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>No income entries yet.</td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.projectName ?? "-"}</td>
                <td>{row.organizationLabel}</td>
                <td>{typeLabel(row.incomeType)}</td>
                <td>{row.lineName}</td>
                <td>{row.referenceNumber ?? "-"}</td>
                <td>{formatCurrency(row.amount)}</td>
                <td>{row.receivedOn ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
