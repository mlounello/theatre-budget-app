import Link from "next/link";
import { redirect } from "next/navigation";
import { createBulkVarianceFromBucketsAction, createVarianceFromBucketAction } from "@/app/institutional-budget/actions";
import { getAccessContext } from "@/lib/access";
import { formatCurrency } from "@/lib/format";
import { resolveRequestedFiscalYearId } from "@/lib/fiscal-year-context";
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

  const supabase = await getSupabaseServerClient();
  const [{ data: fiscalYearData, error: fiscalYearError }, { data: organizationData, error: organizationError }] = await Promise.all([
    supabase
      .from("fiscal_years")
      .select("id, name, start_date, end_date, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("organizations")
      .select("id, org_code, name, fiscal_year_id")
      .order("org_code", { ascending: true })
      .order("name", { ascending: true })
  ]);
  if (fiscalYearError) throw fiscalYearError;
  if (organizationError) throw organizationError;

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

  let query = supabase
    .from("v_institutional_monthly_budget_availability")
    .select(
      "fiscal_year_id, fiscal_year_name, organization_id, org_code, organization_name, account_code_id, account_code, account_category, account_name, budget_plan_month_id, month_start, fiscal_month_index, monthly_allocation, commitment_count, submitted_commitments_amount, approved_incoming_variance_amount, approved_outgoing_variance_amount, official_available_amount, projected_available_amount"
    )
    .order("fiscal_year_name", { ascending: true })
    .order("org_code", { ascending: true })
    .order("account_code", { ascending: true })
    .order("month_start", { ascending: true });

  if (fiscalYearId) query = query.eq("fiscal_year_id", fiscalYearId);
  if (organizationId) query = query.eq("organization_id", organizationId);

  const { data, error } = await query;
  if (error) throw error;

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

  const organizationOptions = ((organizationData ?? []) as Array<{
    id?: string;
    org_code?: string | null;
    name?: string | null;
    fiscal_year_id?: string | null;
  }>).filter((org) => org.id && (!fiscalYearId || org.fiscal_year_id === fiscalYearId || org.fiscal_year_id === null));
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
    cells: Map<string, MonthlyBudgetRow>;
  }>());
  const gridRows = Array.from(groupedRows.values()).sort((a, b) =>
    a.fiscalYearName.localeCompare(b.fiscalYearName) ||
    a.orgCode.localeCompare(b.orgCode) ||
    a.accountCode.localeCompare(b.accountCode)
  );

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Institutional Budget</p>
        <h1>Monthly Budget View</h1>
        <p className="heroSubtitle">
          Official availability includes monthly allocation, submitted commitments, and approved or posted variances. Projected availability also includes pending variance lines.
        </p>
      </header>

      <article className="panel">
        <h2>Filters</h2>
        <form className="panelGrid">
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
                  {[org.org_code, org.name].filter(Boolean).join(" | ")}
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
        </form>
      </article>

      <article className="panel">
        <div className="sectionHeader compactHeader">
          <div>
            <p className="eyebrow">FY / Org / Account</p>
            <h2>Institutional Availability</h2>
          </div>
          <div className="buttonCluster">
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
          <table className="institutionalGrid">
            <thead>
              <tr>
                <th className="stickyCol stickyCol1">FY</th>
                <th className="stickyCol stickyCol2">Org</th>
                <th className="stickyCol stickyCol3">Account</th>
                <th className="stickyCol stickyCol4">Category</th>
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
                  <td colSpan={4 + Math.max(monthColumns.length, 1)}>No institutional monthly budget rows found.</td>
                </tr>
              ) : null}
              {gridRows.map((gridRow) => {
                return (
                  <tr key={gridRow.key}>
                    <td className="stickyCol stickyCol1">{gridRow.fiscalYearName}</td>
                    <td className="stickyCol stickyCol2">
                      <strong>{gridRow.orgCode}</strong>
                      <div className="muted">{gridRow.organizationName}</div>
                    </td>
                    <td className="stickyCol stickyCol3">
                      <strong>{gridRow.accountCode}</strong>
                      <div className="muted">{gridRow.accountName}</div>
                    </td>
                    <td className="stickyCol stickyCol4">{gridRow.accountCategory || "-"}</td>
                    {monthColumns.map((month) => {
                      const cell = gridRow.cells.get(month.monthStart);
                      if (!cell) return <td key={month.monthStart} className="budgetMonthCell emptyMonthCell">-</td>;
                      const officialAvailable = asNumber(cell.official_available_amount);
                      const projectedAvailable = asNumber(cell.projected_available_amount);
                      const isNegative = officialAvailable < 0 || projectedAvailable < 0;
                      return (
                        <td key={month.monthStart} className={isNegative ? "budgetMonthCell negativeMonthCell" : "budgetMonthCell"}>
                          <div className={officialAvailable < 0 ? "negative monthAvailable" : "positive monthAvailable"}>
                            {formatCurrency(officialAvailable)}
                          </div>
                          <div className="monthMeta">
                            <span>Alloc {formatCurrency(asNumber(cell.monthly_allocation))}</span>
                            <span>Commit {formatCurrency(asNumber(cell.submitted_commitments_amount))}</span>
                          </div>
                          {isNegative && cell.budget_plan_month_id ? (
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
                );
              })}
            </tbody>
          </table>
        </div>
        </form>
      </article>
    </section>
  );
}
