import Link from "next/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { createBulkVarianceFromBucketsAction, createVarianceFromBucketAction } from "@/app/institutional-budget/actions";
import { getAccessContext } from "@/lib/access";
import { formatCurrency } from "@/lib/format";
import { resolveRequestedFiscalYearId } from "@/lib/fiscal-year-context";
import { getFiscalYearOrganizationOptions } from "@/lib/db";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type MonthlyBudgetRow = {
  fiscal_year_id?: string | null;
  fiscal_year_name?: string | null;
  organization_id?: string | null;
  org_code?: string | null;
  organization_name?: string | null;
  account_code_id?: string | null;
  account_code?: string | null;
  account_category?: string | null;
  account_name?: string | null;
  budget_plan_month_id?: string | null;
  month_start?: string | null;
  fiscal_month_index?: string | number | null;
  monthly_allocation?: string | number | null;
  commitment_count?: string | number | null;
  submitted_commitments_amount?: string | number | null;
  approved_incoming_variance_amount?: string | number | null;
  approved_outgoing_variance_amount?: string | number | null;
  official_available_amount?: string | number | null;
  projected_available_amount?: string | number | null;
  is_revenue?: boolean | null;
};

type RevenuePerformanceRow = {
  fiscal_year_id?: string | null;
  organization_id?: string | null;
  fiscal_year_name?: string | null;
  org_code?: string | null;
  organization_name?: string | null;
  account_code?: string | null;
  account_name?: string | null;
  target_amount?: string | number | null;
  received_amount?: string | number | null;
  remaining_to_target?: string | number | null;
  over_target_amount?: string | number | null;
};

function asNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthLabel(value: string | null | undefined): string {
  if (!value) return "-";
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString("en-US", { month: "short", year: "numeric" });
}

