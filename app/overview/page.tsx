import { getOrganizationOverviewRows } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

export default async function OverviewPage() {
  const rows = await getOrganizationOverviewRows();

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Fiscal Overview</p>
        <h1>Organization Budget Overview</h1>
        <p className="heroSubtitle">Fiscal Year {"->"} Organization {"->"} Project totals rollup.</p>
      </header>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Fiscal Year</th>
              <th>Org Code</th>
              <th>Organization</th>
              <th>Allocated</th>
              <th>Requested</th>
              <th>ENC</th>
              <th>Pending CC</th>
              <th>YTD</th>
              <th>Obligated</th>
              <th>Remaining (True)</th>
              <th>Remaining if Requested Approved</th>
              <th>Income</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12}>No organization totals available yet.</td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.organizationId}>
                <td>{row.fiscalYearName ?? "-"}</td>
                <td>{row.orgCode}</td>
                <td>{row.organizationName}</td>
                <td>{formatCurrency(row.allocatedTotal)}</td>
                <td>{formatCurrency(row.requestedOpenTotal)}</td>
                <td>{formatCurrency(row.encTotal)}</td>
                <td>{formatCurrency(row.pendingCcTotal)}</td>
                <td>{formatCurrency(row.ytdTotal)}</td>
                <td>{formatCurrency(row.obligatedTotal)}</td>
                <td className={row.remainingTrue < 0 ? "negative" : "positive"}>{formatCurrency(row.remainingTrue)}</td>
                <td className={row.remainingIfRequestedApproved < 0 ? "negative" : "positive"}>
                  {formatCurrency(row.remainingIfRequestedApproved)}
                </td>
                <td>{formatCurrency(row.incomeTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
