import { getBannerCodeActualRows, getCategoryActualRows, getFiscalYearOptions, getOrganizationOverviewRows } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { getAccessContext } from "@/lib/access";
import { redirect } from "next/navigation";

export default async function OverviewPage({
  searchParams
}: {
  searchParams?: Promise<{ fiscalYearId?: string }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedFiscalYearId = String(resolvedSearchParams?.fiscalYearId ?? "").trim();

  const [rows, categoryActuals, bannerActuals, fiscalYears] = await Promise.all([
    getOrganizationOverviewRows(),
    getCategoryActualRows(),
    getBannerCodeActualRows(),
    getFiscalYearOptions()
  ]);

  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const inferredCurrentFiscalYearId =
    fiscalYears.find((fy) => Boolean(fy.startDate) && Boolean(fy.endDate) && fy.startDate! <= todayYmd && todayYmd <= fy.endDate!)?.id ??
    fiscalYears.find((fy) => Boolean(fy.startDate) && !fy.endDate && fy.startDate! <= todayYmd)?.id ??
    fiscalYears.find((fy) => !fy.startDate && Boolean(fy.endDate) && todayYmd <= fy.endDate!)?.id ??
    "";
  const selectedFiscalYearId = requestedFiscalYearId || inferredCurrentFiscalYearId;
  const showAllFiscalYears = selectedFiscalYearId === "all";

  const filteredRows = !showAllFiscalYears && selectedFiscalYearId
    ? rows.filter((row) => row.fiscalYearId === selectedFiscalYearId)
    : rows;
  const filteredCategoryActuals = !showAllFiscalYears && selectedFiscalYearId
    ? categoryActuals.filter((row) => row.fiscalYearId === selectedFiscalYearId)
    : categoryActuals;
  const filteredBannerActuals = !showAllFiscalYears && selectedFiscalYearId
    ? bannerActuals.filter((row) => row.fiscalYearId === selectedFiscalYearId)
    : bannerActuals;

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Fiscal Overview</p>
        <h1>Organization Budget Overview</h1>
        <p className="heroSubtitle">Fiscal Year {"->"} Organization {"->"} Project totals rollup.</p>
      </header>

      <article className="panel">
        <h2>Filter</h2>
        <form method="get" className="requestForm">
          <label>
            Fiscal Year
            <select name="fiscalYearId" defaultValue={selectedFiscalYearId}>
              <option value="all">All Fiscal Years</option>
              {fiscalYears.map((fiscalYear) => (
                <option key={fiscalYear.id} value={fiscalYear.id}>
                  {fiscalYear.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Apply
          </button>
        </form>
      </article>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Fiscal Year</th>
              <th>Org Code</th>
              <th>Organization</th>
              <th>Starting Budget</th>
              <th>Additional Income</th>
              <th>Funding Pool</th>
              <th>Allocated</th>
              <th>Remaining Pool (Not Allocated)</th>
              <th>Requested</th>
              <th>Held</th>
              <th>ENC</th>
              <th>Pending CC</th>
              <th>YTD</th>
              <th>Remaining (True)</th>
              <th>Remaining if Requested Approved</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={15}>No organization totals available yet.</td>
              </tr>
            ) : null}
            {filteredRows.map((row) => (
              <tr key={`${row.organizationId}-${row.fiscalYearId ?? "none"}`}>
                <td>{row.fiscalYearName ?? "-"}</td>
                <td>{row.orgCode}</td>
                <td>{row.organizationName}</td>
                <td>{formatCurrency(row.startingBudgetTotal)}</td>
                <td>{formatCurrency(row.additionalIncomeTotal)}</td>
                <td>{formatCurrency(row.fundingPoolTotal)}</td>
                <td>{formatCurrency(row.allocatedTotal)}</td>
                <td className={row.fundingPoolAvailable < 0 ? "negative" : "positive"}>
                  {formatCurrency(row.fundingPoolAvailable)}
                </td>
                <td>{formatCurrency(row.requestedOpenTotal)}</td>
                <td>{formatCurrency(row.heldTotal)}</td>
                <td>{formatCurrency(row.encTotal)}</td>
                <td>{formatCurrency(row.pendingCcTotal)}</td>
                <td>{formatCurrency(row.ytdTotal)}</td>
                <td className={row.remainingTrue < 0 ? "negative" : "positive"}>{formatCurrency(row.remainingTrue)}</td>
                <td className={row.remainingIfRequestedApproved < 0 ? "negative" : "positive"}>
                  {formatCurrency(row.remainingIfRequestedApproved)}
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
                <th>Held</th>
                <th>ENC</th>
                <th>Pending CC</th>
                <th>Posted</th>
                <th>Obligated</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategoryActuals.length === 0 ? (
                <tr>
                  <td colSpan={10}>No category actuals yet.</td>
                </tr>
              ) : null}
              {filteredCategoryActuals.map((row, index) => (
                <tr key={`${row.projectName}-${row.productionCategory}-${index}`}>
                  <td>{row.fiscalYearName ?? "-"}</td>
                  <td>{row.orgCode ?? "-"}</td>
                  <td>{row.projectName}</td>
                  <td>{row.productionCategory}</td>
                  <td>{formatCurrency(row.requestedTotal)}</td>
                  <td>{formatCurrency(row.heldTotal)}</td>
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
                <th>Banner Code</th>
                <th>Banner Category</th>
                <th>Banner Name</th>
                <th>Requested</th>
                <th>Held</th>
                <th>ENC</th>
                <th>Pending CC</th>
                <th>Posted</th>
                <th>Obligated</th>
              </tr>
            </thead>
            <tbody>
              {filteredBannerActuals.length === 0 ? (
                <tr>
                  <td colSpan={11}>No Banner-code actuals yet.</td>
                </tr>
              ) : null}
              {filteredBannerActuals.map((row, index) => (
                <tr key={`${row.fiscalYearName ?? ""}-${row.orgCode ?? ""}-${row.bannerAccountCode}-${index}`}>
                  <td>{row.fiscalYearName ?? "-"}</td>
                  <td>{row.orgCode ?? "-"}</td>
                  <td>{row.bannerAccountCode}</td>
                  <td>{row.bannerCategory}</td>
                  <td>{row.bannerName}</td>
                  <td>{formatCurrency(row.requestedTotal)}</td>
                  <td>{formatCurrency(row.heldTotal)}</td>
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
