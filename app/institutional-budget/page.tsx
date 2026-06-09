import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access";
import { formatCurrency } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type MonthlyBudgetRow = {
  fiscal_year_id?: string | null;
  fiscal_year_name?: string | null;
  organization_id?: string | null;
  org_code?: string | null;
  organization_name?: string | null;
  account_code_id?: string | null;
  account_code?: string | null;
  account_name?: string | null;
  month_start?: string | null;
  monthly_allocation?: string | number | null;
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

export default async function InstitutionalBudgetPage({
  searchParams
}: {
  searchParams?: Promise<{
    fiscalYearId?: string;
    organizationId?: string;
    q?: string;
  }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const fiscalYearId = (resolvedSearchParams?.fiscalYearId ?? "").trim();
  const organizationId = (resolvedSearchParams?.organizationId ?? "").trim();
  const queryText = (resolvedSearchParams?.q ?? "").trim().toLowerCase();

  const supabase = await getSupabaseServerClient();
  const [{ data: fiscalYearData, error: fiscalYearError }, { data: organizationData, error: organizationError }] = await Promise.all([
    supabase.from("fiscal_years").select("id, name").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase
      .from("organizations")
      .select("id, org_code, name, fiscal_year_id")
      .order("org_code", { ascending: true })
      .order("name", { ascending: true })
  ]);
  if (fiscalYearError) throw fiscalYearError;
  if (organizationError) throw organizationError;

  let query = supabase
    .from("v_institutional_monthly_budget_availability")
    .select(
      "fiscal_year_id, fiscal_year_name, organization_id, org_code, organization_name, account_code_id, account_code, account_name, month_start, monthly_allocation, submitted_commitments_amount, approved_incoming_variance_amount, approved_outgoing_variance_amount, official_available_amount, projected_available_amount"
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
  });

  const fiscalYearOptions = ((fiscalYearData ?? []) as Array<{ id?: string; name?: string | null }>).filter((fy) => fy.id);
  const organizationOptions = ((organizationData ?? []) as Array<{
    id?: string;
    org_code?: string | null;
    name?: string | null;
    fiscal_year_id?: string | null;
  }>).filter((org) => org.id && (!fiscalYearId || org.fiscal_year_id === fiscalYearId || org.fiscal_year_id === null));

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
                  {fy.name ?? "Fiscal Year"}
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
          <button className="buttonLink" type="submit">
            Apply
          </button>
        </form>
      </article>

      <article className="panel">
        <div className="sectionHeader compactHeader">
          <div>
            <p className="eyebrow">FY / Org / Account / Month</p>
            <h2>Institutional Availability</h2>
          </div>
          <Link className="buttonLink" href="/variance">
            Open Variance Center
          </Link>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>FY</th>
                <th>Org</th>
                <th>Account</th>
                <th>Month</th>
                <th>Allocation</th>
                <th>Commitments</th>
                <th>Approved In</th>
                <th>Approved Out</th>
                <th>Official Available</th>
                <th>Projected Available</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10}>No institutional monthly budget rows found.</td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const officialAvailable = asNumber(row.official_available_amount);
                const projectedAvailable = asNumber(row.projected_available_amount);
                return (
                  <tr key={`${row.fiscal_year_id}:${row.organization_id}:${row.account_code_id}:${row.month_start}`}>
                    <td>{row.fiscal_year_name ?? "-"}</td>
                    <td>
                      {row.org_code ?? "-"}
                      <div>{row.organization_name ?? ""}</div>
                    </td>
                    <td>
                      {row.account_code ?? "-"}
                      <div>{row.account_name ?? ""}</div>
                    </td>
                    <td>{row.month_start ? String(row.month_start).slice(0, 7) : "-"}</td>
                    <td>{formatCurrency(asNumber(row.monthly_allocation))}</td>
                    <td>{formatCurrency(asNumber(row.submitted_commitments_amount))}</td>
                    <td>{formatCurrency(asNumber(row.approved_incoming_variance_amount))}</td>
                    <td>{formatCurrency(asNumber(row.approved_outgoing_variance_amount))}</td>
                    <td className={officialAvailable < 0 ? "negative" : "positive"}>{formatCurrency(officialAvailable)}</td>
                    <td className={projectedAvailable < 0 ? "negative" : "positive"}>{formatCurrency(projectedAvailable)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
