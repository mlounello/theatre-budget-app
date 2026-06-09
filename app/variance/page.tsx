import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { VarianceCenterClient, type SourceCandidate, type VarianceRow } from "@/app/variance/variance-center-client";

function moneyLabel(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function VariancePage({
  searchParams
}: {
  searchParams?: Promise<{
    fiscalYearId?: string;
    sourceSearch?: string;
    allowCrossOrg?: string;
  }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const fiscalYearId = (resolvedSearchParams?.fiscalYearId ?? "").trim();
  const sourceSearch = (resolvedSearchParams?.sourceSearch ?? "").trim();
  const allowCrossOrg = resolvedSearchParams?.allowCrossOrg === "1";

  const supabase = await getSupabaseServerClient();
  let varianceQuery = supabase
    .from("variance_requests")
    .select(
      "id, status, reason, total_transfer_amount, generated_file_url, created_at, fiscal_years(name), purchases(id, title, projects(name)), variance_request_lines(id)"
    )
    .order("created_at", { ascending: false });
  if (fiscalYearId) varianceQuery = varianceQuery.eq("fiscal_year_id", fiscalYearId);
  const { data: varianceData, error: varianceError } = await varianceQuery;
  if (varianceError) throw varianceError;

  const { data: fiscalYearData, error: fiscalYearError } = await supabase
    .from("fiscal_years")
    .select("id, name")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (fiscalYearError) throw fiscalYearError;

  const { data: sourceData, error: sourceError } = await supabase.rpc("get_institutional_source_candidates", {
    p_fiscal_year_id: fiscalYearId || null,
    p_search: sourceSearch || null,
    p_allow_cross_org: allowCrossOrg
  });
  if (sourceError) throw sourceError;

  const variances: VarianceRow[] = (varianceData ?? []).map((row) => {
    const fiscalYear = row.fiscal_years as { name?: string | null } | null;
    const purchase = row.purchases as { title?: string | null; projects?: { name?: string | null } | null } | null;
    const lines = (row.variance_request_lines as Array<{ id?: string }> | null) ?? [];
    return {
      id: row.id as string,
      status: (row.status as string | null) ?? "draft",
      reason: (row.reason as string | null) ?? null,
      totalTransferAmount: moneyLabel(row.total_transfer_amount as string | number | null),
      createdAt: (row.created_at as string | null) ?? "",
      purchaseTitle: (purchase?.title as string | null | undefined) ?? null,
      projectName: (purchase?.projects?.name as string | null | undefined) ?? null,
      fiscalYearName: (fiscalYear?.name as string | null | undefined) ?? null,
      lineCount: lines.length,
      generatedFileUrl: (row.generated_file_url as string | null) ?? null
    };
  });

  type SourceCandidateRow = {
    budget_plan_month_id?: string | null;
    official_available_amount?: string | number | null;
    crosses_target_org?: boolean | null;
    fiscal_year_name?: string | null;
    org_code?: string | null;
    account_code?: string | null;
    account_name?: string | null;
    month_start?: string | null;
  };

  const sourceCandidates: SourceCandidate[] = ((sourceData ?? []) as SourceCandidateRow[]).map((row) => ({
    budgetPlanMonthId: row.budget_plan_month_id as string,
    available: moneyLabel(row.official_available_amount as string | number | null),
    crossesTargetOrg: Boolean(row.crosses_target_org),
    label: [
      row.fiscal_year_name,
      row.org_code,
      row.account_code,
      row.account_name,
      row.month_start ? String(row.month_start).slice(0, 7) : null
    ]
      .filter(Boolean)
      .join(" | ")
  }));

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Institutional Budget</p>
        <h1>Variance Center</h1>
        <p className="heroSubtitle">
          Review shortage-triggered variance drafts, choose source buckets manually, and move requests through review, approval, and posting.
        </p>
      </header>

      <article className="panel">
        <h2>Source Bucket Search</h2>
        <form className="panelGrid">
          <label>
            Fiscal Year
            <select name="fiscalYearId" defaultValue={fiscalYearId}>
              <option value="">All fiscal years</option>
              {(fiscalYearData ?? []).map((fy) => (
                <option key={fy.id as string} value={fy.id as string}>
                  {fy.name as string}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input name="sourceSearch" defaultValue={sourceSearch} placeholder="FY, org, account, or month" />
          </label>
          <label className="checkboxLabel">
            <input name="allowCrossOrg" type="checkbox" value="1" defaultChecked={allowCrossOrg} />
            Include cross-org sources
          </label>
          <button className="buttonLink" type="submit">
            Search Sources
          </button>
        </form>
      </article>

      <VarianceCenterClient variances={variances} sourceCandidates={sourceCandidates} canApprove={access.role === "admin"} />
    </section>
  );
}
