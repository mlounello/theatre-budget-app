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
      "id, status, reason, total_transfer_amount, generated_file_url, created_at, target_budget_plan_month_id, fiscal_years(name), purchases(id, title, projects(name)), variance_request_lines(id)"
    )
    .order("created_at", { ascending: false });
  if (fiscalYearId) varianceQuery = varianceQuery.eq("fiscal_year_id", fiscalYearId);
  const { data: varianceData, error: varianceError } = await varianceQuery;
  if (varianceError) throw varianceError;

  const targetBucketIds = [
    ...new Set(
      (varianceData ?? [])
        .map((row) => (row.target_budget_plan_month_id as string | null) ?? null)
        .filter((id): id is string => Boolean(id))
    )
  ];
  const { data: targetBucketData, error: targetBucketError } =
    targetBucketIds.length > 0
      ? await supabase
          .from("v_institutional_monthly_budget_availability")
          .select("budget_plan_month_id, fiscal_year_id, organization_id, org_code, account_code, account_name, month_start, official_available_amount")
          .in("budget_plan_month_id", targetBucketIds)
      : { data: [], error: null };
  if (targetBucketError) throw targetBucketError;
  const targetBucketById = new Map(
    ((targetBucketData ?? []) as Array<{
      budget_plan_month_id?: string | null;
      fiscal_year_id?: string | null;
      organization_id?: string | null;
      org_code?: string | null;
      account_code?: string | null;
      account_name?: string | null;
      month_start?: string | null;
      official_available_amount?: string | number | null;
    }>).map((row) => [row.budget_plan_month_id as string, row] as const)
  );

  const varianceIds = ((varianceData ?? []) as Array<{ id?: string | null }>).map((row) => row.id).filter((id): id is string => Boolean(id));
  const { data: sourceLineData, error: sourceLineError } =
    varianceIds.length > 0
      ? await supabase
          .from("variance_request_lines")
          .select("id, variance_request_id, from_budget_plan_month_id, transfer_amount, narrative, cross_org_override, created_at")
          .in("variance_request_id", varianceIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };
  if (sourceLineError) throw sourceLineError;

  const sourceLineBucketIds = [
    ...new Set(
      ((sourceLineData ?? []) as Array<{ from_budget_plan_month_id?: string | null }>)
        .map((row) => row.from_budget_plan_month_id ?? null)
        .filter((id): id is string => Boolean(id))
    )
  ];
  const { data: sourceLineBucketData, error: sourceLineBucketError } =
    sourceLineBucketIds.length > 0
      ? await supabase
          .from("v_institutional_monthly_budget_availability")
          .select("budget_plan_month_id, org_code, account_code, account_name, month_start")
          .in("budget_plan_month_id", sourceLineBucketIds)
      : { data: [], error: null };
  if (sourceLineBucketError) throw sourceLineBucketError;
  const sourceLineBucketById = new Map(
    ((sourceLineBucketData ?? []) as Array<{
      budget_plan_month_id?: string | null;
      org_code?: string | null;
      account_code?: string | null;
      account_name?: string | null;
      month_start?: string | null;
    }>).map((row) => [row.budget_plan_month_id as string, row] as const)
  );
  const linesByVarianceId = new Map<string, VarianceRow["sourceLines"]>();
  for (const line of (sourceLineData ?? []) as Array<{
    id?: string | null;
    variance_request_id?: string | null;
    from_budget_plan_month_id?: string | null;
    transfer_amount?: string | number | null;
    narrative?: string | null;
    cross_org_override?: boolean | null;
  }>) {
    const varianceRequestId = line.variance_request_id ?? "";
    const bucket = sourceLineBucketById.get(line.from_budget_plan_month_id ?? "");
    const sourceLine = {
      id: line.id ?? "",
      budgetPlanMonthId: line.from_budget_plan_month_id ?? "",
      label: bucket
        ? [bucket.org_code, bucket.account_code, bucket.account_name, bucket.month_start ? String(bucket.month_start).slice(0, 7) : null]
            .filter(Boolean)
            .join(" | ")
        : "Source bucket",
      amount: moneyLabel(line.transfer_amount),
      narrative: line.narrative ?? null,
      crossOrgOverride: Boolean(line.cross_org_override)
    };
    if (!linesByVarianceId.has(varianceRequestId)) linesByVarianceId.set(varianceRequestId, []);
    linesByVarianceId.get(varianceRequestId)!.push(sourceLine);
  }

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
    const targetBucket = targetBucketById.get((row.target_budget_plan_month_id as string | null) ?? "");
    const targetShortage = targetBucket
      ? Math.abs(Math.min(moneyLabel(targetBucket.official_available_amount), 0))
      : moneyLabel(row.total_transfer_amount as string | number | null);
    const sourceLines = linesByVarianceId.get(row.id as string) ?? [];
    const totalSourced = sourceLines.reduce((sum, line) => sum + line.amount, 0);
    return {
      id: row.id as string,
      status: (row.status as string | null) ?? "draft",
      reason: (row.reason as string | null) ?? null,
      totalTransferAmount: moneyLabel(row.total_transfer_amount as string | number | null),
      targetShortage,
      totalSourced,
      createdAt: (row.created_at as string | null) ?? "",
      purchaseTitle: (purchase?.title as string | null | undefined) ?? null,
      projectName: (purchase?.projects?.name as string | null | undefined) ?? null,
      fiscalYearName: (fiscalYear?.name as string | null | undefined) ?? null,
      targetFiscalYearId: (targetBucket?.fiscal_year_id as string | null | undefined) ?? null,
      targetOrganizationId: (targetBucket?.organization_id as string | null | undefined) ?? null,
      targetLabel: targetBucket
        ? [targetBucket.org_code, targetBucket.account_code, targetBucket.account_name, targetBucket.month_start ? String(targetBucket.month_start).slice(0, 7) : null]
            .filter(Boolean)
            .join(" | ")
        : null,
      lineCount: lines.length,
      sourceLines,
      generatedFileUrl: (row.generated_file_url as string | null) ?? null
    };
  });

  type SourceCandidateRow = {
    budget_plan_month_id?: string | null;
    fiscal_year_id?: string | null;
    fiscal_year_name?: string | null;
    organization_id?: string | null;
    org_code?: string | null;
    organization_name?: string | null;
    account_code?: string | null;
    account_name?: string | null;
    month_start?: string | null;
    official_available_amount?: string | number | null;
    crosses_target_org?: boolean | null;
  };

  const sourceCandidates: SourceCandidate[] = ((sourceData ?? []) as SourceCandidateRow[]).map((row) => ({
    budgetPlanMonthId: row.budget_plan_month_id as string,
    fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
    fiscalYearName: (row.fiscal_year_name as string | null) ?? null,
    organizationId: (row.organization_id as string | null) ?? null,
    orgCode: (row.org_code as string | null) ?? null,
    organizationName: (row.organization_name as string | null) ?? null,
    accountCode: (row.account_code as string | null) ?? null,
    accountName: (row.account_name as string | null) ?? null,
    monthStart: (row.month_start as string | null) ?? null,
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