export default async function InstitutionalBudgetPage({
  searchParams
}: {
  searchParams?: Promise<{
    fiscalYearId?: string;
    organizationId?: string;
    q?: string;
    negativeOnly?: string;
    view?: string;
  }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedFiscalYearId = (resolvedSearchParams?.fiscalYearId ?? "").trim();
  const organizationId = (resolvedSearchParams?.organizationId ?? "").trim();
  const queryText = (resolvedSearchParams?.q ?? "").trim().toLowerCase();
  const negativeOnly = resolvedSearchParams?.negativeOnly === "1";
  const viewMode = resolvedSearchParams?.view === "detail" ? "detail" : "compact";

  const supabase = await getSupabaseServerClient();
  const { data: fiscalYearData, error: fiscalYearError } = await supabase
    .from("fiscal_years")
    .select("id, name, start_date, end_date, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (fiscalYearError) throw fiscalYearError;

  const fiscalYearOptions = ((fiscalYearData ?? []) as Array<{
    id?: string;
    name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    sort_order?: number | null;
  }>)
    .filter((fy): fy is { id: string; name?: string | null; start_date?: string | null; end_date?: string | null; sort_order?: number | null } =>
      Boolean(fy.id)
    )
    .map((fy) => ({
      id: fy.id,
      name: fy.name ?? "Fiscal Year",
      startDate: fy.start_date ?? null,
      endDate: fy.end_date ?? null,
      sortOrder: fy.sort_order ?? 0
    }));
  const fiscalYearId = resolveRequestedFiscalYearId(fiscalYearOptions, requestedFiscalYearId);
  const organizationOptions = await getFiscalYearOrganizationOptions(fiscalYearId);

  let query = supabase
    .from("v_institutional_monthly_budget_availability")
    .select(
      "fiscal_year_id, fiscal_year_name, organization_id, org_code, organization_name, account_code_id, account_code, account_category, account_name, budget_plan_month_id, month_start, fiscal_month_index, monthly_allocation, commitment_count, submitted_commitments_amount, approved_incoming_variance_amount, approved_outgoing_variance_amount, official_available_amount, projected_available_amount, is_revenue"
    )
    .order("fiscal_year_name", { ascending: true })
    .order("org_code", { ascending: true })
    .order("account_code", { ascending: true })
    .order("month_start", { ascending: true });

  if (fiscalYearId) query = query.eq("fiscal_year_id", fiscalYearId);
  if (organizationId) query = query.eq("organization_id", organizationId);

  const { data, error } = await query;
  if (error) throw error;

  let revenueQuery = supabase
    .from("v_institutional_revenue_performance")
    .select(
      "fiscal_year_id, organization_id, fiscal_year_name, org_code, organization_name, account_code, account_name, target_amount, received_amount, remaining_to_target, over_target_amount"
    )
    .order("org_code", { ascending: true })
    .order("account_code", { ascending: true });
  if (fiscalYearId) revenueQuery = revenueQuery.eq("fiscal_year_id", fiscalYearId);
  if (organizationId) revenueQuery = revenueQuery.eq("organization_id", organizationId);
  const { data: revenueData, error: revenueError } = await revenueQuery;
  if (revenueError) throw revenueError;
  const revenueRows = (revenueData ?? []) as RevenuePerformanceRow[];

  const rows = ((data ?? []) as MonthlyBudgetRow[]).filter((row) => {
    if (!queryText) return true;
    return [row.fiscal_year_name, row.org_code, row.organization_name, row.account_code, row.account_name, row.month_start]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(queryText);
  }).filter((row) => {
    if (!negativeOnly) return true;
    return asNumber(row.official_available_amount) < 0 || asNumber(row.projected_available_amount) < 0;
  });

  const monthColumns = Array.from(
    new Map(
      rows
        .filter((row) => row.month_start)
        .sort((a, b) => asNumber(a.fiscal_month_index) - asNumber(b.fiscal_month_index) || String(a.month_start).localeCompare(String(b.month_start)))
        .map((row) => [String(row.month_start), { monthStart: String(row.month_start), label: monthLabel(String(row.month_start)) }] as const)
    ).values()
  );
  const groupedRows = rows.reduce((map, row) => {
    const key = [row.fiscal_year_id, row.organization_id, row.account_code_id].join(":");
    if (!map.has(key)) {
      map.set(key, {
        key,
        fiscalYearName: row.fiscal_year_name ?? "-",
        orgCode: row.org_code ?? "-",
        organizationName: row.organization_name ?? "-",
        accountCode: row.account_code ?? "-",
        accountName: row.account_name ?? "-",
        accountCategory: row.account_category ?? "",
        isRevenue: Boolean(row.is_revenue),
        cells: new Map<string, MonthlyBudgetRow>()
      });
    }
    if (row.month_start) map.get(key)!.cells.set(String(row.month_start), row);
    return map;
  }, new Map<string, {
    key: string;
    fiscalYearName: string;
    orgCode: string;
    organizationName: string;
    accountCode: string;
    accountName: string;
    accountCategory: string;
    isRevenue: boolean;
    cells: Map<string, MonthlyBudgetRow>;
  }>());
  const gridRows = Array.from(groupedRows.values()).sort((a, b) =>
    a.fiscalYearName.localeCompare(b.fiscalYearName) ||
    a.orgCode.localeCompare(b.orgCode) ||
    a.accountCode.localeCompare(b.accountCode)
  );

  const expenseRows = rows.filter((row) => !row.is_revenue);
  const totals = expenseRows.reduce(
    (summary, row) => {
      summary.allocated += asNumber(row.monthly_allocation);
      summary.committed += asNumber(row.submitted_commitments_amount);
      summary.available += asNumber(row.official_available_amount);
      summary.projected += asNumber(row.projected_available_amount);
      if (asNumber(row.official_available_amount) < 0 || asNumber(row.projected_available_amount) < 0) {
        summary.needsVariance += 1;
      }
      return summary;
    },
    { allocated: 0, committed: 0, available: 0, projected: 0, needsVariance: 0 }
  );
  const revenueTotals = revenueRows.reduce(
    (summary, row) => {
      summary.target += asNumber(row.target_amount);
      summary.received += asNumber(row.received_amount);
      summary.remaining += asNumber(row.remaining_to_target);
      summary.over += asNumber(row.over_target_amount);
      return summary;
    },
    { target: 0, received: 0, remaining: 0, over: 0 }
  );
  const gridGroups = Array.from(
    gridRows.reduce((groups, row) => {
      const key = `${row.fiscalYearName}:${row.orgCode}:${row.accountCategory || "Other"}`;
      const group = groups.get(key) ?? {
        key,
        fiscalYearName: row.fiscalYearName,
        orgCode: row.orgCode,
        organizationName: row.organizationName,
        category: row.accountCategory || "Other",
        rows: [] as typeof gridRows
      };
      group.rows.push(row);
      groups.set(key, group);
      return groups;
    }, new Map<string, {
      key: string;
      fiscalYearName: string;
      orgCode: string;
      organizationName: string;
      category: string;
      rows: typeof gridRows;
    }>()).values()
  );
  const viewHref = (nextView: "compact" | "detail") => {
    const params = new URLSearchParams();
    if (fiscalYearId) params.set("fiscalYearId", fiscalYearId);
    if (organizationId) params.set("organizationId", organizationId);
    if (resolvedSearchParams?.q) params.set("q", resolvedSearchParams.q);
    if (negativeOnly) params.set("negativeOnly", "1");
    params.set("view", nextView);
    return `/institutional-budget?${params.toString()}`;
  };

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Institutional Budget</p>
        <h1>Institutional Budget</h1>
        <p className="heroSubtitle">
          Follow monthly allocations, commitments, and availability. Revenue targets are reported separately and never become spendable funds.
        </p>
      </header>

      <div className="institutionalSummaryGrid" aria-label="Institutional budget summary">
        <article className="projectCard institutionalSummaryCard">
          <span>Allocated</span>
          <strong>{formatCurrency(totals.allocated)}</strong>
          <small>Expense budget in this scope</small>
        </article>
        <article className="projectCard institutionalSummaryCard">
          <span>Committed</span>
          <strong>{formatCurrency(totals.committed)}</strong>
          <small>Submitted commitments</small>
        </article>
        <article className="projectCard institutionalSummaryCard">
          <span>Available</span>
          <strong className={totals.available < 0 ? "negative" : "positive"}>{formatCurrency(totals.available)}</strong>
          <small>Official availability</small>
        </article>
        <article className="projectCard institutionalSummaryCard">
          <span>Needs variance</span>
          <strong>{totals.needsVariance}</strong>
          <small>Monthly buckets requiring attention</small>
        </article>
      </div>

      <article className="panel">
        <h2>Filters</h2>
        <form className="panelGrid">
          <input name="view" type="hidden" value={viewMode} />
          <label>
            Fiscal Year
            <select name="fiscalYearId" defaultValue={fiscalYearId}>
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
            <select name="organizationId" defaultValue={organizationId}>
              <option value="">All organizations</option>
              {organizationOptions.map((org) => (
                <option key={org.id} value={org.id}>
                  {[org.orgCode, org.name].filter(Boolean).join(" | ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input name="q" defaultValue={resolvedSearchParams?.q ?? ""} placeholder="Account, org, or month" />
          </label>
          <label className="checkboxLabel">
            <input name="negativeOnly" type="checkbox" value="1" defaultChecked={negativeOnly} />
            Needs variance
          </label>
          <button className="buttonLink" type="submit">
            Apply
          </button>
          {(queryText || negativeOnly || organizationId) ? (
            <Link className="buttonLink" href={`/institutional-budget?fiscalYearId=${encodeURIComponent(fiscalYearId)}&view=${viewMode}`}>
              Clear filters
            </Link>
          ) : null}
        </form>
      </article>

      <article className="panel">
        <div className="sectionHeader compactHeader">
          <div>
            <p className="eyebrow">Revenue reporting</p>
            <h2>Targets and Received Revenue</h2>
          </div>
        </div>
        <p className="heroSubtitle">Revenue offsets its target for reporting but is never available to spend.</p>
        <div className="revenueSummaryStrip" aria-label="Revenue performance summary">
          <div><span>Target</span><strong>{formatCurrency(revenueTotals.target)}</strong></div>
          <div><span>Received</span><strong>{formatCurrency(revenueTotals.received)}</strong></div>
          <div><span>Remaining</span><strong>{formatCurrency(revenueTotals.remaining)}</strong></div>
          <div><span>Over target</span><strong>{formatCurrency(revenueTotals.over)}</strong></div>
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
              {revenueRows.length === 0 ? (
                <tr><td colSpan={7}>No institutional revenue targets in this scope.</td></tr>
              ) : null}
              {revenueRows.map((row) => (
                <tr key={`${row.fiscal_year_id}:${row.organization_id}:${row.account_code}`}>
                  <td>{row.fiscal_year_name ?? "-"}</td>
                  <td>{row.org_code ?? "-"} | {row.organization_name ?? "Organization"}</td>
                  <td>{row.account_code ?? "-"} | {row.account_name ?? "Revenue"}</td>
                  <td>{formatCurrency(asNumber(row.target_amount))}</td>
                  <td>
                    <strong>{formatCurrency(asNumber(row.received_amount))}</strong>
                    <div className="revenueProgress" aria-label={`${Math.round(Math.min(100, asNumber(row.target_amount) > 0 ? (asNumber(row.received_amount) / asNumber(row.target_amount)) * 100 : 0))}% of target received`}>
                      <span style={{ width: `${Math.min(100, asNumber(row.target_amount) > 0 ? (asNumber(row.received_amount) / asNumber(row.target_amount)) * 100 : 0)}%` }} />
                    </div>
                  </td>
                  <td>{formatCurrency(asNumber(row.remaining_to_target))}</td>
                  <td>{formatCurrency(asNumber(row.over_target_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <div className="sectionHeader compactHeader">
          <div>
            <p className="eyebrow">June through May</p>
            <h2>Monthly Availability Matrix</h2>
            <p className="heroSubtitle">Grouped by organization and account category. Freeze the identifying columns while reviewing each month.</p>
          </div>
          <div className="buttonCluster">
            <div className="segmentedControl" aria-label="Matrix detail level">
              <Link className={viewMode === "compact" ? "active" : ""} href={viewHref("compact")} aria-current={viewMode === "compact" ? "page" : undefined}>
                Compact
              </Link>
              <Link className={viewMode === "detail" ? "active" : ""} href={viewHref("detail")} aria-current={viewMode === "detail" ? "page" : undefined}>
                Detail
              </Link>
            </div>
            <Link className="buttonLink" href="/variance">
              Open Variance Center
            </Link>
            <button className="buttonLink buttonPrimary" form="bulkVarianceForm" type="submit">
              Create Bulk Variance
            </button>
          </div>
        </div>
        <form id="bulkVarianceForm" action={createBulkVarianceFromBucketsAction} className="institutionalBulkForm">
        <div className="tableWrap institutionalGridWrap">
          <table className={`institutionalGrid institutionalGrid-${viewMode}`}>
            <thead>
              <tr>
                {viewMode === "detail" ? <th className="stickyCol stickyCol1">FY</th> : null}
                {viewMode === "detail" ? <th className="stickyCol stickyCol2">Org</th> : null}
                <th className={viewMode === "detail" ? "stickyCol stickyCol3" : "stickyCol institutionalAccountCol"}>Account</th>
                {viewMode === "detail" ? <th className="stickyCol stickyCol4">Category</th> : null}
                {monthColumns.map((month) => (
                  <th key={month.monthStart} className="monthHeader">
                    {month.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gridRows.length === 0 ? (
                <tr>
                  <td colSpan={(viewMode === "detail" ? 4 : 1) + Math.max(monthColumns.length, 1)}>No institutional monthly budget rows found.</td>
                </tr>
              ) : null}
              {gridGroups.map((group) => (
                <Fragment key={group.key}>
                  <tr className="institutionalGroupRow">
                    <th colSpan={(viewMode === "detail" ? 4 : 1) + Math.max(monthColumns.length, 1)}>
                      <strong>{group.orgCode} | {group.organizationName}</strong>
                      <span>{group.fiscalYearName} · {group.category} · {group.rows.length} account{group.rows.length === 1 ? "" : "s"}</span>
                    </th>
                  </tr>
                  {group.rows.map((gridRow) => (
                  <tr key={gridRow.key}>
                    {viewMode === "detail" ? <td className="stickyCol stickyCol1">{gridRow.fiscalYearName}</td> : null}
                    {viewMode === "detail" ? (
                      <td className="stickyCol stickyCol2">
                        <strong>{gridRow.orgCode}</strong>
                        <div className="muted">{gridRow.organizationName}</div>
                      </td>
                    ) : null}
                    <td className={viewMode === "detail" ? "stickyCol stickyCol3" : "stickyCol institutionalAccountCol"}>
                      <strong>{gridRow.accountCode}</strong>
                      <div className="muted">{gridRow.accountName}</div>
                      {gridRow.isRevenue ? <div className="statusPill status-held">Revenue target</div> : null}
                    </td>
                    {viewMode === "detail" ? <td className="stickyCol stickyCol4">{gridRow.accountCategory || "-"}</td> : null}
                    {monthColumns.map((month) => {
                      const cell = gridRow.cells.get(month.monthStart);
                      if (!cell) return <td key={month.monthStart} className="budgetMonthCell emptyMonthCell">-</td>;
                      const officialAvailable = asNumber(cell.official_available_amount);
                      const projectedAvailable = asNumber(cell.projected_available_amount);
                      const isNegative = officialAvailable < 0 || projectedAvailable < 0;
                      return (
                        <td key={month.monthStart} className={isNegative ? "budgetMonthCell negativeMonthCell" : "budgetMonthCell"}>
                          {gridRow.isRevenue ? (
                            <div className="monthAvailable muted">Not spendable</div>
                          ) : (
                            <div className={officialAvailable < 0 ? "negative monthAvailable" : "positive monthAvailable"}>
                              {formatCurrency(officialAvailable)}
                              <span>Available</span>
                            </div>
                          )}
                          {viewMode === "detail" ? (
                            <div className="monthMeta">
                              <span><b>{gridRow.isRevenue ? "Target" : "Allocated"}</b> {formatCurrency(asNumber(cell.monthly_allocation))}</span>
                              {!gridRow.isRevenue ? <span><b>Committed</b> {formatCurrency(asNumber(cell.submitted_commitments_amount))}</span> : null}
                              {!gridRow.isRevenue ? <span><b>Projected</b> {formatCurrency(projectedAvailable)}</span> : null}
                            </div>
                          ) : null}
                          {!gridRow.isRevenue && isNegative && cell.budget_plan_month_id ? (
                            <div className="varianceCellActions">
                              <label className="varianceSelectLabel">
                                <input type="checkbox" name="budgetPlanMonthId" value={cell.budget_plan_month_id} />
                                Bulk
                              </label>
                              <button
                                type="submit"
                                className="tinyButton"
                                formAction={createVarianceFromBucketAction}
                                name="singleBudgetPlanMonthId"
                                value={cell.budget_plan_month_id}
                              >
                                Create variance
                              </button>
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        </form>
      </article>
    </section>
  );
}
