import { getBannerCodeActualRows, getCategoryActualRows, getOrganizationOverviewRows } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

export default async function OverviewPage() {
  const [rows, categoryActuals, bannerActuals] = await Promise.all([
    getOrganizationOverviewRows(),
    getCategoryActualRows(),
    getBannerCodeActualRows()
  ]);

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
              <th>Starting Budget</th>
              <th>Additional Income</th>
              <th>Funding Pool</th>
              <th>Pool Available</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={15}>No organization totals available yet.</td>
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
                <td>{formatCurrency(row.startingBudgetTotal)}</td>
                <td>{formatCurrency(row.additionalIncomeTotal)}</td>
                <td>{formatCurrency(row.fundingPoolTotal)}</td>
                <td className={row.fundingPoolAvailable < 0 ? "negative" : "positive"}>
                  {formatCurrency(row.fundingPoolAvailable)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <article className="panel">
        <h2>Actuals by Production Department</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>FY</th>
                <th>Org</th>
                <th>Project</th>
                <th>Department</th>
                <th>Requested</th>
                <th>ENC</th>
                <th>Pending CC</th>
                <th>Posted</th>
                <th>Obligated</th>
              </tr>
            </thead>
            <tbody>
              {categoryActuals.length === 0 ? (
                <tr>
                  <td colSpan={9}>No category actuals yet.</td>
                </tr>
              ) : null}
              {categoryActuals.map((row, index) => (
                <tr key={`${row.projectName}-${row.productionCategory}-${index}`}>
                  <td>{row.fiscalYearName ?? "-"}</td>
                  <td>{row.orgCode ?? "-"}</td>
                  <td>{row.projectName}</td>
                  <td>{row.productionCategory}</td>
                  <td>{formatCurrency(row.requestedTotal)}</td>
                  <td>{formatCurrency(row.encTotal)}</td>
                  <td>{formatCurrency(row.pendingCcTotal)}</td>
                  <td>{formatCurrency(row.postedTotal)}</td>
                  <td>{formatCurrency(row.obligatedTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <h2>Actuals by Banner Account Code</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>FY</th>
                <th>Org</th>
                <th>Project</th>
                <th>Banner Code</th>
                <th>Banner Category</th>
                <th>Banner Name</th>
                <th>Requested</th>
                <th>ENC</th>
                <th>Pending CC</th>
                <th>Posted</th>
                <th>Obligated</th>
              </tr>
            </thead>
            <tbody>
              {bannerActuals.length === 0 ? (
                <tr>
                  <td colSpan={11}>No Banner-code actuals yet.</td>
                </tr>
              ) : null}
              {bannerActuals.map((row, index) => (
                <tr key={`${row.projectName}-${row.bannerAccountCode}-${index}`}>
                  <td>{row.fiscalYearName ?? "-"}</td>
                  <td>{row.orgCode ?? "-"}</td>
                  <td>{row.projectName}</td>
                  <td>{row.bannerAccountCode}</td>
                  <td>{row.bannerCategory}</td>
                  <td>{row.bannerName}</td>
                  <td>{formatCurrency(row.requestedTotal)}</td>
                  <td>{formatCurrency(row.encTotal)}</td>
                  <td>{formatCurrency(row.pendingCcTotal)}</td>
                  <td>{formatCurrency(row.postedTotal)}</td>
                  <td>{formatCurrency(row.obligatedTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
